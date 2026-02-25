const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(() => {
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#3b82f6;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="120" fill="#0b1220" />
  <rect x="32" y="32" width="448" height="448" rx="90" fill="url(#grad1)" opacity="0.15" />
  <rect x="48" y="48" width="416" height="416" rx="80" fill="#111827" />
  <text x="256" y="320" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="200" fill="#e2e8f0" font-weight="900">AI</text>
</svg>`;

    const base64 = Buffer.from(svg).toString("base64");
    const _icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${base64}`);

    const buildDir = path.join(__dirname, 'build');
    if (!fs.existsSync(buildDir)) {
        fs.mkdirSync(buildDir);
    }

    fs.writeFileSync(path.join(buildDir, 'icon.png'), _icon.toPNG());
    console.log('Icon generated at build/icon.png');
    app.quit();
});
