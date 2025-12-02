// server.js (o index.js)
const express = require('express');
const axios = require('axios');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const qs = require('qs'); // npm i qs

const app = express();

const CLIENT_KEY = process.env.CLIENT_KEY || "aw0gu0r5pw4s8f8z";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "yjuDDzr59AqlXuA5JjXcMKD85NmpLvN7";
const REDIRECT_URI = process.env.REDIRECT_URI || "https://server-api-tiktok.vercel.app/callback";

// tokens en memoria (para ejemplo). En producción guarda en DB/secret store.
let USER_ACCESS_TOKEN = null;
let CLIENT_ACCESS_TOKEN = null;

app.use(cookieParser());
app.use(cors()); // <- IMPORTANTE: ejecutar la función

app.get('/login/tiktok', (req, res) => {
    const state = Math.random().toString(36).slice(2);
    const scope = 'user.info.profile'; // o los scopes que necesites
    const authUrl = 'https://www.tiktok.com/auth/authorize' +
        `?client_key=${encodeURIComponent(CLIENT_KEY)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scope)}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&state=${encodeURIComponent(state)}`;

    res.cookie('oauth_state', state, { httpOnly: true, secure: true });
    return res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;
    const savedState = req.cookies?.oauth_state;

    if (!code) return res.status(400).send('No se recibió code.');
    if (!state || state !== savedState) {
        // opcional: validar state para evitar CSRF
        console.warn('State mismatch (posible CSRF).');
    }

    try {
        // INTERCAMBIO: enviar form-urlencoded en el body (no params)
        const body = qs.stringify({
            client_key: CLIENT_KEY,
            client_secret: CLIENT_SECRET,
            code: code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI
        });

        const tokenResponse = await axios.post(
            'https://open.tiktokapis.com/v2/oauth/token/',
            body,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        // La respuesta puede contener access_token, open_id, expires_in...
        USER_ACCESS_TOKEN = tokenResponse.data?.data?.access_token || tokenResponse.data?.access_token;
        console.log('TOKEN RESPONSE:', tokenResponse.data);
        return res.send(`User access token obtenido. Ahora puedes usar endpoints autorizados.`);
    } catch (err) {
        console.error('Error token exchange:', err.response ? err.response.data : err.message);
        return res.status(500).send('Error intercambiando el código. Mira logs del servidor.');
    }
});

/* OPCIONAL: endpoint para obtener client access token (grant_type=client_credentials)
   Necesario para Research API (followers) que pide client token en Authorization header. */
app.get('/client-token', async (req, res) => {
    try {
        const body = qs.stringify({
            client_key: CLIENT_KEY,
            client_secret: CLIENT_SECRET,
            grant_type: 'client_credentials'
        });

        const r = await axios.post(
            'https://open.tiktokapis.com/v2/oauth/token/',
            body,
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        CLIENT_ACCESS_TOKEN = r.data?.data?.access_token || r.data?.access_token;
        console.log('Client token response:', r.data);
        res.json({ client_access_token: CLIENT_ACCESS_TOKEN });
    } catch (err) {
        console.error('Error getting client token:', err.response ? err.response.data : err.message);
        res.status(500).send('Error obteniendo client token.');
    }
});

/* Endpoint para traer followers usando Research API (POST)
   Requiere: scope research.data.basic y Authorization: Bearer <client_token>
*/
app.post('/research/followers', express.json(), async (req, res) => {
    const { username, max_count = 50, cursor } = req.body;
    if (!CLIENT_ACCESS_TOKEN) return res.status(401).send('Client token no disponible. Llama /client-token primero.');

    try {
        const r = await axios.post(
            'https://open.tiktokapis.com/v2/research/user/followers/',
            { username, max_count, cursor },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CLIENT_ACCESS_TOKEN}`
                }
            }
        );

        return res.json(r.data);
    } catch (err) {
        console.error('Error Research followers:', err.response ? err.response.data : err.message);
        return res.status(500).send('Error obteniendo followers. Mira logs del servidor.');
    }
});

module.exports = app;
