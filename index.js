const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Quản lý dữ liệu toàn cục
let usedNames = new Set();
let rooms = {};

// Hàm tạo mã phòng 5 chữ số ngẫu nhiên
function generateRoomCode() {
    let code;
    do {
        code = Math.floor(10000 + Math.random() * 90000).toString();
    } while (rooms[code]);
    return code;
}

io.on('connection', (socket) => {
    socket.on('registerName', (name) => {
        if (usedNames.has(name)) {
            socket.emit('nameError', 'Tên này đã có người dùng, vui lòng chọn tên khác!');
        } else {
            usedNames.add(name);
            socket.playerName = name;
            socket.emit('nameSuccess');
        }
    });

    // Tạo phòng (Single hoặc Multi)
    socket.on('createRoom', (data) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            host: socket.id,
            maxPlayers: data.maxPlayers || 5,
            players: {},
            bullets: [],
            zombies: [],
            state: 'lobby'
        };
        joinRoomLogic(socket, roomCode);
    });

    // Vào phòng bằng mã
    socket.on('joinRoom', (code) => {
        if (!rooms[code]) {
            return socket.emit('roomError', 'Phòng không tồn tại!');
        }
        if (Object.keys(rooms[code].players).length >= rooms[code].maxPlayers) {
            return socket.emit('roomError', 'Phòng đã đầy!');
        }
        if (rooms[code].state === 'playing') {
            return socket.emit('roomError', 'Phòng này đang trong trận đấu!');
        }
        joinRoomLogic(socket, code);
    });

    function joinRoomLogic(socket, code) {
        socket.join(code);
        socket.roomId = code;
        rooms[code].players[socket.id] = {
            id: socket.id,
            name: socket.playerName,
            x: 1500 + (Math.random() * 100 - 50), // Sinh ra quanh đống lửa ở giữa map (3000x3000)
            y: 1500 + (Math.random() * 100 - 50),
            money: 0,
            color: `hsl(${Math.random() * 360}, 80%, 60%)`
        };
        io.to(code).emit('roomUpdate', { code: code, players: rooms[code].players, host: rooms[code].host });
    }

    // Chủ phòng bấm bắt đầu
    socket.on('startGame', () => {
        let room = rooms[socket.roomId];
        if (room && room.host === socket.id) {
            room.state = 'playing';
            // Khởi tạo Zombie ở xa trung tâm
            for (let i = 0; i < 30; i++) {
                room.zombies.push(spawnZombie());
            }
            io.to(socket.roomId).emit('gameStarted', room.players);
        }
    });

    function spawnZombie() {
        return {
            id: Math.random(),
            x: Math.random() > 0.5 ? Math.random() * 500 : 2500 + Math.random() * 500,
            y: Math.random() > 0.5 ? Math.random() * 500 : 2500 + Math.random() * 500,
            hp: 3
        };
    }

    socket.on('playerMove', (data) => {
        let room = rooms[socket.roomId];
        if (room && room.players[socket.id]) {
            room.players[socket.id].x = data.x;
            room.players[socket.id].y = data.y;
        }
    });

    socket.on('shoot', (bulletData) => {
        let room = rooms[socket.roomId];
        if (room && room.state === 'playing') {
            room.bullets.push({
                id: Math.random(),
                owner: socket.id,
                x: bulletData.x,
                y: bulletData.y,
                vx: bulletData.vx,
                vy: bulletData.vy,
                angle: bulletData.angle,
                life: 60
            });
        }
    });

    socket.on('disconnect', () => {
        if (socket.playerName) usedNames.delete(socket.playerName);
        let room = rooms[socket.roomId];
        if (room) {
            delete room.players[socket.id];
            io.to(socket.roomId).emit('roomUpdate', { code: socket.roomId, players: room.players, host: room.host });
            // Xóa phòng nếu không còn ai
            if (Object.keys(room.players).length === 0) {
                delete rooms[socket.roomId];
            }
        }
    });
});

// Vòng lặp cập nhật Game cho TẤT CẢ các phòng đang chơi (30 FPS)
setInterval(() => {
    for (let code in rooms) {
        let room = rooms[code];
        if (room.state !== 'playing') continue;

        // 1. Cập nhật Đạn & Va chạm
        for (let i = room.bullets.length - 1; i >= 0; i--) {
            let b = room.bullets[i];
            b.x += b.vx;
            b.y += b.vy;
            b.life--;

            let hit = false;
            for (let j = room.zombies.length - 1; j >= 0; j--) {
                let z = room.zombies[j];
                if (Math.hypot(b.x - z.x, b.y - z.y) < 25) {
                    z.hp--;
                    hit = true;
                    if (z.hp <= 0) {
                        if (room.players[b.owner]) room.players[b.owner].money += 15; // Tiền rớt
                        room.zombies.splice(j, 1);
                        room.zombies.push(spawnZombie()); // Quái chết sinh con mới
                    }
                    break;
                }
            }
            if (b.life <= 0 || hit) room.bullets.splice(i, 1);
        }

        // 2. AI Zombie chạy theo người gần nhất
        room.zombies.forEach(z => {
            let closest = null, minDist = Infinity;
            for (let id in room.players) {
                let dist = Math.hypot(room.players[id].x - z.x, room.players[id].y - z.y);
                if (dist < minDist) { minDist = dist; closest = room.players[id]; }
            }
            if (closest) {
                let angle = Math.atan2(closest.y - z.y, closest.x - z.x);
                z.x += Math.cos(angle) * 1.5;
                z.y += Math.sin(angle) * 1.5;
            }
        });

        // 3. Gửi dữ liệu về cho người chơi trong phòng đó
        io.to(code).emit('stateUpdate', { players: room.players, bullets: room.bullets, zombies: room.zombies });
    }
}, 1000 / 30);

server.listen(3000, () => console.log('Server chạy cổng 3000'));