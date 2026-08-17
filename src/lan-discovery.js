const os = require('os');
const QRCode = require('qrcode');

class LANDiscovery {
  constructor(port) {
    this.port = port;
    this.services = [];
  }

  getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const ips = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ips.push({
            name,
            address: iface.address,
            netmask: iface.netmask,
          });
        }
      }
    }
    return ips;
  }

  getPrimaryIP() {
    const ips = this.getLocalIPs();
    // Prefer non-virtual adapters
    const preferred = ips.find(ip =>
      !ip.name.includes('Virtual') &&
      !ip.name.includes('vEthernet') &&
      !ip.name.includes('WSL')
    );
    return preferred ? preferred.address : (ips[0]?.address || '127.0.0.1');
  }

  async generateQRCode(roomCode) {
    const ip = this.getPrimaryIP();
    const url = `http://${ip}:${this.port}/join/${roomCode}`;

    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 300,
      margin: 2,
      color: {
        dark: '#e0e0ff',
        light: '#0a0a1a',
      },
    });

    return {
      qrDataUrl,
      url,
      ip,
      port: this.port,
    };
  }

  generateManualInfo(roomCode) {
    const ip = this.getPrimaryIP();
    return {
      ip,
      port: this.port,
      roomCode,
      url: `http://${ip}:${this.port}`,
      localUrl: `http://${ip}:${this.port}/join/${roomCode}`,
    };
  }

  destroy() {
    this.services.forEach(s => s.stop());
  }
}

module.exports = LANDiscovery;
