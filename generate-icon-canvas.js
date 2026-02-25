const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: false, nodeIntegration: true } });

    try {
        const dataUrl = await win.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        
        ctx.fillStyle = '#0b1220';
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(0, 0, 512, 512, 100);
        } else {
            ctx.rect(0, 0, 512, 512);
        }
        ctx.fill();
        
        const grad = ctx.createLinearGradient(0, 0, 512, 512);
        grad.addColorStop(0, '#3b82f6');
        grad.addColorStop(1, '#8b5cf6');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.15;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(32, 32, 448, 448, 90);
        } else {
            ctx.rect(32, 32, 448, 448);
        }
        ctx.fill();
        
        ctx.fillStyle = '#111827';
        ctx.globalAlpha = 1.0;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(48, 48, 416, 416, 80);
        } else {
            ctx.rect(48, 48, 416, 416);
        }
        ctx.fill();
        
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '900 220px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.translate(256, 256);
        ctx.fillText('AI', 0, 16);
        
        resolve(canvas.toDataURL('image/png'));
      });
    `);

        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
        const buildDir = path.join(__dirname, 'build');
        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir);
        }

        fs.writeFileSync(path.join(buildDir, 'icon.png'), base64Data, 'base64');
        console.log('Icon successfully generated at build/icon.png');
    } catch (err) {
        console.error('Error generating icon:', err);
    } finally {
        app.exit(0);
    }
});
