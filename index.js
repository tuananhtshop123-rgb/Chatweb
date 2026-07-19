const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let players = {};
let bullets = [];
let zombies = [];
let nextZombieId = 0;

// Khởi tạo một số zombie ban đầu
for (let i = 0; i < 15; i++) {
    zombies.push({
        id: nextZombieId++,
        x: Math.random() * 1600,
        y: Math.random() * 1200,
        hp: 2
    });
}

io.on('connection', (socket) => {
    console.log('Người chơi kết nối:', socket.id);
    
    // Tạo người chơi mới ở vị trí ngẫu nhiên
    players[socket.id] = {
        x: 400 + Math.random() * 100,
        y: 300 + Math.random() * 100,
        color: `hsl(${Math.random() * 360}, 70%, 60%)`,
        score: 0
    };

    // Gửi dữ liệu ban đầu cho người mới vào
    socket.emit('init', { id: socket.id, players, zombies });
    // Báo cho người khác biết có người mới
    socket.broadcast.emit('newPlayer', { id: socket.id, player: players[socket.id] });

    // Cập nhật vị trí khi người chơi di chuyển
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
        }
    });

    // Khi người chơi bắn đạn
    socket.on('shoot', (bulletData) => {
        bullets.push({
            id: Math.random(),
            owner: socket.id,
            x: bulletData.x,
            y: bulletData.y,
            vx: bulletData.vx,
            vy: bulletData.vy,
            life: 60 // số khung hình đạn tồn tại
        });
    });

    socket.on('disconnect', () => {
        console.log('Người chơi ngắt kết nối:', socket.id);
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
    });
});

// Vòng lặp cập nhật Game trên Server (Gửi dữ liệu 30 lần/giây để tiết kiệm CPU)
setInterval(() => {
    // 1. Cập nhật Đạn & Kiểm tra va chạm với Zombie
    for (let i = bullets.length - 1; i >= 0; i--) {
        let b = bullets[i];
        b.x += b.vx;
        b.y += b.vy;
        b.life--;

        let bulletRemoved = false;
        // Check va chạm với từng zombie
        for (let j = zombies.length - 1; j >= 0; j--) {
            let z = zombies[j];
            let dist = Math.hypot(b.x - z.x, b.y - z.y);
            if (dist < 23) { // 8px đạn + 15px zombie
                z.hp--;
                bulletRemoved = true;
                if (z.hp <= 0) {
                    // Cộng điểm cho chủ nhân phát đạn
                    if (players[b.owner]) players[b.owner].score += 10;
                    // Hồi sinh zombie ở chỗ khác
                    z.x = Math.random() * 1600;
                    z.y = Math.random() * 1200;
                    z.hp = 2;
                }
                break;
            }
        }

        if (b.life <= 0 || bulletRemoved) {
            bullets.splice(i, 1);
        }
    }

    // 2. Cập nhật AI Zombie di chuyển hướng về người chơi gần nhất
    zombies.forEach(z => {
        let closestPlayer = null;
        let minDist = Infinity;
        
        for (let id in players) {
            let p = players[id];
            let dist = Math.hypot(p.x - z.x, p.y - z.y);
            if (dist < minDist) {
                minDist = dist;
                closestPlayer = p;
            }
        }

        if (closestPlayer) {
            let angle = Math.atan2(closestPlayer.y - z.y, closestPlayer.x - z.x);
            z.x += Math.cos(angle) * 1.2; // Tốc độ zombie
            z.y += Math.sin(angle) * 1.2;
        }
    });

    // 3. Phát dữ liệu đồng bộ cho tất cả các máy khách
    io.emit('stateUpdate', { players, bullets, zombies });
}, 1000 / 30);

server.listen(3000, () => {
    console.log('Server đang chạy tại: http://localhost:3000');
});