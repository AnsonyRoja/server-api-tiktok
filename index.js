// server.js
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const qs = require('qs');

const app = express();

const CLIENT_KEY = "sbaw1j2rw1safk37du";
const CLIENT_SECRET = "xvLX67KL1QGLatKbtHRaUacLFnC0nNl6";
const REDIRECT_URI = "https://server-api-tiktok.vercel.app/callback";

// tokens en memoria (solo para demo)
let USER_ACCESS_TOKEN = null;
let CLIENT_ACCESS_TOKEN = null;

app.use(cookieParser());
app.use(cors()); // ← CORREGIDO
app.use(express.json());

/* -----------------------------------------------------
   1) LOGIN CON TIKTOK (USER CONSENT)
----------------------------------------------------- */
app.get('/login/tiktok', (req, res) => {
    const state = Math.random().toString(36).slice(2);
    const scope = "user.info.basic";

    const authUrl =
        "https://www.tiktok.com/v2/auth/authorize/" +
        `?client_key=${encodeURIComponent(CLIENT_KEY)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scope)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&state=${encodeURIComponent(state)}`;

    res.cookie('oauth_state', state, { httpOnly: true, secure: true });
    res.redirect(authUrl);
});

/* -----------------------------------------------------
   2) CALLBACK (INTERCAMBIO CODE → ACCESS TOKEN)
----------------------------------------------------- */
app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const savedState = req.cookies?.oauth_state;

    if (!code) return res.status(400).send("No se recibió el CODE.");
    if (!state || state !== savedState) {
        console.warn("⚠ STATE mismatch (posible CSRF)");
    }

    try {
        const body = qs.stringify({
            client_key: CLIENT_KEY,
            client_secret: CLIENT_SECRET,
            code: code,
            grant_type: "authorization_code",
            redirect_uri: REDIRECT_URI
        });

        const tokenResponse = await axios.post(
            "https://open.tiktokapis.com/v2/oauth/token/",
            body,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        console.log("TOKEN RESPONSE:", tokenResponse.data);

        USER_ACCESS_TOKEN =
            tokenResponse.data?.data?.access_token ||
            tokenResponse.data?.access_token;

        return res.send("User access token obtenido correctamente ✔");
    } catch (err) {
        console.error("Error en el intercambio TOKEN:", err.response?.data || err.message);
        return res.status(500).send("Error intercambiando el code.");
    }
});

/* -----------------------------------------------------
   3) OBTENER CLIENT ACCESS TOKEN (NECESARIO PARA FOLLOWERS)
----------------------------------------------------- */
app.get('/client-token', async (req, res) => {
    try {
        const body = qs.stringify({
            client_key: CLIENT_KEY,
            client_secret: CLIENT_SECRET,
            grant_type: "client_credentials"
        });

        const r = await axios.post(
            "https://open.tiktokapis.com/v2/oauth/token/",
            body,
            { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
        );

        CLIENT_ACCESS_TOKEN =
            r.data?.data?.access_token ||
            r.data?.access_token;

        console.log("CLIENT TOKEN:", r.data);
        res.json({ client_access_token: CLIENT_ACCESS_TOKEN });
    } catch (err) {
        console.error("Error obteniendo client token:", err.response?.data || err.message);
        res.status(500).send("Error obteniendo client token.");
    }
});

/* -----------------------------------------------------
   4) ENDPOINT PARA RESEARCH API (FOLLOWERS)
----------------------------------------------------- */
app.post("/research/followers", async (req, res) => {
    const { username, max_count = 50, cursor } = req.body;

    if (!CLIENT_ACCESS_TOKEN)
        return res.status(401).send("Client token no disponible. Llama a /client-token primero.");

    try {
        const r = await axios.post(
            "https://open.tiktokapis.com/v2/research/user/followers/",
            { username, max_count, cursor },
            {
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${CLIENT_ACCESS_TOKEN}`
                }
            }
        );

        return res.json(r.data);
    } catch (err) {
        console.error("Error Research followers:", err.response?.data || err.message);
        return res.status(500).send("Error trayendo followers.");
    }
});

module.exports = app;
