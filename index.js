const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let chatHistory = []; // Lưu lại lịch sử chat

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        players[socket.id] = { id: socket.id, name: data.name, color: data.color, x: 400, y: 300, chat: "" };
        socket.emit('initChat', chatHistory); // Gửi lịch sử chat cho người mới
        io.emit('update', players);
    });

    socket.on('move', (pos) => {
        if (players[socket.id]) {
            players[socket.id].x = pos.x;
            players[socket.id].y = pos.y;
            io.emit('update', players);
        }
    });

    socket.on('chat', (msg) => {
        if (players[socket.id]) {
            const entry = { name: players[socket.id].name, msg: msg };
            chatHistory.push(entry);
            if(chatHistory.length > 20) chatHistory.shift();
            players[socket.id].chat = msg;
            io.emit('update', players);
            io.emit('newChat', entry);
            // Sau 4 giây thì xóa chữ trên đầu
            setTimeout(() => { if(players[socket.id]) players[socket.id].chat = ""; io.emit('update', players); }, 4000);
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; io.emit('update', players); });
});

server.listen(3000);