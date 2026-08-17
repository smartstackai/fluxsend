const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const SignalingServer = require('./src/signaling');
const LANDiscovery = require('./src/lan-discovery');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const app = express();
const server = http.createServer(app);

// Ensure download directory exists
const downloadDir = path.resolve(config.downloadDir);
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir, { recursive: true });
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API: Get server info
app.get('/api/info', (req, res) => {
  const lan = new LANDiscovery(config.port);
  const ips = lan.getLocalIPs();
  res.json({
    port: config.port,
    ips,
    primaryIP: lan.getPrimaryIP(),
    maxFileSize: config.maxFileSize,
    chunkSize: config.chunkSize,
  });
});

// API: Get QR code for room
app.get('/api/qr/:code', async (req, res) => {
  try {
    const lan = new LANDiscovery(config.port);
    const qr = await lan.generateQRCode(req.params.code);
    res.json(qr);
  } catch (e) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// API: Get download directory
app.get('/api/downloads', (req, res) => {
  res.json({ dir: downloadDir });
});

// Handle auto-join links
app.get('/join/:code', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize signaling BEFORE server.listen so upgrade handler is registered first
const signaling = new SignalingServer(server, config);

// Start server
server.listen(config.port, '0.0.0.0', () => {
  const lan = new LANDiscovery(config.port);
  const primaryIP = lan.getPrimaryIP();

  console.log('');
  console.log('  ========================================');
  console.log('       P2P-Share is running!');
  console.log('  ========================================');
  console.log('  Local:   http://localhost:' + config.port);
  console.log('  Network: http://' + primaryIP + ':' + config.port);
  console.log('');
  console.log('  Open in browser to start sharing');
  console.log('  ========================================');
  console.log('');

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    signaling.close();
    lan.destroy();
    server.close();
    process.exit(0);
  });
});
