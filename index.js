const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

let usedNames = new Set();
let rooms = {};

function generateRoomCode() {
    let code;
    do { code = Math.floor(10000 + Math.random() * 90000).toString(); } while (rooms[code]);
    return code;
}

io.on('connection', (socket) => {
    socket.on('registerName', (name) => {
        if (usedNames.has(name)) {
            socket.emit('nameError', 'Tên này đã có người dùng!');
        } else {
            usedNames.add(name);
            socket.playerName = name;
            socket.emit('nameSuccess');
        }
    });

    socket.on('createRoom', (data) => {
        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            host: socket.id,
            maxPlayers: data.maxPlayers || 5,
            players: {}, bullets: [], zombies: [],
            state: 'lobby', wave: 1, baseZombieHp: 3
        };
        joinRoomLogic(socket, roomCode);
    });

    socket.on('joinRoom', (code) => {
        if (!rooms[code]) return socket.emit('roomError', 'Phòng không tồn tại!');
        if (Object.keys(rooms[code].players).length >= rooms[code].maxPlayers) return socket.emit('roomError', 'Phòng đã đầy!');
        if (rooms[code].state !== 'lobby') return socket.emit('roomError', 'Phòng đang chơi, không thể vào!');
        joinRoomLogic(socket, code);
    });

    function joinRoomLogic(socket, code) {
        socket.join(code);
        socket.roomId = code;
        rooms[code].players[socket.id] = {
            id: socket.id, name: socket.playerName,
            x: 1500 + (Math.random() * 100 - 50), y: 1500 + (Math.random() * 100 - 50),
            angle: 0, money: 0, color: `hsl(${Math.random() * 360}, 80%, 60%)`
        };
        io.to(code).emit('roomUpdate', { code: code, players: rooms[code].players, host: rooms[code].host });
    }

    socket.on('startGame', () => {
        let room = rooms[socket.roomId];
        if (room && room.host === socket.id) {
            startWave(room, socket.roomId);
            io.to(socket.roomId).emit('gameStarted', room.players);
        }
    });

    function startWave(room, roomId) {
        room.state = 'playing';
        room.zombies = [];
        let spawnCount = 10 + (room.wave * 5); // Đợt 1: 15 con, Đợt 2: 20 con...
        let currentHp = room.baseZombieHp + Math.floor(room.wave * 1.5); // Máu trâu dần

        for (let i = 0; i < spawnCount; i++) {
            room.zombies.push({
                id: Math.random(),
                x: Math.random() > 0.5 ? Math.random() * 500 : 2500 + Math.random() * 500,
                y: Math.random() > 0.5 ? Math.random() * 500 : 2500 + Math.random() * 500,
                hp: currentHp, maxHp: currentHp
            });
        }
        io.to(roomId).emit('waveInfo', { wave: room.wave, msg: `WAVE ${room.wave} BẮT ĐẦU!` });
    }

    // Xử lý gửi tin nhắn Chat trong phòng
    socket.on('sendChat', (msg) => {
        if (socket.roomId && rooms[socket.roomId]) {
            io.to(socket.roomId).emit('receiveChat', { name: socket.playerName, msg: msg, color: rooms[socket.roomId].players[socket.id].color });
        }
    });

    socket.on('playerMove', (data) => {
        let room = rooms[socket.roomId];
        if (room && room.players[socket.id]) {
            room.players[socket.id].x = data.x;
            room.players[socket.id].y = data.y;
            room.players[socket.id].angle = data.angle;
        }
    });

    socket.on('shoot', (bulletData) => {
        let room = rooms[socket.roomId];
        if (room && room.state === 'playing') {
            room.bullets.push({
                id: Math.random(), owner: socket.id,
                x: bulletData.x, y: bulletData.y,
                vx: bulletData.vx, vy: bulletData.vy,
                angle: bulletData.angle, life: 60
            });
        }
    });

    // Tính năng rời phòng
    socket.on('leaveRoom', () => {
        handlePlayerLeave(socket);
        socket.emit('leftRoom');
    });

    socket.on('disconnect', () => handlePlayerLeave(socket));

    function handlePlayerLeave(socket) {
        let room = rooms[socket.roomId];
        if (room) {
            socket.leave(socket.roomId);
            delete room.players[socket.id];
            io.to(socket.roomId).emit('roomUpdate', { code: socket.roomId, players: room.players, host: room.host });
            
            // Đổi chủ phòng nếu host thoát
            if (room.host === socket.id && Object.keys(room.players).length > 0) {
                room.host = Object.keys(room.players)[0];
                io.to(socket.roomId).emit('roomUpdate', { code: socket.roomId, players: room.players, host: room.host });
            } else if (Object.keys(room.players).length === 0) {
                delete rooms[socket.roomId]; // Xóa phòng rỗng
            }
            socket.roomId = null;
        }
    }
});

// Vòng lặp cập nhật Game (Tối ưu để không bị crash Array)
setInterval(() => {
    for (let code in rooms) {
        let room = rooms[code];
        if (room.state !== 'playing') continue;

        // Xử lý đạn (Giữ lại đạn còn sống)
        room.bullets = room.bullets.filter(b => {
            b.x += b.vx; b.y += b.vy; b.life--;
            
            let hit = false;
            for (let z of room.zombies) {
                if (Math.hypot(b.x - z.x, b.y - z.y) < 25) {
                    z.hp--; hit = true;
                    if (z.hp <= 0 && room.players[b.owner]) room.players[b.owner].money += 15;
                    break; // 1 viên đạn chỉ trúng 1 quái
                }
            }
            return b.life > 0 && !hit;
        });

        // Lọc bỏ quái chết
        let aliveZombies = [];
        room.zombies.forEach(z => {
            if (z.hp > 0) {
                let closest = null, minDist = Infinity;
                for (let id in room.players) {
                    let dist = Math.hypot(room.players[id].x - z.x, room.players[id].y - z.y);
                    if (dist < minDist) { minDist = dist; closest = room.players[id]; }
                }
                if (closest) {
                    let angle = Math.atan2(closest.y - z.y, closest.x - z.x);
                    z.x += Math.cos(angle) * 1.5;
                    z.y += Math.sin(angle) * 1.5;
                    z.angle = angle; // Quái cũng xoay mặt về người chơi
                }
                aliveZombies.push(z);
            }
        });
        room.zombies = aliveZombies;

        // Chuyển Wave nếu hết quái
        if (room.zombies.length === 0) {
            room.state = 'wave_clear';
            io.to(code).emit('waveInfo', { wave: room.wave, msg: `WAVE ${room.wave} HOÀN THÀNH! Nghỉ 3 giây...` });
            setTimeout(() => {
                if(rooms[code]) {
                    rooms[code].wave++;
                    startWave(rooms[code], code);
                }
            }, 3000);
        }

        io.to(code).emit('stateUpdate', { players: room.players, bullets: room.bullets, zombies: room.zombies });
    }
}, 1000 / 30);

server.listen(3000, () => console.log('Server chạy cổng 3000'));