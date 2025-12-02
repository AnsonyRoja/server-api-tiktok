require('dotenv').config(); // Cargar .env
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const qs = require('qs');

const app = express();

// --- Configuración desde .env ---
const CLIENT_KEY = process.env.CLIENT_KEY;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// --- Tokens en memoria (ejemplo) ---
let USER_ACCESS_TOKEN = null;
let USER_REFRESH_TOKEN = null;
let TOKEN_EXPIRES_AT = null; // timestamp de expiración

app.use(cors());
app.use(cookieParser());
app.use(express.json());

// -----------------------------------
// 1) LOGIN CON TIKTOK
// -----------------------------------
app.get('/login/tiktok', (req, res) => {
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

// -----------------------------------
// 2) CALLBACK PARA INTERCAMBIAR CODE → TOKEN
// -----------------------------------
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const savedState = req.cookies?.oauth_state;

    if (!code) return res.status(400).send("No se recibió code.");
    if (!state || state !== savedState) console.warn("⚠ State mismatch");

    try {
        const body = qs.stringify({
            client_key: CLIENT_KEY,
            client_secret: CLIENT_SECRET,
            code,
            grant_type: "authorization_code",
            redirect_uri: REDIRECT_URI
        });

        const tokenResponse = await axios.post(
            "https://open.tiktokapis.com/v2/oauth/token/",
            body,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const data = tokenResponse.data?.data || {};

        USER_ACCESS_TOKEN = data.access_token;
        USER_REFRESH_TOKEN = data.refresh_token;
        TOKEN_EXPIRES_AT = Date.now() + (data.expires_in || 3600) * 1000; // ms

        console.log("Tokens obtenidos:", data);

        res.send("Login exitoso ✔ User access token guardado en servidor.");
    } catch (err) {
        console.error("Error token exchange:", err.response?.data || err.message);
        res.status(500).send("Error intercambiando el code.");
    }
});

// -----------------------------------
// 3) FUNCION PARA REFRESCAR TOKEN
// -----------------------------------
async function refreshTokenIfNeeded() {
    if (!USER_REFRESH_TOKEN) throw new Error("No hay refresh token disponible");
    if (TOKEN_EXPIRES_AT && Date.now() < TOKEN_EXPIRES_AT - 60000) return; // aún válido

    try {
        const body = qs.stringify({
            client_key: CLIENT_KEY,
            client_secret: CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: USER_REFRESH_TOKEN
        });

        const r = await axios.post(
            "https://open.tiktokapis.com/v2/oauth/refresh_token/",
            body,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        const data = r.data?.data || {};
        USER_ACCESS_TOKEN = data.access_token;
        USER_REFRESH_TOKEN = data.refresh_token;
        TOKEN_EXPIRES_AT = Date.now() + (data.expires_in || 3600) * 1000;

        console.log("Token refrescado:", data);
    } catch (err) {
        console.error("Error refrescando token:", err.response?.data || err.message);
        throw err;
    }
}

// -----------------------------------
// 4) ENDPOINT PARA STATS DEL USUARIO
// -----------------------------------
app.get('/tiktok/user-stats', async (req, res) => {
    if (!USER_ACCESS_TOKEN) return res.status(401).send("Usuario no logueado. Ve a /login/tiktok");

    try {
        // refrescar token si expiró
        await refreshTokenIfNeeded();

        const fields = [
            "follower_count",
            "following_count",
            "likes_count",
            "video_count",
            "display_name",
            "avatar_url",
            "username"
        ];

        const r = await axios.get(
            "https://open.tiktokapis.com/v2/user/info/",
            {
                headers: { Authorization: `Bearer ${USER_ACCESS_TOKEN}` },
                params: { fields: fields.join(",") }
            }
        );

        const stats = r.data?.data?.user || {};
        res.json({
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
        res.status(500).send("Error obteniendo estadísticas.");
    }
});



module.exports = app;
