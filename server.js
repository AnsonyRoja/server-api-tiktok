

const app = require('./index');




app.listen(process.env.PORT, () => {

    console.log("Servidor escuchando en el puerto 3001", process.env.PORT);

}

)