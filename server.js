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

    
    // 1. Capturamos el nombre que el usuario nos mandará desde el login
    socket.alias = socket.handshake.auth.alias || "Usuario Desconocido";
    
    console.log(`🟢 Se ha conectado: ${socket.alias} (ID: ${socket.id})`);

    // Le enviamos el historial acumulado
    socket.emit('cargar_historial', historialMensajes);

    // Recibir un mensaje definitivo
    socket.on('mensaje_final', (datosMensaje) => {
        datosMensaje.timestamp = Date.now();
        historialMensajes.push(datosMensaje);
        socket.broadcast.emit('mensaje_final', datosMensaje);
    });

    // Escritura en vivo (lo dejamos igual)
    socket.on('escribiendo', (datos) => {
        socket.broadcast.emit('escribiendo', datos);
    });

    // --- NUEVO: Recibir y reenviar el Zumbido ---
    socket.on('zumbido', (quienLoEnvia) => {
        // Se lo enviamos a todos los DEMÁS conectados
        socket.broadcast.emit('zumbido', quienLoEnvia);
    });

    // --- NUEVO: Aviso de desconexión ---
    socket.on('disconnect', () => {
        console.log(`🔴 Se ha desconectado: ${socket.alias}`);
        // Le avisamos a todos los que siguen en el chat
        io.emit('usuario_desconectado', socket.alias);
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