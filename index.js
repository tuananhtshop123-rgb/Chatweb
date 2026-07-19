const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let rooms = {}; // Quản lý phòng
let chatHistory = []; 

io.on('connection', (socket) => {
    // Đăng nhập
    socket.on('join', (data) => {
        socket.playerName = data.name;
        socket.playerColor = data.color;
        // Mặc định vào sảnh chờ, chưa vào phòng
    });

    // Tạo phòng
    socket.on('createRoom', () => {
        const code = Math.floor(10000 + Math.random() * 90000).toString();
        rooms[code] = { players: {}, zombies: [], wave: 1 };
        socket.join(code);
        socket.roomId = code;
        rooms[code].players[socket.id] = { id: socket.id, name: socket.playerName, color: socket.playerColor, x: 400, y: 300, chat: "" };
        socket.emit('roomCreated', code);
    });

    // Tham gia phòng
    socket.on('joinRoom', (code) => {
        if(rooms[code]) {
            socket.join(code);
            socket.roomId = code;
            rooms[code].players[socket.id] = { id: socket.id, name: socket.playerName, color: socket.playerColor, x: 400, y: 300, chat: "" };
            io.to(code).emit('update', rooms[code].players);
        }
    });

    // Di chuyển
    socket.on('move', (pos) => {
        if(socket.roomId && rooms[socket.roomId] && rooms[socket.roomId].players[socket.id]) {
            rooms[socket.roomId].players[socket.id].x = pos.x;
            rooms[socket.roomId].players[socket.id].y = pos.y;
            io.to(socket.roomId).emit('update', rooms[socket.roomId].players);
        }
    });

    // Chat
    socket.on('chat', (msg) => {
        if(socket.roomId) {
            const entry = { name: socket.playerName, msg: msg };
            chatHistory.push(entry);
            io.to(socket.roomId).emit('newChat', entry);
        }
    });

    socket.on('disconnect', () => {
        if(socket.roomId && rooms[socket.roomId]) {
            delete rooms[socket.roomId].players[socket.id];
            io.to(socket.roomId).emit('update', rooms[socket.roomId].players);
        }
    });
});

server.listen(3000, () => console.log('Server chạy cổng 3000'));