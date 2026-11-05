import { PNG } from 'pngjs';
import fs from 'node:fs';
fs.mkdirSync('public/icons', { recursive: true });
const background = [45, 106, 87]; const colors = [[134,173,152],[179,208,190],[236,244,237]];
for (const [dimension, name] of [[192, 'icon-192'], [512, 'icon-512'], [180, 'apple-touch-icon']] as const) {
  const png = new PNG({ width: dimension, height: dimension });
  for (let y = 0; y < dimension; y++) for (let x = 0; x < dimension; x++) {
    const totals = [0,0,0];
    for (const sx of [.25,.75]) for (const sy of [.25,.75]) {
      const px = (x + sx) * 128 / dimension, py = (y + sy) * 128 / dimension; let color = background;
      for (let layer = 0; layer < 3; layer++) {
        const dx = px - 64, dy = py - (45 + layer * 16), angle = -Math.PI / 6;
        const localX = dx * Math.cos(angle) + dy * Math.sin(angle), localY = -dx * Math.sin(angle) + dy * Math.cos(angle);
        const qx = Math.abs(localX) - 20, qy = Math.abs(localY) - 7;
        if (Math.hypot(Math.max(qx,0), Math.max(qy,0)) + Math.min(Math.max(qx,qy),0) <= 7) color = colors[layer];
      }
      color.forEach((value, i) => totals[i] += value / 4);
    }
    const offset = (y * dimension + x) * 4; for (let c = 0; c < 3; c++) png.data[offset + c] = Math.round(totals[c]); png.data[offset + 3] = 255;
  }
  fs.writeFileSync(`public/icons/${name}.png`, PNG.sync.write(png));
}
console.log('Iconos PWA generados.');
