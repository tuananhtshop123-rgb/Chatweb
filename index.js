/**
 * SERVER MMORPG - ZONE 1 (Đảo & Biển)
 * Quản lý AI Quái, Exp, Cấp độ, Điểm tiềm năng và Va chạm.
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
let monsters = [];
let chatHistory = [];
let usedNames = new Set(); // Chống trùng tên

const MAP_SIZE = 2400; // Map to hơn
const ISLAND_MIN = 400, ISLAND_MAX = 2000; // Biển bao quanh 400px

// Khởi tạo Quái vật (Zone 1)
const initMonsters = () => {
    const camps = [
        { cx: 600, cy: 600 },   // Bãi 1
        { cx: 1800, cy: 600 },  // Bãi 2
        { cx: 1200, cy: 1800 }  // Bãi 3
    ];
    let mId = 0;
    camps.forEach(camp => {
        const offsets = [{dx:-80, dy:-80}, {dx:80, dy:-80}, {dx:-80, dy:80}, {dx:80, dy:80}];
        offsets.forEach(off => {
            monsters.push({
                id: `mob_${mId++}`,
                x: camp.cx + off.dx, y: camp.cy + off.dy,
                spawnX: camp.cx + off.dx, spawnY: camp.cy + off.dy,
                hp: 100, maxHp: 100,
                level: 1, targetId: null, speed: 2, attackCooldown: 0
            });
        });
    });
};
initMonsters();

io.on('connection', (socket) => {
    // XỬ LÝ ĐĂNG NHẬP (Chống trùng tên)
    socket.on('join', (data, callback) => {
        if (usedNames.has(data.name)) {
            callback({ success: false, msg: "Tên đã tồn tại, vui lòng chọn tên khác!" });
            return;
        }
        usedNames.add(data.name);
        
        players[socket.id] = { 
            id: socket.id, name: data.name, color: data.color, 
            x: 1200, y: 1200, z: 0, // Sinh ra ở giữa đảo
            hp: 200, maxHp: 200, exp: 0, level: 1, statPoints: 0,
            stats: { atk: 10, hp: 0, lifesteal: 0 },
            isMoving: false, isSprinting: false, isDead: false,
            weapon: 0 // 0: Tay không, 1: Nắm đấm, 2: Kiếm
        };
        callback({ success: true });
        io.emit('updatePlayers', players);
    });

    // CỘNG ĐIỂM TIỀM NĂNG (STATS)
    socket.on('addStat', (type) => {
        let p = players[socket.id];
        if (p && p.statPoints > 0) {
            p.statPoints--;
            if (type === 'atk') p.stats.atk += 2;
            if (type === 'hp') { p.stats.hp += 10; p.maxHp += 10; p.hp += 10; }
            if (type === 'lifesteal') p.stats.lifesteal += 1; // +1%
            socket.emit('syncPlayer', p);
        }
    });

    // ĐỒNG BỘ TRẠNG THÁI CLIENT LÊN SERVER
    socket.on('updateState', (data) => {
        let p = players[socket.id];
        if (p && !p.isDead) {
            p.x = data.x; p.y = data.y; p.z = data.z;
            p.isMoving = data.isMoving; p.isSprinting = data.isSprinting; p.weapon = data.weapon;
        }
    });

    // XỬ LÝ GÂY SÁT THƯƠNG LÊN QUÁI
    socket.on('hitMonster', (data) => {
        let p = players[socket.id];
        let m = monsters.find(x => x.id === data.mobId);
        if (p && m && !p.isDead && m.hp > 0) {
            let dmg = Math.floor(p.stats.atk * data.multiplier); // Tính sát thương
            m.hp -= dmg;
            m.targetId = p.id; // Quái bị đánh -> Ghi nhớ mục tiêu để cắn lại
            
            // Hút máu
            if (p.stats.lifesteal > 0) {
                let heal = Math.floor(dmg * (p.stats.lifesteal / 100));
                p.hp = Math.min(p.maxHp, p.hp + heal);
            }

            io.emit('floatingText', { x: m.x, y: m.y, text: `-${dmg}`, color: 'red' });

            if (m.hp <= 0) {
                // Quái chết -> Cho Exp
                let expGain = 45; 
                p.exp += expGain;
                io.emit('floatingText', { x: p.x, y: p.y, text: `+${expGain} EXP`, color: 'yellow' });
                
                // Lên cấp
                let reqExp = p.level * 100;
                if (p.exp >= reqExp && p.level < 1000) {
                    p.level++; p.exp -= reqExp; p.statPoints += 3;
                    p.maxHp += 20; p.hp = p.maxHp; p.stats.atk += 1;
                    io.emit('floatingText', { x: p.x, y: p.y-30, text: `LEVEL UP!`, color: 'cyan' });
                }
                
                socket.emit('syncPlayer', p);
                
                // Hồi sinh quái sau 3s
                setTimeout(() => {
                    m.hp = m.maxHp; m.targetId = null; 
                    m.x = m.spawnX; m.y = m.spawnY;
                }, 3000);
            }
        }
    });

    // NHẬN CHIÊU THỨC & HIỆU ỨNG TỪ CLIENT ĐỂ PHÁT CHO NGƯỜI KHÁC THẤY
    socket.on('skill', (data) => {
        if(players[socket.id]) io.emit('skillEffect', { ...data, playerId: socket.id, px: players[socket.id].x, py: players[socket.id].y });
    });

    socket.on('chat', (msg) => {
        if (players[socket.id]) io.emit('newChat', { name: players[socket.id].name, msg: msg });
    });

    socket.on('disconnect', () => { 
        if(players[socket.id]) usedNames.delete(players[socket.id].name);
        delete players[socket.id]; 
        io.emit('updatePlayers', players); 
    });
});

// --- VÒNG LẶP AI QUÁI VẬT (10 lần/giây) ---
setInterval(() => {
    monsters.forEach(m => {
        if (m.hp > 0 && m.targetId) {
            let target = players[m.targetId];
            if (target && !target.isDead) {
                let dx = target.x - m.x; let dy = target.y - m.y;
                let dist = Math.hypot(dx, dy);
                
                // Nếu mục tiêu quá xa, quay về ổ
                if (dist > 600) { m.targetId = null; return; }
                
                if (dist > 40) {
                    // Đuổi theo
                    m.x += (dx / dist) * m.speed;
                    m.y += (dy / dist) * m.speed;
                } else {
                    // Tấn công (Cooldown 1.5s)
                    if (Date.now() - m.attackCooldown > 1500) {
                        target.hp -= 15; // Quái cắn mất 15 máu
                        m.attackCooldown = Date.now();
                        io.emit('floatingText', { x: target.x, y: target.y, text: `-15`, color: 'purple' });
                        
                        if (target.hp <= 0) {
                            target.isDead = true; target.hp = 0;
                            m.targetId = null;
                            io.emit('floatingText', { x: target.x, y: target.y, text: `BẠN ĐÃ CHẾT`, color: 'black' });
                            // Hồi sinh sau 1s
                            setTimeout(() => {
                                target.isDead = false; target.hp = target.maxHp;
                                target.x = 1200; target.y = 1200; // Về nhà
                                io.to(target.id).emit('syncPlayer', target); // Ép vị trí
                            }, 1000);
                        }
                        io.to(target.id).emit('syncPlayer', target);
                    }
                }
            } else { m.targetId = null; }
        } else if (m.hp > 0 && !m.targetId) {
            // Đi lảng vảng quanh ổ
            let dx = m.spawnX - m.x, dy = m.spawnY - m.y;
            if(Math.hypot(dx, dy) > 10) { m.x += (dx/Math.hypot(dx,dy)) * 1; m.y += (dy/Math.hypot(dx,dy)) * 1; }
        }
    });
    io.emit('updateMonsters', monsters);
}, 100); // Server loop 10 FPS

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[MMORPG] Server chạy cổng ${PORT}`));