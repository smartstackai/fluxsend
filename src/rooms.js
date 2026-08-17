const crypto = require('crypto');

class RoomManager {
  constructor(ttl = 600000) {
    this.rooms = new Map();
    this.ttl = ttl;
    this.cleanupInterval = setInterval(() => this.cleanup(), 30000);
  }

  generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  createRoom(hostId, metadata = {}) {
    let code;
    do { code = this.generateCode(); } while (this.rooms.has(code));

    const room = {
      code,
      hostId,
      metadata,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.ttl,
      joined: false,
      transferStarted: false,
      transferComplete: false,
      fileManifest: null,
    };

    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code.toUpperCase()) || null;
  }

  joinRoom(code, peerId) {
    const room = this.getRoom(code);
    if (!room) return { error: 'ROOM_NOT_FOUND' };
    if (room.joined) return { error: 'ROOM_FULL' };
    if (Date.now() > room.expiresAt) {
      this.rooms.delete(code.toUpperCase());
      return { error: 'ROOM_EXPIRED' };
    }

    room.joined = true;
    room.peerId = peerId;
    return { room };
  }

  revertJoin(code) {
    const room = this.getRoom(code);
    if (room) { room.joined = false; room.peerId = null; }
  }

  setFileManifest(code, manifest) {
    const room = this.getRoom(code);
    if (room) room.fileManifest = manifest;
  }

  markTransferStarted(code) {
    const room = this.getRoom(code);
    if (room) room.transferStarted = true;
  }

  markTransferComplete(code) {
    const room = this.getRoom(code);
    if (room) room.transferComplete = true;
  }

  deleteRoom(code) {
    this.rooms.delete(code.toUpperCase());
  }

  cleanup() {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now > room.expiresAt) {
        this.rooms.delete(code);
      }
    }
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.rooms.clear();
  }
}

module.exports = RoomManager;
