// Generates public/og.png (1200x630 share image), public/apple-touch-icon.png and public/favicon.svg.
// Run: node scripts/make-og.mjs  (re-run if you change the name, tagline or colours)
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const INK = '#111114';
const HALDI = '#F2B705';
const PARTS = ['#0F8B8D', '#F08A24', '#E5432F', '#3A9AD9', '#E0307A', '#4CAF50', '#3B3FB6', '#8E5BD8'];

// A laptop drawn in three-quarter view: lid with a code screen, keyboard deck, coloured parts floating out.
function laptop(x, y, s) {
  const keys = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) {
    const kx = 46 + c * 25 + r * 4, ky = 352 + r * 15;
    keys.push(`<rect x="${kx}" y="${ky}" width="20" height="11" rx="2.5" fill="${r === 2 && c === 5 ? HALDI : '#26272e'}"/>`);
  }
  const floaters = PARTS.map((c, i) => {
    const a = (i / PARTS.length) * Math.PI * 2;
    const fx = 205 + Math.cos(a) * 250, fy = 250 + Math.sin(a) * 175;
    return `<g transform="translate(${fx} ${fy}) rotate(${(i * 23) % 40 - 20})"><rect x="-22" y="-14" width="44" height="28" rx="6" fill="${c}"/><rect x="-14" y="-6" width="16" height="12" rx="2" fill="rgba(0,0,0,.28)"/></g>`;
  }).join('');
  return `<g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="205" cy="440" rx="240" ry="26" fill="rgba(0,0,0,.14)"/>
    ${floaters}
    <path d="M60 60 Q60 44 76 44 H334 Q350 44 350 60 V318 H60 Z" fill="#0b0b0e"/>
    <rect x="72" y="56" width="266" height="250" rx="4" fill="#0f1016"/>
    <rect x="72" y="56" width="266" height="20" fill="#181a22"/>
    <circle cx="84" cy="66" r="3.5" fill="#FF5F57"/><circle cx="96" cy="66" r="3.5" fill="#FEBC2E"/><circle cx="108" cy="66" r="3.5" fill="#28C840"/>
    <text x="86" y="104" font-family="Consolas, monospace" font-size="12" fill="#6B6A78">// hi, you found the screen</text>
    <text x="86" y="124" font-family="Consolas, monospace" font-size="12" fill="#C792EA">const <tspan fill="#82AAFF">harshitha</tspan><tspan fill="#D9D6E3"> = {</tspan></text>
    <text x="98" y="142" font-family="Consolas, monospace" font-size="12" fill="#D9D6E3">role: <tspan fill="#C3E88D">'SWE · GCVE networking'</tspan>,</text>
    <text x="98" y="160" font-family="Consolas, monospace" font-size="12" fill="#D9D6E3">mode: <tspan fill="#F78C6C">'build → break → rebuild'</tspan>,</text>
    <text x="86" y="178" font-family="Consolas, monospace" font-size="12" fill="#D9D6E3">};</text>
    <text x="86" y="250" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="38" fill="#FFF8EA">Harshitha</text>
    <rect x="72" y="292" width="266" height="14" fill="${HALDI}"/>
    <path d="M30 330 H380 L404 400 Q406 412 394 412 H16 Q4 412 6 400 Z" fill="#9a9da6"/>
    <path d="M30 330 H380 L384 342 H26 Z" fill="#b7bac2"/>
    <rect x="40" y="346" width="330" height="66" rx="4" fill="#1c1d23" opacity=".85"/>
    ${keys.join('')}
    <rect x="150" y="414" width="110" height="0" fill="none"/>
    <path d="M6 400 Q4 412 16 412 H394 Q406 412 404 400 L406 418 Q404 428 392 428 H18 Q6 428 4 418 Z" fill="#6e7079"/>
  </g>`;
}

const og = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx="68%" cy="38%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#efeeeb"/><stop offset="1" stop-color="#dedcd7"/></radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  ${laptop(610, 70, 1.12)}
  <text x="72" y="236" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="96" letter-spacing="-3" fill="${INK}">Harshitha</text>
  <text x="112" y="330" font-family="Arial Narrow, Arial, sans-serif" font-weight="700" font-size="96" letter-spacing="-3" fill="none" stroke="${INK}" stroke-width="2">Upadhyayula</text>
  <text x="74" y="404" font-family="Arial, sans-serif" font-size="28" fill="${INK}">I take things apart to see how they work,</text>
  <text x="74" y="442" font-family="Arial, sans-serif" font-size="28" fill="${INK}">then build them again.</text>
  <rect x="74" y="488" width="300" height="46" rx="23" fill="${INK}"/>
  <circle cx="352" cy="511" r="5" fill="${HALDI}"/>
  <text x="98" y="518" font-family="Arial, sans-serif" font-weight="700" font-size="20" fill="#f2f0ec">Take my laptop apart</text>
  <text x="74" y="584" font-family="Consolas, monospace" font-size="19" fill="#5d5d66">software engineer · tech videos · dance</text>
</svg>`;
await sharp(Buffer.from(og)).png().toFile('public/og.png');

// Icon: a tiny laptop with the yellow key
const icon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="${INK}"/>
  <rect x="7" y="7" width="18" height="12" rx="1.6" fill="#f2f0ec"/>
  <rect x="9" y="9" width="14" height="8" rx=".6" fill="#16151b"/>
  <rect x="10.5" y="11" width="6" height="1.4" rx=".7" fill="${HALDI}"/>
  <rect x="10.5" y="13.6" width="9" height="1.2" rx=".6" fill="#82AAFF"/>
  <path d="M4.5 21h23l-1.6 3.2a1.5 1.5 0 0 1-1.3.8H7.4a1.5 1.5 0 0 1-1.3-.8z" fill="#f2f0ec"/>
  <rect x="14" y="21.8" width="4" height="1.2" rx=".6" fill="${HALDI}"/>
</svg>`;
writeFileSync('public/favicon.svg', icon(32));
await sharp(Buffer.from(icon(180))).png().toFile('public/apple-touch-icon.png');
console.log('og.png, favicon.svg, apple-touch-icon.png written');
