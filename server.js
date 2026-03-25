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
// Middleware de Socket.io para verificar la clave y el cupo
io.use((socket, next) => {
    const tokenCliente = socket.handshake.auth.token;
    
    // 1. Verificamos la contraseña
    if (tokenCliente !== CLAVE_SECRETA) {
        return next(new Error("Acceso denegado: Clave incorrecta")); 
    }

    // 2. NUEVO: Verificamos cuántas personas hay conectadas
    // io.engine.clientsCount nos dice cuántos sockets activos hay
    if (io.engine.clientsCount >= 4) {
        return next(new Error("La sala privada está llena (Máx. 2 personas)"));
    }

    next(); // Si la clave es correcta y hay espacio, entra.
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
        // Guardamos el mensaje en el historial (viene con su ID y leido: false desde el cliente)
        historialMensajes.push(datosMensaje);
        // Se lo enviamos al OTRO usuario
        socket.broadcast.emit('mensaje_final', datosMensaje);
    });

    // --- NUEVO: Alguien leyó un mensaje ---
    socket.on('mensaje_leido', (idMensaje) => {
        // Buscamos el mensaje en el historial y lo actualizamos para que se guarde como leído
        const mensaje = historialMensajes.find(m => m.id === idMensaje);
        if (mensaje) mensaje.leido = true;
        
        // Le avisamos a la otra persona que su mensaje fue leído
        socket.broadcast.emit('mensaje_leido', idMensaje);
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