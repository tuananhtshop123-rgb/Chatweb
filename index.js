/**
 * SERVER GAME - PHIÊN BẢN MỞ RỘNG
 * Quản lý logic kết nối, phòng chat và trạng thái người chơi
 */
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Trạng thái chung của toàn bộ người chơi trong game
let players = {};
let chatHistory = []; 

io.on('connection', (socket) => {
    console.log(`[Hệ thống] Kết nối mới từ: ${socket.id}`);

    // Sự kiện người chơi tham gia
    socket.on('join', (data) => {
        players[socket.id] = { 
            id: socket.id, 
            name: data.name, 
            color: data.color, 
            x: 1000, // Spawn ở giữa map (Map mới là 2000x2000)
            y: 1000, 
            chat: "",
            isSprinting: false 
        };
        socket.emit('initChat', chatHistory); 
        io.emit('update', players);
    });

    // Cập nhật vị trí và trạng thái chạy
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].isSprinting = data.sprinting;
            io.emit('update', players);
        }
    });

    // Xử lý chat
    socket.on('chat', (msg) => {
        if (players[socket.id]) {
            const entry = { name: players[socket.id].name, msg: msg };
            chatHistory.push(entry);
            if(chatHistory.length > 20) chatHistory.shift();
            players[socket.id].chat = msg;
            io.emit('update', players);
            io.emit('newChat', entry);
            // Xóa chat trên đầu sau 4s
            setTimeout(() => { 
                if(players[socket.id]) players[socket.id].chat = ""; 
                io.emit('update', players); 
            }, 4000);
        }
    });

    // Ngắt kết nối
    socket.on('disconnect', () => { 
        delete players[socket.id]; 
        io.emit('update', players); 
    });
});

// Chạy server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server đang chạy tại port ${PORT}`));