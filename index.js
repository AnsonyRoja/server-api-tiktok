const express = require('express');
const axios = require('axios'); // Para hacer peticiones HTTP
const app = express();
const CLIENT_KEY = "aw0gu0r5pw4s8f8z";
const CLIENT_SECRET = "yjuDDzr59AqlXuA5JjXcMKD85NmpLvN7";
// Asegúrate de que esta URL esté registrada en tu app de TikTok
const REDIRECT_URI = "https://server-api-tiktok-git-main-ansonys-projects.vercel.app/callback";
// Estado temporal para guardar el Access Token (solo para este ejemplo)
let ACCESS_TOKEN = null;

// A. Endpoint para Iniciar la Autenticación
app.get('/login/tiktok', (req, res) => {
    // Los 'scopes' son los permisos que solicitas (necesitas user.info.follower)
    const scopes = 'user.info.profile';

    const authUrl = `https://www.tiktok.com/auth/authorize?client_key=${CLIENT_KEY}&scope=${scopes}&response_type=code&redirect_uri=${REDIRECT_URI}`;

    // Redirige al navegador a la URL de TikTok
    res.redirect(authUrl);
});

// B. Endpoint de Callback (Paso 3: Intercambio de Código por Token)
app.get('/callback', async (req, res) => {
    const authorizationCode = req.query.code; // El código temporal que devuelve TikTok

    if (!authorizationCode) {
        return res.status(400).send("No se encontró el código de autorización.");
    }

    try {
        // Solicitud POST a TikTok para intercambiar el código por el Access Token
        const tokenResponse = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', null, {
            params: {
                client_key: CLIENT_KEY,
                client_secret: CLIENT_SECRET,
                code: authorizationCode,
                grant_type: 'authorization_code',
                redirect_uri: REDIRECT_URI
            },
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        ACCESS_TOKEN = tokenResponse.data.access_token;
        res.send(`Token de Acceso Obtenido. Ahora puedes ir a /followers/50. Token: ${ACCESS_TOKEN}`);

    } catch (error) {
        console.error('Error al obtener el token:', error.response ? error.response.data : error.message);
        res.status(500).send("Error al obtener el Access Token.");
    }
});


// C. Endpoint para Traer los Últimos 50 Seguidores
app.get('/followers/50', async (req, res) => {
    if (!ACCESS_TOKEN) {
        return res.status(401).send("Error: Access Token no disponible. Por favor, primero inicia sesión en /login/tiktok.");
    }

    try {
        const followersResponse = await axios.get('https://open.tiktokapis.com/v2/user/list/follower/', {
            headers: {
                // El Access Token debe ir en el encabezado Authorization
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            },
            params: {
                // Establecemos el límite a 50
                max_count: 50,
                // Indicamos los campos que queremos en la respuesta (el display_name es el nombre)
                fields: 'display_name,username'
            }
        });

        const followerNames = followersResponse.data.data.users.map(user => user.display_name);

        res.json({
            count: followerNames.length,
            followers: followerNames,
            // Información necesaria si quieres traer más de 50 (Paginación)
            next_cursor: followersResponse.data.data.cursor
        });

    } catch (error) {
        console.error('Error al obtener seguidores:', error.response ? error.response.data : error.message);
        res.status(500).send("Error al obtener la lista de seguidores.");
    }
});



module.exports = app;