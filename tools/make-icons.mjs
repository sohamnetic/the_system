// Draws the app icon: a glowing crystal shard rising through a broken ring of light, with level-up chevrons cut into it.
import sharp from 'sharp';

const ticks = Array.from({ length: 24 }, (_, i) => i * 15).filter(a => a % 90 !== 0)
  .map(a => `<rect x="253" y="26" width="6" height="${a % 45 === 0 ? 26 : 14}" transform="rotate(${a} 256 256)"/>`).join('');

// scale shrinks the artwork inside the background, for platforms that crop icons to a circle.
const svg = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="bg" cx="50%" cy="48%" r="72%"><stop offset="0" stop-color="#2a1f8f"/><stop offset=".45" stop-color="#0f1450"/><stop offset="1" stop-color="#03040f"/></radialGradient>
    <radialGradient id="aura" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#6fd0ff" stop-opacity=".95"/><stop offset=".5" stop-color="#5a5cff" stop-opacity=".45"/><stop offset="1" stop-color="#5a5cff" stop-opacity="0"/></radialGradient>
    <linearGradient id="left" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#6fc8ff"/></linearGradient>
    <linearGradient id="right" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fdcff"/><stop offset="1" stop-color="#3a44e0"/></linearGradient>
    <linearGradient id="ring" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8f3ff"/><stop offset="1" stop-color="#7a6cff"/></linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <ellipse cx="256" cy="256" rx="170" ry="222" fill="url(#aura)"/>
    <g fill="#a9dcff" opacity=".65">${ticks}</g>
    <g filter="url(#soft)" fill="none" stroke="url(#ring)" stroke-width="13" stroke-linecap="round">
      <path d="M 124 124 A 187 187 0 0 0 124 388"/>
      <path d="M 388 124 A 187 187 0 0 1 388 388"/>
    </g>
    <g filter="url(#glow)">
      <polygon points="256,28 256,484 158,250" fill="url(#left)"/>
      <polygon points="256,28 354,250 256,484" fill="url(#right)"/>
    </g>
    <g fill="none" stroke="#070a2e" stroke-width="27" stroke-linecap="square" stroke-linejoin="miter">
      <polyline points="202,272 256,218 310,272"/>
      <polyline points="202,342 256,288 310,342"/>
    </g>
  </g>
</svg>`;

const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replaceAll('%20', ' ');
for (const size of [180, 192, 512]) await sharp(Buffer.from(svg(1))).resize(size, size).png().toFile(out(`icon-${size}.png`));
await sharp(Buffer.from(svg(0.72))).resize(512, 512).png().toFile(out('maskable-512.png'));
console.log('Icons written');
