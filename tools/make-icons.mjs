// Draws the app icon: the System's glowing notification mark on a dark window.
import sharp from 'sharp';

const svg = (inset) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="30%" r="80%"><stop offset="0" stop-color="#123a78"/><stop offset="1" stop-color="#03060f"/></radialGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="9" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g filter="url(#glow)" fill="none" stroke="#bfeaff">
    <rect x="${inset}" y="${inset}" width="${512 - inset * 2}" height="${512 - inset * 2}" stroke-width="8"/>
    <circle cx="256" cy="256" r="${(512 - inset * 2) * 0.3}" stroke-width="12"/>
  </g>
  <g filter="url(#glow)" fill="#eef9ff">
    <rect x="240" y="${256 - (512 - inset * 2) * 0.17}" width="32" height="${(512 - inset * 2) * 0.22}" rx="6"/>
    <circle cx="256" cy="${256 + (512 - inset * 2) * 0.15}" r="20"/>
  </g>
</svg>`;

const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replaceAll('%20', ' ');
for (const size of [180, 192, 512]) await sharp(Buffer.from(svg(56))).resize(size, size).png().toFile(out(`icon-${size}.png`));
await sharp(Buffer.from(svg(112))).resize(512, 512).png().toFile(out('maskable-512.png'));
console.log('Icons written');
