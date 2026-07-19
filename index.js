const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const menu = document.getElementById('menu');
const gameUi = document.getElementById('game-ui');
const joystick = document.getElementById('joystick');

let player = { x: 100, y: 100, name: 'Player', color: '#FF5733', chat: '' };
let colors = ['#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#F3FF33', '#33FFF3', '#A133FF'];

// Tạo chọn màu
const colorPicker = document.getElementById('colorPicker');
colors.forEach(c => {
    let div = document.createElement('div');
    div.className = 'color-dot';
    div.style.backgroundColor = c;
    div.onclick = () => player.color = c;
    colorPicker.appendChild(div);
});

function startGame() {
    player.name = document.getElementById('username').value || 'Người chơi';
    menu.style.display = 'none';
    gameUi.style.display = 'block';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if ('ontouchstart' in window) joystick.style.display = 'block';
    animate();
}

// Logic vẽ và chuyển động
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Vẽ nhân vật
    ctx.fillStyle = player.color;
    ctx.fillRect(player.x, player.y, 50, 50);
    
    // Vẽ tên
    ctx.fillStyle = 'black';
    ctx.font = '16px Arial';
    ctx.fillText(player.name, player.x, player.y - 10);
    
    // Vẽ chat
    if (player.chat) {
        ctx.fillStyle = 'white';
        ctx.fillRect(player.x, player.y - 40, 60, 20);
        ctx.fillStyle = 'black';
        ctx.fillText(player.chat, player.x + 5, player.y - 25);
    }
    
    requestAnimationFrame(animate);
}

// Xử lý chat
function handleChat(e) {
    if (e.key === 'Enter') {
        player.chat = document.getElementById('chatInput').value;
        document.getElementById('chatInput').value = '';
        setTimeout(() => player.chat = '', 3000); // Tự xóa sau 3s
    }
}

// Xử lý phím di chuyển
window.addEventListener('keydown', (e) => {
    const speed = 10;
    if (e.key === 'ArrowUp') player.y -= speed;
    if (e.key === 'ArrowDown') player.y += speed;
    if (e.key === 'ArrowLeft') player.x -= speed;
    if (e.key === 'ArrowRight') player.x += speed;
});