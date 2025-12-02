// server.js
const express = require('express');
require().dotenv('.env');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const qs = require('qs');

const app = express();

const CLIENT_KEY = process.env.CLIENT_KEY;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

let USER_ACCESS_TOKEN = null;

app.use(cookieParser());
app.use(cors());
app.use(express.json());

/* -----------------------------------------------------
   1) LOGIN CON TIKTOK
----------------------------------------------------- */
app.get('/login/tiktok', (_, res) => {
    const state = Math.random().toString(36).slice(2);

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

/* -----------------------------------------------------
   2) CALLBACK: CODE → ACCESS TOKEN
----------------------------------------------------- */
app.get('/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) return res.status(400).send("No se recibió el code.");

    try {
        const body = qs.stringify({
            client_key: CLIENT_KEY,
            client_secret: CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: REDIRECT_URI
        });

        const tokenRes = await axios.post(
            "https://open.tiktokapis.com/v2/oauth/token/",
            body,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        USER_ACCESS_TOKEN =
            tokenRes.data?.data?.access_token ||
            tokenRes.data?.access_token;

        console.log("USER ACCESS TOKEN:", USER_ACCESS_TOKEN);

        res.send("Login correcto ✔ Ahora puedes llamar /tiktok/user-stats");
    } catch (err) {
        console.error("TOKEN ERROR:", err.response?.data || err.message);
        res.status(500).send("Error en callback");
    }
});

/* -----------------------------------------------------
   3) OBTENER FOLLOWER COUNT, LIKES, ETC.
----------------------------------------------------- */
app.get('/tiktok/user-stats', async (_, res) => {
    if (!USER_ACCESS_TOKEN)
        return res.status(401).send("Error: Usuario no logueado. Ve a /login/tiktok");

    try {
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
                    Authorization: `Bearer ${USER_ACCESS_TOKEN}`
                },
                params: {
                    fields: fields.join(",")
                }
            }
        );

        console.log("Respuesta TikTok v2: ", r.data);

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

    } catch (err) {
        console.error("STATS ERROR:", {
            message: err.message,
            response_data: err.response?.data,
            response_status: err.response?.status
        });
        return res.status(500).send("Error obteniendo estadísticas.");
    }
});


module.exports = app;
