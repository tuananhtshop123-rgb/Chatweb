const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// Phục vụ các file tĩnh (như HTML, CSS, JS ở client)
app.use(express.static(__dirname + '/public'));

io.on('connection', (socket) => {
  console.log('Một người chơi đã kết nối:', socket.id);

  socket.on('disconnect', () => {
    console.log('Người chơi đã ngắt kết nối');
  });
});

server.listen(3000, () => {
  console.log('Server đang chạy tại: http://localhost:3000');
});