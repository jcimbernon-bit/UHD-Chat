const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public')); 

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

// --- NUEVO: Seguridad del chat ---
const CLAVE_SECRETA = "Kaworu"; // Cambia esto por la contraseña que quieras

// Middleware de Socket.io para verificar la clave ANTES de conectar
io.use((socket, next) => {
    // Recibimos la clave que nos manda el frontend
    const tokenCliente = socket.handshake.auth.token;
    
    if (tokenCliente === CLAVE_SECRETA) {
        next(); // Pasa el control: el usuario entra
    } else {
        next(new Error("Acceso denegado: Clave incorrecta")); // Le cerramos la puerta
    }
});

// --- NUEVO: Aquí guardaremos los mensajes temporalmente ---
let historialMensajes = [];

io.on('connection', (socket) => {
    console.log(`🟢 Un usuario se ha conectado. ID: ${socket.id}`);

    // NUEVO: Cuando alguien entra, le enviamos el historial acumulado
    socket.emit('cargar_historial', historialMensajes);

    // Reenviar lo que se está escribiendo (como ya teníamos)
    socket.on('escribiendo', (texto) => {
        socket.broadcast.emit('escribiendo', texto); 
    });

    // NUEVO: Recibir un mensaje definitivo (al pulsar Enter)
    socket.on('mensaje_final', (datosMensaje) => {
        // Añadimos la fecha/hora actual al mensaje para el futuro borrado de 24h
        datosMensaje.timestamp = Date.now();
        
        // Lo guardamos en nuestra lista del servidor
        historialMensajes.push(datosMensaje);

        // Se lo enviamos al OTRO usuario
        socket.broadcast.emit('mensaje_final', datosMensaje);
    });

    socket.on('disconnect', () => {
        console.log(`🔴 Un usuario se ha desconectado. ID: ${socket.id}`);
    });
});

//24 horas en milisegundos
const TIEMPO_DE_VIDA = 86400000; 

// Revisar cada minuto (60000 ms) si hay mensajes viejos
setInterval(() => {
    const ahora = Date.now();
    const tamañoOriginal = historialMensajes.length;

    // Filtramos la lista: solo nos quedamos con los que NO han caducado
    historialMensajes = historialMensajes.filter(mensaje => {
        return (ahora - mensaje.timestamp) < TIEMPO_DE_VIDA;
    });

    // Si se borró algún mensaje, avisamos a los usuarios conectados para que limpien su pantalla
    if (historialMensajes.length < tamañoOriginal) {
        io.emit('actualizar_historial', historialMensajes);
        console.log("🧹 Limpieza automática: Se borraron mensajes antiguos.");
    }
}, 60000);

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Servidor de chat corriendo en http://localhost:${PORT}`);
});