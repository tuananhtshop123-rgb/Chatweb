const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = {};

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        players[socket.id] = {
            id: socket.id,
            name: data.name,
            color: data.color,
            x: 400, y: 300,
            chat: ""
        };
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
            players[socket.id].chat = msg;
            io.emit('update', players);
            // Tự xóa tin nhắn sau 3 giây
            setTimeout(() => {
                if(players[socket.id]) players[socket.id].chat = "";
                io.emit('update', players);
            }, 3000);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('update', players);
    });
});

server.listen(3000, () => console.log('Server game đã chạy!'));