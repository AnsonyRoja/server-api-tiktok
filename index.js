// index.js
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();
const qs = require('qs');

const app = express();
const url = require('url');
const { getRedis } = require('./_lib/getRedis');
const CLIENT_KEY = process.env.CLIENT_KEY;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;


app.use(cookieParser());
app.use(cors());
app.use(express.json());


// Renovación y actualización de tokens
async function refreshToken() {
    const redis = await getRedis()
    const REFRESH_TOKEN = await redis.get("tiktok_refresh_token");

    if (!REFRESH_TOKEN) throw new Error("No hay refresh token disponible");

    try {
        const body = qs.stringify({
            client_key: CLIENT_KEY,
            grant_type: "refresh_token",
            refresh_token: REFRESH_TOKEN
        });

        console.log("cuerpo", body);

        const tokenRes = await axios.post(
            "https://open.tiktokapis.com/v2/oauth/refresh_token/",
            body,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        console.log("valor de tokenRes", tokenRes.data);
        const data = tokenRes.data;
        console.log(data);

        await redis.set("tiktok_access_token", data.access_token);
        await redis.set("tiktok_refresh_token", data.refresh_token);

        console.log("♻ TOKEN REFRESCADO");
        console.log("🔑 Nuevo ACCESS:", data.access_token);
        console.log("🔄 Nuevo REFRESH:", data.refresh_token);

        return data.access_token;
    } catch (err) {
        console.error("REFRESH ERROR:", err.response?.data || err.message);
        throw new Error("Error renovando token");
    }
}

// 1) LOGIN CON TIKTOK

app.get('/login/tiktok', (_, res) => {
    const state = Math.random().toString(36).slice(2);
    res.cookie('csrfState', state, { maxAge: 60000 });

    const scope = "user.info.stats,user.info.profile,user.info.basic";

    const authUrl =
        "https://www.tiktok.com/v2/auth/authorize/" +
        `?client_key=${encodeURIComponent(CLIENT_KEY)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scope)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&state=${encodeURIComponent(state)}`;

    res.cookie("oauth_state", state, { httpOnly: true, secure: true });
    res.redirect(authUrl);
});


// 2) CALLBACK: CODE → ACCESS TOKEN

app.get('/callback', async (req, res) => {
    const parsed = url.parse(req.originalUrl, true);
    const code = parsed.query.code;
    const redis = await getRedis()


    console.log("CODE:", code);

    const decodedCode = decodeURIComponent(code);


    if (!code) return res.status(400).send("No se recibió el code.");

    try {

        const body = qs.stringify({
            client_key: CLIENT_KEY,
            client_secret: CLIENT_SECRET,
            code: decodedCode,
            grant_type: "authorization_code",
            redirect_uri: REDIRECT_URI
        });

        console.log("cuerpo", body);

        const tokenRes = await axios.post(
            "https://open.tiktokapis.com/v2/oauth/token/",
            body,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        console.log("Respuesta completa de TikTok:", tokenRes.data);


        const data = tokenRes.data.access_token !== undefined ? tokenRes.data : tokenRes.data?.data;
        await redis.set("tiktok_access_token", data.access_token);
        await redis.set("tiktok_refresh_token", data.refresh_token);

        console.log("🔑 Nuevo ACCESS TOKEN:",);
        console.log("♻ Nuevo REFRESH TOKEN:",);




        res.send("Login correcto ✔ Ya puedes usar /tiktok/user-stats");
    } catch (err) {
        console.error("TOKEN ERROR:", err.response?.data || err.message);
        res.status(500).send("Error en callback");
    }
});

// Traer la informacion del usuario logeado de tiktok
const getUserStatsForTiktok = async (res, USER_ACCESS_TOKENS) => {


    const fields = [
        "follower_count",
        "following_count",
        "likes_count",
        "video_count",
        "display_name",
        "avatar_url",
        "username"
    ];

    // GET al endpoint v2 correcto
    const r = await axios.get(
        "https://open.tiktokapis.com/v2/user/info/",
        {
            headers: {
                Authorization: `Bearer ${USER_ACCESS_TOKENS}`
            },
            params: {
                fields: fields.join(",")
            }
        }
    );

    console.log("✅ Respuesta TikTok v2:", r.data);

    const stats = r.data?.data?.user || {};

    return res.json({
        follower_count: stats.follower_count,
        following_count: stats.following_count,
        likes_count: stats.likes_count,
        video_count: stats.video_count,
        display_name: stats.display_name,
        avatar_url: stats.avatar_url,
        username: stats.username
    });
}


//  3) OBTENER FOLLOWER COUNT, LIKES, ETC.

app.get('/tiktok/user-stats', async (_, res) => {
    const redis = await getRedis()

    let token = await redis.get("tiktok_access_token");

    if (!token) {

        return res.status(401).send("Error: Usuario no logueado. Ve a /login/tiktok");
    }

    try {

        return await getUserStatsForTiktok(res, token);

    } catch (err) {

        if (err.response?.status === 401) {
            const newToken = await refreshToken();

            return await getUserStatsForTiktok(res, newToken);

        } else {
            console.error("STATS ERROR:", {
                message: err.message,
                response_data: err.response?.data,
                response_status: err.response?.status
            });
            return res.status(500).send("Error obteniendo estadísticas.");
        }
    }

});


module.exports = app;
