/**
 * SERVER GAME - PHIÊN BẢN RPG ACTION
 * Quản lý người chơi, quái vật, đồng bộ chiêu thức và chat.
 */
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let chatHistory = []; 
let monsters = [];
let projectiles = [];

// Khởi tạo 3 bãi quái (Zone 1)
const initMonsters = () => {
    const camps = [
        { cx: 300, cy: 300 },   // Bãi 1 góc trái trên
        { cx: 1200, cy: 300 },  // Bãi 2 góc phải trên
        { cx: 750, cy: 1200 }   // Bãi 3 giữa dưới
    ];
    camps.forEach((camp, cIdx) => {
        // Xếp thành hình vuông 4 góc
        const offsets = [{dx:-60, dy:-60}, {dx:60, dy:-60}, {dx:-60, dy:60}, {dx:60, dy:60}];
        offsets.forEach((off, i) => {
            monsters.push({
                id: `m_${cIdx}_${i}`,
                x: camp.cx + off.dx,
                y: camp.cy + off.dy,
                originX: camp.cx + off.dx,
                originY: camp.cy + off.dy,
                hp: 100,
                color: '#8B4513', // Màu nâu
                target: null
            });
        });
    });
};
initMonsters();

io.on('connection', (socket) => {
    console.log(`[Hệ thống] Kết nối mới: ${socket.id}`);

    // Đăng nhập
    socket.on('join', (data) => {
        players[socket.id] = { 
            id: socket.id, 
            name: data.name, 
            color: data.color, 
            x: 750, y: 750, // Giữa map 1500
            z: 0, // Trục Z để nhảy
            chat: "",
            isMoving: false,
            isSprinting: false,
            equipped: false
        };
        socket.emit('initChat', chatHistory); 
        io.emit('update', { players, monsters });
    });

    // Đồng bộ di chuyển & hành động
    socket.on('updateState', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].z = data.z;
            players[socket.id].isMoving = data.isMoving;
            players[socket.id].isSprinting = data.isSprinting;
            players[socket.id].equipped = data.equipped;
            io.emit('update', { players, monsters });
        }
    });

    // Xử lý dùng chiêu thức (Phát sóng cho mọi người cùng thấy hiệu ứng)
    socket.on('skill', (data) => {
        if (!players[socket.id]) return;
        io.emit('skillEffect', {
            playerId: socket.id,
            type: data.type,
            x: players[socket.id].x,
            y: players[socket.id].y,
            targetX: data.targetX,
            targetY: data.targetY
        });
    });

    // Chat
    socket.on('chat', (msg) => {
        if (players[socket.id]) {
            const entry = { name: players[socket.id].name, msg: msg };
            chatHistory.push(entry);
            if(chatHistory.length > 30) chatHistory.shift();
            players[socket.id].chat = msg;
            io.emit('update', { players, monsters });
            io.emit('newChat', entry);
            setTimeout(() => { 
                if(players[socket.id]) players[socket.id].chat = ""; 
                io.emit('update', { players, monsters }); 
            }, 4000);
        }
    });

    socket.on('disconnect', () => { 
        delete players[socket.id]; 
        io.emit('update', { players, monsters }); 
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[RPG Server] Chạy tại port ${PORT}`));