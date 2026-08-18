const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const RoomManager = require('./rooms');

class SignalingServer {
  constructor(server, config) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.roomManager = new RoomManager(config.roomTTL);
    this.clients = new Map();
    this.config = config;

    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateId();
      const ip = req.socket.remoteAddress;
      this.clients.set(clientId, { ws, roomCode: null, role: null, ip });
      console.log('[Signal] Client connected:', clientId, '(' + ip + ')');

      ws.on('message', (data) => this.handleMessage(clientId, data));
      ws.on('close', () => {
        console.log('[Signal] Client disconnected:', clientId);
        this.handleDisconnect(clientId);
      });
      ws.on('error', (err) => {
        console.error('[Signal] Client', clientId, 'error:', err.message);
        this.handleDisconnect(clientId);
      });

      ws.send(JSON.stringify({ type: 'connected', clientId, turnServers: config.turnServers || [] }));
    });

    this.wss.on('error', (err) => {
      console.error('[Signal] WebSocket server error:', err.message);
    });

    console.log('[Signal] Signaling server ready on /ws');
  }

  handleMessage(clientId, rawData) {
    let msg;
    try { msg = JSON.parse(rawData.toString()); } catch(e) { return; }
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (msg.type) {
      case 'create-room': return this.handleCreateRoom(clientId, msg);
      case 'join-room': return this.handleJoinRoom(clientId, msg);
      case 'offer': return this.handleRelay(clientId, msg);
      case 'answer': return this.handleRelay(clientId, msg);
      case 'ice-candidate': return this.handleRelay(clientId, msg);
      case 'file-manifest': return this.handleRelay(clientId, msg);
      case 'transfer-progress': return this.handleRelay(clientId, msg);
      case 'transfer-complete': return this.handleTransferComplete(clientId, msg);
      case 'transfer-error': return this.handleRelay(clientId, msg);
      case 'chat': return this.handleRelay(clientId, msg);
      case 'peer-disconnect': return this.handleRelay(clientId, msg);
    }
  }

  handleCreateRoom(clientId, msg) {
    const room = this.roomManager.createRoom(clientId, msg.metadata || {});
    const client = this.clients.get(clientId);
    client.roomCode = room.code;
    client.role = 'host';

    if (msg.metadata && msg.metadata.password) {
      room.password = msg.metadata.password;
      room.passwordHash = crypto.createHash('sha256').update(msg.metadata.password).digest('hex');
    }

    console.log('[Signal] Room created:', room.code, 'by', clientId);

    client.ws.send(JSON.stringify({
      type: 'room-created',
      code: room.code,
      hasPassword: !!room.password,
    }));
  }

  handleJoinRoom(clientId, msg) {
    const code = (msg.code || '').toUpperCase().trim();
    const result = this.roomManager.joinRoom(code, clientId);

    if (result.error) {
      const client = this.clients.get(clientId);
      client.ws.send(JSON.stringify({ type: 'error', code: result.error }));
      return;
    }

    const room = result.room;

    if (room.passwordHash) {
      const providedHash = msg.password
        ? crypto.createHash('sha256').update(msg.password).digest('hex')
        : '';
      if (providedHash !== room.passwordHash) {
        const client = this.clients.get(clientId);
        client.ws.send(JSON.stringify({ type: 'error', code: 'WRONG_PASSWORD' }));
        this.roomManager.revertJoin(code);
        return;
      }
    }

    const client = this.clients.get(clientId);
    client.roomCode = code;
    client.role = 'peer';

    const hostClient = this.clients.get(room.hostId);
    if (hostClient && hostClient.ws.readyState === 1) {
      hostClient.ws.send(JSON.stringify({ type: 'peer-joined', peerId: clientId }));
      client.ws.send(JSON.stringify({ type: 'room-joined', code, peerId: clientId }));
    } else {
      client.ws.send(JSON.stringify({ type: 'error', code: 'HOST_DISCONNECTED' }));
    }
  }

  handleRelay(clientId, msg) {
    const client = this.clients.get(clientId);
    if (!client || !client.roomCode) return;
    const room = this.roomManager.getRoom(client.roomCode);
    if (!room) return;
    const targetId = client.role === 'host' ? room.peerId : room.hostId;
    if (!targetId) return;
    const target = this.clients.get(targetId);
    if (target && target.ws.readyState === 1) {
      target.ws.send(JSON.stringify({ ...msg, from: clientId }));
    }
  }

  handleTransferComplete(clientId, msg) {
    const client = this.clients.get(clientId);
    if (client && client.roomCode) {
      this.roomManager.markTransferComplete(client.roomCode);
    }
    this.handleRelay(clientId, msg);
  }

  handleDisconnect(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      if (client.roomCode) {
        const room = this.roomManager.getRoom(client.roomCode);
        if (room) {
          const otherId = client.role === 'host' ? room.peerId : room.hostId;
          const other = this.clients.get(otherId);
          if (other && other.ws.readyState === 1) {
            other.ws.send(JSON.stringify({ type: 'peer-disconnected' }));
          }
          this.roomManager.deleteRoom(client.roomCode);
        }
      }
      this.clients.delete(clientId);
    }
  }

  generateId() {
    return crypto.randomBytes(8).toString('hex');
  }

  close() {
    this.roomManager.destroy();
    this.wss.close();
  }
}

module.exports = SignalingServer;
