# FluxSend

Encrypted peer-to-peer file sharing over WebRTC DataChannels. No server storage — files go directly device to device.

## Features

- **P2P Transfer** — WebRTC DataChannels with 16MB chunking, no file/size limits
- **Encrypted** — End-to-end encrypted via DTLS (built into WebRTC)
- **Chat** — In-transfer messaging via WebSocket signaling relay
- **Password Protection** — SHA-256 hashed room passwords
- **Transfer History** — Local storage log of past transfers
- **QR + Room Codes** — QR codes for LAN, 6-digit codes for Internet
- **Mobile Responsive** — Touch-friendly, works on phones/tablets
- **3D UI** — Interactive card tilt effects, gradient glows, animations
- **Folder Support** — Drag-drop folders via `webkitGetAsEntry`

## Quick Start

```bash
npm install
node server.js
```

Open `http://localhost:3000`

## Configuration

Edit `config.json`:

```json
{
  "port": 3000,
  "chunkSize": 16777216,
  "stunServers": ["stun:stun.l.google.com:19302"],
  "turnServers": [
    {
      "urls": "turn:YOUR_SERVER_IP:3478",
      "username": "p2pshare",
      "credential": "changeme123"
    }
  ],
  "roomTTL": 600000,
  "downloadDir": "./downloads"
}
```

### TURN Server (Internet Access)

For transfers across networks, run your own [coturn](https://github.com/coturn/coturn) server and update `turnServers` in `config.json`.

## How It Works

1. **Sender** creates a room → gets QR code (LAN) or 6-digit code (Internet)
2. **Receiver** scans QR or enters code → WebRTC signaling via WebSocket
3. WebRTC DataChannel established → files transfer directly peer-to-peer
4. Server only handles signaling — **no file data touches the server**

## Tech Stack

- Node.js + Express
- WebSocket (ws) signaling
- WebRTC DataChannels
- Vanilla HTML/CSS/JS (no frameworks)

## License

MIT
