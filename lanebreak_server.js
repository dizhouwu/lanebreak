const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, createHash, timingSafeEqual } = require('node:crypto');
const { performance } = require('node:perf_hooks');
const { parseArgs } = require('node:util');
const { Match, validOrder } = require('./src/match.js');
const { HEROES } = require('./src/rules.json');

const limits = { rooms: 20, connections: 80, message: 512, perSecond: 120, waiting: 900_000, empty: 60_000, silent: 45_000 };
const guid = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const codeChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const decoder = new TextDecoder('utf-8', { fatal: true });

function serverFrame(opcode, payload = Buffer.alloc(0)) {
  const marker = payload.length < 126 ? payload.length : 126;
  const header = Buffer.alloc(marker === 126 ? 4 : 2);
  header[0] = 0x80 | opcode;
  header[1] = marker;
  if (marker === 126) header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}
function createServer(options = {}) {
  const html = fs.readFileSync(path.join(__dirname, 'lanebreak.html'));
  const rooms = new Map();
  const peers = new Set();
  const request = (req, res) => {
    const pathname = req.url?.split('?')[0];
    const headers = { 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store' };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { ...headers, Allow: 'GET, HEAD' }).end();
    } else if (pathname === '/healthz') {
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json' })
        .end(JSON.stringify({ connections: peers.size, rooms: rooms.size }));
    } else if (pathname === '/' || pathname === '/lanebreak.html') {
      res.writeHead(200, { ...headers, 'Content-Type': 'text/html; charset=utf-8' }).end(html);
    } else res.writeHead(404, headers).end('Not found');
  };
  const server = http.createServer(request);
  function send(peer, message, snapshot = false) {
    if (!peer || peer.closed || peer.socket.destroyed) return;
    if (peer.socket.writableLength > 256 * 1024) return closePeer(peer, 1013);
    if (snapshot && peer.socket.writableLength > 32 * 1024) return;
    const json = typeof message === 'string' ? message : JSON.stringify(message);
    peer.socket.write(serverFrame(1, Buffer.from(json)));
  }
  function error(peer, msg, recoverable = false) { send(peer, { t:'err',msg,recoverable }); }
  function closePeer(peer, code = 1000) {
    if (peer.closed) return;
    peer.closed = true;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code);
    peer.socket.end(serverFrame(8, payload));
    const timer = setTimeout(() => peer.socket.destroy(), 500);
    timer.unref();
  }
  function removePeer(peer) {
    peer.closed = true;
    peers.delete(peer);
    const room = peer.room;
    if (!room) return;
    const member = room.members[peer.team];
    if (member.peer !== peer) return;
    member.peer = null;
    if (!room.match) rooms.delete(room.code);
    else {
      room.match.setBot(peer.team, 'normal');
      if (!room.members.some(m => m.peer)) room.emptyAt = performance.now();
    }
  }
  function createRoom(peer, hero, name, pub) {
    if (rooms.size >= limits.rooms) return error(peer,'All match slots are currently in use.');
    let code;
    do { code = Array.from(randomBytes(4), b => codeChars[b % 26]).join(''); } while (rooms.has(code));
    const room = { code, pub, created: performance.now(), members: [], match: null, nextSnapshot: 0 };
    rooms.set(code, room);
    seat(peer, room, 0, hero, name);
    send(peer, { t:'wait',code,pub });
  }
  function seat(peer, room, team, hero, name) {
    const token = randomBytes(24).toString('hex');
    room.members[team] = { peer, hero, name, token };
    peer.room = room;
    peer.team = team;
  }
  function sendStart(room, team) {
    const member = room.members[team];
    send(member.peer, { t:'start',team,code:room.code,token:member.token });
    send(member.peer, { t:'s',s:room.match.snapshot(team) });
  }
  function join(peer, room, hero, name) {
    if (!room || room.match || room.members[0]?.peer?.closed) return error(peer,'This room is unavailable.');
    seat(peer, room, 1, hero, name);
    room.match = new Match({ heroes:room.members.map(m => m.hero), names:room.members.map(m => m.name), bots:[null,null] });
    room.nextSnapshot = performance.now() + 1000 / 30;
    sendStart(room,0);
    sendStart(room,1);
  }
  function rejoin(peer, data) {
    const room = rooms.get(data.code);
    if (!room?.match || typeof data.token !== 'string' || !/^[a-f0-9]{48}$/.test(data.token)) {
      return error(peer,'The match seat has expired.');
    }
    const token = Buffer.from(data.token,'hex');
    const team = room.members.findIndex(m => timingSafeEqual(token,Buffer.from(m.token,'hex')));
    if (team < 0) return error(peer,'The match seat has expired.');
    const member = room.members[team];
    const previous = member.peer;
    member.peer = peer;
    peer.team = team;
    peer.room = room;
    room.emptyAt = null;
    if (previous) closePeer(previous,1000);
    room.match.setBot(team, null);
    room.match.order(team,{ o:'stop' });
    sendStart(room,team);
  }
  function onMessage(peer, raw) {
    let data;
    try { data = JSON.parse(decoder.decode(raw)); } catch { return error(peer,'Invalid message.'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return error(peer,'Invalid message.');
    if (data.t === 'surrender') {
      const room = peer.room;
      if (!room?.match || room.members[peer.team]?.peer !== peer) return error(peer,'No active match to surrender.');
      room.match.finish(1 - peer.team, 'surrender');
      return;
    }
    if (data.t === 'o') {
      const now = performance.now();
      if (now >= peer.windowEnd) { peer.windowEnd = now + 1000; peer.orders = 0; }
      if (++peer.orders > limits.perSecond) return closePeer(peer,1008);
      if (!peer.room?.match || peer.room.members[peer.team]?.peer !== peer || !validOrder(data)) return error(peer,'Invalid order.');
      const match = peer.room.match;
      if (match.mode !== 'match') return;
      const detail = match.order(peer.team,data);
      if (detail) match.notice(peer.team,detail);
      return;
    }
    if (peer.room) return error(peer,'You already have a seat.');
    if (data.t === 'rejoin') return rejoin(peer,data);
    const hero = typeof data.hero === 'string' && Object.hasOwn(HEROES,data.hero) ? data.hero : 'brakk';
    const name = typeof data.name === 'string' ? data.name.replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20) : '';
    if (data.t === 'join') join(peer,rooms.get(data.code),hero,name);
    else if (data.t === 'host') createRoom(peer,hero,name,false);
    else if (data.t === 'find') {
      const available = Array.from(rooms.values()).find(r => r.pub && !r.match && !r.members[0]?.peer?.closed);
      if (available) join(peer,available,hero,name);
      else createRoom(peer,hero,name,true);
    } else error(peer,'Unknown request.');
  }
  function receive(peer, chunk) {
    if (peer.closed) return;
    const buffer = peer.buffer.length ? Buffer.concat([peer.buffer, chunk]) : chunk;
    let offset = 0;
    while (!peer.closed && buffer.length - offset >= 2) {
      const flags = buffer[offset], maskedLength = buffer[offset + 1], op = flags & 0x0f;
      if ((flags & 0xf0) !== 0x80 || !(maskedLength & 0x80) || ![1,8,9,10].includes(op)) return closePeer(peer,1002);
      let length = maskedLength & 0x7f;
      let headSize = 2;
      if (length === 127 || (op >= 8 && length > 125)) return closePeer(peer,length === 127 ? 1009 : 1002);
      if (length === 126) {
        if (buffer.length - offset < 4) break;
        length = buffer.readUInt16BE(offset + 2);
        headSize = 4;
        if (length < 126) return closePeer(peer,1002);
      }
      if (length > limits.message) return closePeer(peer,1009);
      const end = offset + headSize + 4 + length;
      if (buffer.length < end) break;
      const mask = offset + headSize;
      const payload = Buffer.allocUnsafe(length);
      for (let i = 0; i < length; i++) payload[i] = buffer[mask + 4 + i] ^ buffer[mask + i % 4];
      offset = end;
      peer.lastSeen = performance.now();
      if (op === 1) onMessage(peer,payload);
      else if (op === 8) closePeer(peer);
      else if (op === 9) peer.socket.write(serverFrame(10,payload));
    }
    peer.buffer = peer.closed ? Buffer.alloc(0) : Buffer.from(buffer.subarray(offset));
  }
  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    const reject = status => socket.end('HTTP/1.1 ' + status + '\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    if (req.url !== '/ws') return reject('404 Not Found');
    if (peers.size >= limits.connections) return reject('503 Service Unavailable');
    const key = req.headers['sec-websocket-key'];
    if (req.method !== 'GET' || req.headers.upgrade?.toLowerCase() !== 'websocket' ||
      req.headers['sec-websocket-version'] !== '13' || typeof key !== 'string' || !/^[+/A-Za-z0-9]{22}==$/.test(key)) {
      return reject('400 Bad Request');
    }
    const origin = req.headers.origin;
    if (origin) {
      try {
        const url = new URL(origin);
        if (!['http:','https:'].includes(url.protocol) || url.host !== req.headers.host) return reject('403 Forbidden');
      } catch { return reject('403 Forbidden'); }
    }
    const accept = createHash('sha1').update(key + guid).digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    socket.setNoDelay(true);
    const peer = { socket, buffer: Buffer.alloc(0), lastSeen:performance.now(), windowEnd:0, orders:0, closed:false };
    peers.add(peer);
    socket.on('data', chunk => receive(peer,chunk));
    socket.on('close', () => removePeer(peer));
    if (head.length) receive(peer,head);
  });
  let previous = performance.now(), remaining = 0;
  const step = 1000 / 60;
  const simulation = setInterval(() => {
    const now = performance.now();
    remaining += Math.min(150, now - previous);
    previous = now;
    while (remaining >= step) {
      for (const room of rooms.values()) if (room.match?.mode === 'match') room.match.step(1/60);
      remaining -= step;
    }
    for (const room of rooms.values()) {
      if (!room.match || now < room.nextSnapshot) continue;
      if (room.match.mode === 'ended' && room.finalSent) continue;
      const interval = 1000 / 30;
      room.nextSnapshot = Math.max(room.nextSnapshot + interval, now + interval / 2);
      const ended = room.match.mode === 'ended';
      let publicPrefix;
      for (const [team,member] of room.members.entries()) {
        if (!member.peer) continue;
        // Both players receive the same world data. Hero details and effects are filtered per seat.
        publicPrefix ??= '{"t":"s","s":' + room.match.snapshotWorldJson().slice(0, -1) + ',';
        const view = room.match.snapshotViewJson(team);
        send(member.peer,publicPrefix + view.slice(1) + '}',!ended);
      }
      if (ended) {
        room.endedAt = now;
        room.finalSent = true;
      }
    }
  }, 8);
  let lastPing = 0;
  const cleanup = setInterval(() => {
    const now = performance.now();
    for (const peer of peers) {
      if (peer.closed) continue;
      if (now - peer.lastSeen > (options.silentMs ?? limits.silent)) closePeer(peer,1001);
      else if (now - lastPing > 15_000) peer.socket.write(serverFrame(9));
    }
    if (now - lastPing > 15_000) lastPing = now;
    for (const [code,room] of rooms) {
      if ((!room.match && now - room.created > (options.waitingMs ?? limits.waiting)) ||
        (room.emptyAt && now - room.emptyAt > (options.emptyMs ?? limits.empty)) ||
        (room.endedAt && now - room.endedAt > limits.waiting)) {
        rooms.delete(code);
        for (const m of room.members) if (m.peer) closePeer(m.peer,1001);
      }
    }
  }, 1000);
  simulation.unref(); cleanup.unref();
  server.on('close',() => { clearInterval(simulation); clearInterval(cleanup); });
  server.shutdown = () => {
    for (const peer of peers) peer.socket.destroy();
    return new Promise(resolve => server.close(resolve));
  };
  return server;
}
if (require.main === module) {
  const { values } = parseArgs({ strict: false, options: { host: { type: 'string' }, port: { type: 'string' } } });
  const host = values.host ?? process.env.HOST ?? '127.0.0.1';
  const port = Number(values.port ?? process.env.PORT ?? '8377');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be an integer between 1 and 65535.');
  const server = createServer();
  server.listen(port,host,() => process.stdout.write('Lanebreak listening at http://' + host + ':' + port + '/\n'));
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,() => server.shutdown().finally(() => process.exit(0)));
}
module.exports = { createServer };
