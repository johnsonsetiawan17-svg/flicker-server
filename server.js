// server.js — Flicker multiplayer server
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

const players = {};
const MAX_HEALTH = 100;
const RESPAWN_DELAY_MS = 2200;

const SPAWN_POINTS = [
  { x: 15, y: 1.6, z: 15 }, { x: -15, y: 1.6, z: 15 },
  { x: 15, y: 1.6, z: -15 }, { x: -15, y: 1.6, z: -15 },
  { x: 0, y: 1.6, z: 20 }, { x: 0, y: 1.6, z: -20 }
];
const COLORS = [0xff5566, 0x66aaff, 0xffee66, 0xcc66ff, 0x66ffcc, 0xff9955, 0xff66cc, 0x88ff66];

function randomSpawn() { return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)]; }
function randomColor() { return COLORS[Math.floor(Math.random() * COLORS.length)]; }

io.on('connection', (socket) => {
  const spawn = randomSpawn();
  players[socket.id] = {
    id: socket.id, x: spawn.x, y: spawn.y, z: spawn.z, rotY: 0,
    health: MAX_HEALTH, score: 0, deaths: 0,
    name: 'Player-' + socket.id.slice(0, 4), color: randomColor(), alive: true
  };

  socket.emit('init', { id: socket.id, players });
  socket.broadcast.emit('playerJoined', players[socket.id]);

  socket.on('move', (data) => {
    const p = players[socket.id];
    if (!p || !p.alive) return;
    p.x = data.x; p.y = data.y; p.z = data.z; p.rotY = data.rotY;
    socket.broadcast.emit('playerMoved', { id: socket.id, x: p.x, y: p.y, z: p.z, rotY: p.rotY });
  });

  socket.on('shoot', (data) => {
    socket.broadcast.emit('playerShot', { id: socket.id, origin: data.origin, direction: data.direction });
  });

  socket.on('hit', (data) => {
    const shooter = players[socket.id];
    const target = players[data.targetId];
    if (!shooter || !target || !target.alive || !shooter.alive || data.targetId === socket.id) return;

    const damage = typeof data.damage === 'number' ? Math.min(data.damage, 40) : 20;
    target.health -= damage;

    if (target.health <= 0) {
      target.health = 0; target.alive = false; target.deaths += 1; shooter.score += 1;
      io.emit('playerKilled', { targetId: target.id, shooterId: shooter.id, shooterName: shooter.name, targetName: target.name, score: shooter.score });

      setTimeout(() => {
        if (!players[target.id]) return;
        const respawn = randomSpawn();
        Object.assign(target, { x: respawn.x, y: respawn.y, z: respawn.z, health: MAX_HEALTH, alive: true });
        io.emit('playerRespawned', { id: target.id, x: target.x, y: target.y, z: target.z, health: target.health });
      }, RESPAWN_DELAY_MS);
    } else {
      io.emit('playerDamaged', { targetId: target.id, health: target.health, shooterId: shooter.id });
    }
  });

  socket.on('chat', (msg) => {
    const p = players[socket.id];
    if (!p) return;
    io.emit('chat', { name: p.name, msg: String(msg).slice(0, 140) });
  });

  socket.on('setName', (name) => {
    const p = players[socket.id];
    if (!p) return;
    p.name = String(name).slice(0, 16) || p.name;
    io.emit('playerRenamed', { id: socket.id, name: p.name });
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    io.emit('playerLeft', { id: socket.id });
  });
});

server.listen(PORT, () => {
  console.log(`Flicker server running at http://localhost:${PORT}`);
  console.log('On your phone/app, connect to: http://<this-computer-LAN-IP>:' + PORT);
});