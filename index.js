// Server của game - Quản lý trạng thái người chơi và phòng chat
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Lưu trữ dữ liệu người chơi
let players = {};
// Lưu lịch sử chat để hiển thị cho người mới
let chatHistory = []; 

io.on('connection', (socket) => {
    // Sự kiện khi người chơi kết nối
    socket.on('join', (data) => {
        players[socket.id] = { 
            id: socket.id, 
            name: data.name, 
            color: data.color, 
            x: 400, 
            y: 300, 
            chat: "",
            isSprinting: false // Trạng thái chạy nhanh
        };
        socket.emit('initChat', chatHistory); 
        io.emit('update', players);
    });

    // Cập nhật vị trí từ Client
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].isSprinting = data.sprinting;
            io.emit('update', players);
        }
    });

    // Xử lý tin nhắn chat
    socket.on('chat', (msg) => {
        if (players[socket.id]) {
            const entry = { name: players[socket.id].name, msg: msg };
            chatHistory.push(entry);
            if(chatHistory.length > 20) chatHistory.shift();
            players[socket.id].chat = msg;
            io.emit('update', players);
            io.emit('newChat', entry);
            // Xóa tin nhắn trên đầu sau 4 giây
            setTimeout(() => { 
                if(players[socket.id]) players[socket.id].chat = ""; 
                io.emit('update', players); 
            }, 4000);
        }
    });

    // Xử lý khi ngắt kết nối
    socket.on('disconnect', () => { 
        delete players[socket.id]; 
        io.emit('update', players); 
    });
});

server.listen(3000, () => console.log('Server đã khởi động tại cổng 3000'));