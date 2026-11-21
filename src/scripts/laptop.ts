// The laptop: a procedural three.js model that tears down into its parts.
// Built entirely from code (extruded rounded slabs + canvas textures), so there are no model files to load.
// Proportions and finishes follow a modern unibody aluminium notebook: rounded plan corners, a thin base,
// near-flush black keys in a recessed well, a large glass trackpad, a bead-blasted (not brushed) shell.
// Scroll progress (0 = assembled, 1 = torn down) drives every part's pose; torn-down parts float.
// Opening a part flies it to a showcase in front of the camera; closing it snaps it back INTO
// the laptop, so visiting every part rebuilds the machine.
import {
  BackSide, Box3, BoxGeometry, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, DirectionalLight, DoubleSide,
  Euler, Group, HemisphereLight, InstancedMesh, MathUtils, Matrix4, Mesh, MeshBasicMaterial, MeshDepthMaterial,
  MeshPhysicalMaterial, NeutralToneMapping, Object3D, PointLight, AdditiveBlending, OrthographicCamera, PCFSoftShadowMap, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, Quaternion, Raycaster, RepeatWrapping, Scene, ShaderMaterial, SRGBColorSpace, Texture,
  TubeGeometry, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget, ExtrudeGeometry, Shape, Path,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { HorizontalBlurShader } from 'three/examples/jsm/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/examples/jsm/shaders/VerticalBlurShader.js';

export interface PartInfo { id: string; color: string; title: string }
export interface StickerInfo { id: string; icon: string; title: string }
export interface LaptopApi {
  setProgress(p: number): void;
  setXray(on: boolean): void;
  /** fly a part to the showcase in front of the camera */
  focus(id: string): void;
  /** send the showcased part away; install=true snaps it back into the laptop */
  release(install: boolean): void;
  /** pull every installed part back out */
  reset(): void;
  spinBy(radians: number): void;
  installed(): string[];
  playIntro(): void;
  skipIntro(): void;
  pointAt(id: string): { x: number; y: number };
}
interface Options {
  canvas: HTMLCanvasElement;
  parts: PartInfo[];
  stickers: StickerInfo[];
  labels: Map<string, HTMLElement>;
  onPick: (id: string, at: { x: number; y: number }) => void;
  onSticker: (id: string, at: { x: number; y: number }) => void;
  onHover: (id: string | null) => void;
  onInstalled: (ids: string[]) => void;
  reducedMotion: boolean;
}

/* ───────────── helpers ───────────── */
type V3 = [number, number, number];
interface Pose { pos: V3; rot: V3; scale: number }
const pose = (pos: V3, rot: V3 = [0, 0, 0], scale = 1): Pose => ({ pos, rot, scale });
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const rb = (w: number, h: number, d: number, r = 0.03, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2));
const rand = (k: number) => { const s = Math.sin(k * 12.9898) * 43758.5453; return s - Math.floor(s); };

interface MatOpts { rough?: number; metal?: number; env?: number; map?: Texture; transparent?: boolean; coat?: number; coatRough?: number; roughMap?: Texture; aniso?: number }
const mat = (color: string, o: MatOpts = {}) => {
  const m = new MeshPhysicalMaterial({
    color, roughness: o.rough ?? 0.55, metalness: o.metal ?? 0.05, map: o.map, transparent: o.transparent,
    clearcoat: o.coat ?? 0, clearcoatRoughness: o.coatRough ?? 0.2, roughnessMap: o.roughMap, anisotropy: o.aniso ?? 0,
  });
  m.envMapIntensity = o.env ?? 0.6;
  return m;
};
// bead-blasted aluminium: a fine, even grain in the roughness (no streaks)
let blastTex: Texture | null = null;
function blasted() {
  if (blastTex) return blastTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) { const v = 150 + (rand(i * 0.731) - 0.5) * 34; img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  blastTex = new CanvasTexture(c);
  blastTex.wrapS = blastTex.wrapT = RepeatWrapping;
  blastTex.repeat.set(3, 3);
  return blastTex;
}
// a rounded rectangle in the XZ plan, as a Shape (or a Path, for holes)
function rrect<T extends Path>(p: T, w: number, d: number, r: number): T {
  const x = -w / 2, y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + d - r); p.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  p.lineTo(x + r, y + d); p.quadraticCurveTo(x, y + d, x, y + d - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
}
// A slab with rounded plan corners and softly rounded edges, centred on the origin: w (x) × h (y) × d (z).
// An optional hole turns it into a ring (the walls of the bottom case).
function slab(w: number, h: number, d: number, r: number, bev = 0.01, hole?: [number, number, number]) {
  bev = Math.min(bev, h / 2 - 0.0005);
  const shape = rrect(new Shape(), w - 2 * bev, d - 2 * bev, r - bev);
  if (hole) shape.holes.push(rrect(new Path(), hole[0] + 2 * bev, hole[1] + 2 * bev, hole[2] + bev));
  const g = new ExtrudeGeometry(shape, { depth: h - 2 * bev, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 18 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(h - 2 * bev) / 2, 0);
  return g;
}
function mesh(geo: any, m: any, at: V3 = [0, 0, 0], shadow = true) {
  const x = new Mesh(geo, m);
  x.position.set(...at);
  x.castShadow = shadow;
  x.receiveShadow = true;
  return x;
}
function flat(w: number, d: number, m: any, at: V3, rotZ = 0) {
  const x = new Mesh(new PlaneGeometry(w, d), m);
  x.rotation.set(-Math.PI / 2, 0, rotZ);
  x.position.set(...at);
  x.receiveShadow = true;
  return x;
}
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g);
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  document.fonts?.ready.then(() => { g.clearRect(0, 0, w, h); draw(g); t.needsUpdate = true; });
  return t;
}

/* ───────────── palette ───────────── */
const INK = '#16151B';
const ALU = () => mat('#86888E', { metal: 1, rough: 0.5, env: 0.68, roughMap: blasted() });
const ALU_DECK = () => mat('#84868C', { metal: 1, rough: 0.56, env: 0.58, roughMap: blasted() });
// the shell's heights: a thin base, the deck on top, keys almost flush, the hinge just above
const CASE_R = 0.13, TUB_TOP = 0.135, DECK_Y = 0.1575, DECK_H = 0.045, KEY_Y = 0.1795, HINGE_Y = 0.222;
const GOLD = () => mat('#D4AF5A', { metal: 1, rough: 0.25, env: 1 });
const SILVER = () => mat('#D2D6DD', { metal: 1, rough: 0.22, env: 1.1 });
const COPPER = () => mat('#C27C52', { metal: 1, rough: 0.3, env: 1 });
// solder mask is glossy: a clear coat over a matte board
const PCB = (c = '#10302A') => mat(c, { rough: 0.6, env: 0.6, coat: 0.7, coatRough: 0.18 });
const BLACK = (rough = 0.5) => mat('#121216', { rough, env: 0.6 });
const OPEN = -1.88; // lid angle when open (about 108°)
const F_MONO = '"JetBrains Mono Variable", ui-monospace, monospace';
const F_DISP = '"Bricolage Grotesque Variable", sans-serif';

/* ───────────── the live display ─────────────
   Redrawn ~12 times a second: a boot screen, then an editor that types itself,
   live CPU / network graphs, a clock, and how many parts are back in. */
const CODE: [string, string][][] = [
  [['// hi, you found the screen', '#6B6A78']],
  [['const ', '#C792EA'], ['harshitha', '#82AAFF'], [' = {', '#D9D6E3']],
  [['  role: ', '#D9D6E3'], ["'SWE · GCVE networking'", '#C3E88D'], [',', '#D9D6E3']],
  [['  based: ', '#D9D6E3'], ["'Bengaluru'", '#C3E88D'], [',', '#D9D6E3']],
  [['  loves: ', '#D9D6E3'], ["['systems', 'dance', 'papers']", '#C3E88D'], [',', '#D9D6E3']],
  [['  mode: ', '#D9D6E3'], ["'build → break → rebuild'", '#F78C6C'], [',', '#D9D6E3']],
  [['};', '#D9D6E3']],
  [['', '#D9D6E3']],
  [['await ', '#C792EA'], ['teardown', '#82AAFF'], ['(harshitha);', '#D9D6E3']],
];
const CODE_CHARS = CODE.reduce((n, ln) => n + ln.reduce((m, [t]) => m + t.length, 0) + 1, 0);
interface ScreenState { power: number; bootAge: number; uiAge: number; installed: number; total: number; torn: number }
function makeScreen() {
  const W = 1280, H = 800;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace; tex.anisotropy = 8;
  const cpu = Array.from({ length: 64 }, (_, i) => 0.35 + 0.2 * Math.sin(i / 5));
  const rx = Array.from({ length: 64 }, (_, i) => 0.4 + 0.2 * Math.cos(i / 6));
  const tx = Array.from({ length: 64 }, (_, i) => 0.3 + 0.15 * Math.sin(i / 4 + 1));
  const walk = (a: number[], amp: number) => { a.shift(); a.push(Math.min(0.95, Math.max(0.05, a[a.length - 1] + (Math.random() - 0.5) * amp))); };
  const graph = (a: number[], x: number, y: number, w: number, h: number, col: string, fill: boolean) => {
    g.beginPath();
    a.forEach((val, i) => { const px = x + (i / (a.length - 1)) * w, py = y + h - val * h; i ? g.lineTo(px, py) : g.moveTo(px, py); });
    g.strokeStyle = col; g.lineWidth = 3; g.stroke();
    if (fill) { g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, col + '55'); gr.addColorStop(1, col + '00'); g.fillStyle = gr; g.fill(); }
  };
  const card = (x: number, y: number, w: number, h: number, title: string, value: string) => {
    g.fillStyle = '#141720'; g.beginPath(); g.roundRect(x, y, w, h, 14); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#7C7A89'; g.font = `500 18px ${F_MONO}`; g.fillText(title, x + 18, y + 32);
    g.fillStyle = '#F4F1EA'; g.font = `700 26px ${F_MONO}`; g.textAlign = 'right'; g.fillText(value, x + w - 18, y + 34); g.textAlign = 'left';
  };
  let last = 0;
  function draw(s: ScreenState) {
    g.fillStyle = '#07080b'; g.fillRect(0, 0, W, H);
    if (s.power < 0.02) return;
    // boot screen
    if (s.uiAge <= 0) {
      const k = Math.min(1, s.bootAge / 1.1);
      g.fillStyle = '#F4F1EA'; g.font = `800 120px ${F_DISP}`; g.textAlign = 'center';
      g.globalAlpha = Math.min(1, s.bootAge * 3); g.fillText('HU', W / 2, H / 2 + 20);
      g.fillStyle = '#2a2c36'; g.fillRect(W / 2 - 160, H / 2 + 90, 320, 6);
      g.fillStyle = '#F2B705'; g.fillRect(W / 2 - 160, H / 2 + 90, 320 * k, 6);
      g.globalAlpha = 1; g.textAlign = 'left';
      return;
    }
    const fade = Math.min(1, s.uiAge * 2.5);
    g.globalAlpha = fade;
    // wallpaper glow
    const wall = g.createRadialGradient(W * 0.75, H * 0.2, 40, W * 0.75, H * 0.2, 700);
    wall.addColorStop(0, '#1d2340'); wall.addColorStop(1, '#07080b'); g.fillStyle = wall; g.fillRect(0, 0, W, H);
    // menu bar
    g.fillStyle = 'rgba(10,11,15,.85)'; g.fillRect(0, 0, W, 40);
    g.fillStyle = '#F2B705'; g.beginPath(); g.arc(24, 20, 7, 0, 7); g.fill();
    g.fillStyle = '#D9D6E3'; g.font = `600 18px ${F_MONO}`; g.fillText('teardown', 42, 26);
    g.fillStyle = '#8b8a99'; g.fillText('File  Edit  View  Build', 160, 26);
    const now = new Date(); const clock = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    g.textAlign = 'right'; g.fillStyle = '#D9D6E3'; g.fillText(`${clock}`, W - 24, 26);
    g.fillStyle = '#28C840'; g.fillText('● online', W - 110, 26); g.textAlign = 'left';
    // editor window
    g.fillStyle = '#0f1117'; g.beginPath(); g.roundRect(24, 60, 760, 680, 16); g.fill();
    g.fillStyle = '#151821'; g.beginPath(); g.roundRect(24, 60, 760, 46, [16, 16, 0, 0]); g.fill();
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach((col, i) => { g.fillStyle = col; g.beginPath(); g.arc(50 + i * 24, 83, 7, 0, 7); g.fill(); });
    g.fillStyle = '#D9D6E3'; g.font = `500 18px ${F_MONO}`; g.fillText('whoami.ts', 140, 89);
    g.fillStyle = '#F2B705'; g.fillRect(130, 104, 110, 2);
    // code that types itself
    let budget = Math.floor(s.uiAge * 38);
    const typedAll = budget >= CODE_CHARS;
    g.font = `500 25px ${F_MONO}`;
    let caret: [number, number] = [96, 150];
    CODE.forEach((ln, i) => {
      const y = 150 + i * 40;
      g.fillStyle = '#3c3e4c'; g.fillText(String(i + 1).padStart(2, ' '), 44, y);
      let x = 96;
      for (const [t, col] of ln) {
        if (budget <= 0) break;
        const part = t.slice(0, budget); budget -= part.length;
        g.fillStyle = col; g.fillText(part, x, y); x += g.measureText(part).width;
        caret = [x, y];
      }
      if (budget > 0) { budget -= 1; caret = [96, y + 40]; }
    });
    if (typedAll) caret = [96 + g.measureText('await teardown(harshitha);').width + 6, 150 + 8 * 40];
    if (Math.floor(performance.now() / 530) % 2 === 0) { g.fillStyle = '#F2B705'; g.fillRect(caret[0] + 2, caret[1] - 22, 12, 28); }
    // terminal strip inside the editor
    g.fillStyle = '#0b0c11'; g.fillRect(40, 560, 728, 164);
    g.font = `500 19px ${F_MONO}`;
    const term = [
      ['$ ', '#F2B705', 'npm run teardown', '#D9D6E3'],
      ['✓ ', '#28C840', `${s.installed}/${s.total} parts back in`, '#D9D6E3'],
      ['→ ', '#82AAFF', s.torn > 0.5 ? 'laptop: disassembled. pick a part.' : 'scroll to take it apart', '#9a98a8'],
    ];
    term.forEach(([p, pc, t, tc], i) => { g.fillStyle = pc; g.fillText(p, 58, 596 + i * 36); g.fillStyle = tc; g.fillText(t, 84, 596 + i * 36); });
    // system cards
    walk(cpu, 0.18); walk(rx, 0.22); walk(tx, 0.2);
    card(808, 60, 448, 200, 'CPU · HU-CORE', `${Math.round(cpu[cpu.length - 1] * 100)}%`);
    graph(cpu, 826, 120, 412, 120, '#0F8B8D', true);
    card(808, 276, 448, 200, 'NET · GCVE', `${(rx[rx.length - 1] * 9.9).toFixed(1)} Gb/s`);
    graph(rx, 826, 336, 412, 120, '#3A9AD9', true);
    graph(tx, 826, 336, 412, 120, '#E0307A', false);
    card(808, 492, 448, 248, 'REBUILD', `${s.installed}/${s.total}`);
    const cx = 1032, cy = 630, rr = 62;
    g.lineWidth = 14; g.strokeStyle = '#232634'; g.beginPath(); g.arc(cx, cy, rr, 0, 7); g.stroke();
    g.strokeStyle = '#F2B705'; g.beginPath(); g.arc(cx, cy, rr, -Math.PI / 2, -Math.PI / 2 + (s.installed / Math.max(1, s.total)) * Math.PI * 2); g.stroke();
    g.fillStyle = '#F4F1EA'; g.font = `700 30px ${F_MONO}`; g.textAlign = 'center'; g.fillText(`${Math.round((s.installed / Math.max(1, s.total)) * 100)}%`, cx, cy + 10); g.textAlign = 'left';
    // status bar
    g.fillStyle = '#F2B705'; g.fillRect(0, 760, W, 40);
    g.fillStyle = '#16151B'; g.font = `600 18px ${F_MONO}`;
    g.fillText('● main   ⎇ teardown   UTF-8   Bengaluru, IN   HU-CORE 4.2GHz', 22, 786);
    g.globalAlpha = 1;
  }
  return {
    tex,
    update(now: number, s: ScreenState) {
      if (now - last < 80) return;
      last = now;
      draw(s);
      tex.needsUpdate = true;
    },
  };
}

/* ───────────── textures ───────────── */

/* ───────────── keyboard layout (a real laptop layout, in key units) ───────────── */
interface KeyDef { label: string; w: number; half?: 'up' | 'down'; row: number; x: number; hl?: boolean }
const KB_ROWS: [string, number][][] = [
  [['esc', 1], ['F1', 1], ['F2', 1], ['F3', 1], ['F4', 1], ['F5', 1], ['F6', 1], ['F7', 1], ['F8', 1], ['F9', 1], ['F10', 1], ['F11', 1], ['F12', 1], ['⏻', 1.5]],
  [['`', 1], ['1', 1], ['2', 1], ['3', 1], ['4', 1], ['5', 1], ['6', 1], ['7', 1], ['8', 1], ['9', 1], ['0', 1], ['-', 1], ['=', 1], ['delete', 1.5]],
  [['tab', 1.5], ['Q', 1], ['W', 1], ['E', 1], ['R', 1], ['T', 1], ['Y', 1], ['U', 1], ['I', 1], ['O', 1], ['P', 1], ['[', 1], [']', 1], ['\\', 1]],
  [['caps', 1.75], ['A', 1], ['S', 1], ['D', 1], ['F', 1], ['G', 1], ['H', 1], ['J', 1], ['K', 1], ['L', 1], [';', 1], ["'", 1], ['return', 1.75]],
  [['shift', 2.25], ['Z', 1], ['X', 1], ['C', 1], ['V', 1], ['B', 1], ['N', 1], ['M', 1], [',', 1], ['.', 1], ['/', 1], ['shift', 2.25]],
  [['fn', 1], ['ctrl', 1], ['⌥', 1], ['⌘', 1.25], ['', 5], ['⌘', 1.25], ['⌥', 1], ['←', 1], ['↑↓', 1], ['→', 1]],
];
function keyboardLayout(): KeyDef[] {
  const out: KeyDef[] = [];
  KB_ROWS.forEach((row, r) => {
    let x = 0;
    for (const [label, w] of row) {
      if (label === '↑↓') { out.push({ label: '↑', w, half: 'up', row: r, x: x + w / 2 }, { label: '↓', w, half: 'down', row: r, x: x + w / 2 }); }
      else out.push({ label, w, row: r, x: x + w / 2, hl: label === 'H' });
      x += w;
    }
  });
  return out;
}
const KB_COLS = 10; // atlas grid
const KB_CELL = 128;
// Two atlases with one cell per key: the printed cap (colour) and the backlit legend (emission).
function keyAtlases(keys: KeyDef[], aspect: (k: KeyDef) => number) {
  const rows = Math.ceil(keys.length / KB_COLS);
  const draw = (lit: boolean) => (g: CanvasRenderingContext2D) => {
    g.fillStyle = lit ? '#000000' : '#0d0d10'; g.fillRect(0, 0, KB_COLS * KB_CELL, rows * KB_CELL);
    keys.forEach((k, i) => {
      const cx = (i % KB_COLS) * KB_CELL, cy = Math.floor(i / KB_COLS) * KB_CELL;
      if (k.hl && !lit) { g.fillStyle = '#F2B705'; g.fillRect(cx, cy, KB_CELL, KB_CELL); }
      if (!lit) { // a shallow dish: lighter centre, darker rim, like a sculpted keycap
        const dish = g.createRadialGradient(cx + KB_CELL / 2, cy + KB_CELL * 0.45, 4, cx + KB_CELL / 2, cy + KB_CELL / 2, KB_CELL * 0.72);
        dish.addColorStop(0, 'rgba(255,255,255,.035)'); dish.addColorStop(0.8, 'rgba(0,0,0,0)'); dish.addColorStop(1, 'rgba(0,0,0,.2)');
        g.fillStyle = dish; g.fillRect(cx, cy, KB_CELL, KB_CELL);
      }
      g.save();
      g.translate(cx + KB_CELL / 2, cy + KB_CELL / 2);
      g.scale(1 / aspect(k), 1); // the cell is stretched across wide keys; pre-squash so text reads normally
      const small = k.label.length > 2;
      g.font = `${small ? 500 : 500} ${small ? 28 : k.row === 0 ? 30 : 44}px -apple-system, "Helvetica Neue", "Instrument Sans Variable", Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = lit ? (k.hl ? '#ffd24a' : '#ffffff') : k.hl ? '#16151B' : '#c9ccd6';
      g.fillText(k.label, 0, 2);
      g.restore();
    });
  };
  const w = KB_COLS * KB_CELL, h = rows * KB_CELL;
  return { map: canvasTex(w, h, draw(false)), glow: canvasTex(w, h, draw(true)), rows };
}

// A component label: coloured sticker with a name, small print and a barcode.
function partLabel(title: string, sub: string, bg: string, fg = '#16151B', w = 512, h = 160) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    g.font = `800 ${h * 0.3}px ${F_DISP}`; g.textBaseline = 'alphabetic'; g.fillText(title, w * 0.05, h * 0.42);
    g.font = `500 ${h * 0.13}px ${F_MONO}`; g.fillText(sub, w * 0.05, h * 0.66);
    g.globalAlpha = 0.85;
    for (let i = 0, x = w * 0.05; x < w * 0.6; i++) { const bw = 2 + rand(i + w) * 5; g.fillRect(x, h * 0.75, bw, h * 0.16); x += bw + 2 + rand(i * 3) * 4; }
    g.globalAlpha = 1;
    g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(w * 0.72, h * 0.16, h * 0.62, h * 0.62);
    for (let i = 0; i < 16; i++) if (rand(i + h) > 0.45) g.fillRect(w * 0.72 + (i % 4) * h * 0.155 + 4, h * 0.16 + Math.floor(i / 4) * h * 0.155 + 4, h * 0.12, h * 0.12);
  });
}

function engraving(lines: string[]) {
  return canvasTex(512, 512, (g) => {
    const grd = g.createLinearGradient(0, 0, 512, 512);
    grd.addColorStop(0, '#D7DAE0'); grd.addColorStop(1, '#AEB3BC');
    g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    g.fillStyle = 'rgba(30,30,40,.55)';
    g.font = `800 64px ${F_DISP}`; g.fillText(lines[0], 48, 120);
    g.font = `500 30px ${F_MONO}`; lines.slice(1).forEach((l, i) => g.fillText(l, 50, 190 + i * 46));
    g.beginPath(); g.moveTo(40, 440); g.lineTo(80, 470); g.lineTo(40, 470); g.fill();
  });
}

function pcbTexture() {
  return canvasTex(1024, 512, (g) => {
    g.fillStyle = '#10302A'; g.fillRect(0, 0, 1024, 512);
    g.strokeStyle = 'rgba(201,162,74,.45)'; g.lineWidth = 2.2;
    for (let i = 0; i < 90; i++) {
      let x = rand(i) * 1024, y = rand(i + 99) * 512;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 4; k++) { if (k % 2) y += (rand(i * 7 + k) - 0.5) * 220; else x += (rand(i * 5 + k) - 0.5) * 300; g.lineTo(x, y); }
      g.stroke();
      g.fillStyle = 'rgba(201,162,74,.7)'; g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.35)'; g.font = `500 16px ${F_MONO}`;
    g.fillText('HU-MB REV 2.0', 40, 490); g.fillText('MADE IN BENGALURU', 760, 490);
  });
}

function grilleTexture(dot = 'rgba(10,10,14,.75)') {
  const t = canvasTex(256, 512, (g) => {
    g.clearRect(0, 0, 256, 512);
    g.fillStyle = dot;
    for (let y = 8; y < 512; y += 12) for (let x = 8 + ((y / 12) % 2) * 6; x < 256; x += 12) { g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); }
  });
  return t;
}

// Comic stickers: die-cut white border, bold outline, flat colour, an icon.
const STICKER_COLORS = ['#F2B705', '#E5432F', '#3A9AD9', '#E0307A', '#4CAF50', '#F08A24', '#8E5BD8', '#0F8B8D'];
function stickerTexture(s: StickerInfo, i: number) {
  const col = STICKER_COLORS[i % STICKER_COLORS.length];
  return canvasTex(320, 320, (g) => {
    g.clearRect(0, 0, 320, 320);
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.fillStyle = '#FFFDF7'; g.beginPath(); g.roundRect(14, 14, 292, 292, 70); g.fill();
    g.fillStyle = col; g.strokeStyle = INK; g.lineWidth = 9;
    g.beginPath(); g.roundRect(34, 34, 252, 252, 56); g.fill(); g.stroke();
    g.save(); g.translate(160, 140); g.fillStyle = '#FFFDF7'; g.strokeStyle = INK; g.lineWidth = 8;
    drawIcon(g, s.icon); g.restore();
    g.fillStyle = INK; g.font = '700 40px "Kalam", cursive'; g.textAlign = 'center';
    g.fillText(s.title.toLowerCase(), 160, 262);
  });
}
function drawIcon(g: CanvasRenderingContext2D, icon: string) {
  const P = (pts: number[][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.stroke(); };
  switch (icon) {
    case 'plane': P([[-70, 10], [-10, 0], [20, -60], [40, -60], [25, 0], [70, 0], [80, 20], [25, 20], [40, 70], [20, 70], [-10, 20], [-60, 30]]); break;
    case 'camera': g.beginPath(); g.roundRect(-70, -40, 140, 95, 16); g.fill(); g.stroke(); P([[-30, -40], [-18, -62], [18, -62], [30, -40]]); g.fillStyle = INK; g.beginPath(); g.arc(0, 8, 30, 0, 7); g.fill(); g.fillStyle = '#FFFDF7'; g.beginPath(); g.arc(-8, 0, 8, 0, 7); g.fill(); break;
    case 'clapper': g.beginPath(); g.roundRect(-65, -15, 130, 80, 8); g.fill(); g.stroke(); P([[-65, -25], [60, -60], [66, -42], [-60, -6]]); break;
    case 'headphones': g.beginPath(); g.lineWidth = 16; g.arc(0, 10, 58, Math.PI, 0); g.stroke(); g.lineWidth = 8; g.beginPath(); g.roundRect(-74, 5, 34, 60, 12); g.fill(); g.stroke(); g.beginPath(); g.roundRect(40, 5, 34, 60, 12); g.fill(); g.stroke(); break;
    case 'sneaker': P([[-75, 40], [-70, -20], [-35, -25], [-10, 0], [40, 10], [75, 25], [75, 45]]); break;
    case 'code': g.font = `800 92px ${F_MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeText('</>', 0, 4); g.fillText('</>', 0, 4); break;
    case 'books': [[-60, 25, 120], [-50, -5, 100], [-40, -35, 85]].forEach(([x, y, w]) => { g.beginPath(); g.roundRect(x, y, w, 28, 5); g.fill(); g.stroke(); }); break;
    case 'pin': g.beginPath(); g.moveTo(0, 70); g.bezierCurveTo(-60, 0, -55, -65, 0, -65); g.bezierCurveTo(55, -65, 60, 0, 0, 70); g.fill(); g.stroke(); g.fillStyle = INK; g.beginPath(); g.arc(0, -20, 18, 0, 7); g.fill(); break;
    default: g.beginPath(); g.arc(0, 0, 50, 0, 7); g.fill(); g.stroke();
  }
}

/* ───────────── studio lighting ───────────── */
// An environment made of softboxes, so metal and glossy parts reflect a photo studio, not a room.
function studioEnvironment(renderer: WebGLRenderer) {
  const env = new Scene();
  env.add(new Mesh(new BoxGeometry(40, 40, 40), new MeshBasicMaterial({ color: new Color('#76767e'), side: BackSide })));
  const box = (w: number, h: number, pos: V3, look: V3, power: number, tint = '#ffffff') => {
    const m = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ color: new Color(tint).multiplyScalar(power), side: DoubleSide }));
    m.position.set(...pos); m.lookAt(...look); env.add(m);
  };
  box(14, 6, [0, 12, 2], [0, 0, 0], 4.5);              // big top softbox
  box(4, 12, [-12, 5, 4], [0, 0, 0], 1.25, '#e6ecf7'); // cool strip, left
  box(4, 12, [12, 5, -2], [0, 0, 0], 1.8, '#fff1df');  // warm strip, right
  box(18, 1.2, [0, 3, -14], [0, 0, 0], 3.0);           // rim line behind
  box(20, 7, [0, 1, 15], [0, 0, 0], 1.35);             // wide front fill (lights the front edges)
  box(30, 30, [0, -12, 0], [0, 0, 0], 0.55, '#f2efe9'); // pale floor bounce
  const pmrem = new PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}

/* ───────────── the model ───────────── */
interface PartRig {
  id: string | null; group: Group; a: (lid: number) => Pose; e: Pose; win: [number, number];
  lift: number; phase: number; order: 'XYZ' | 'YXZ'; side: number;
  inst: number; instTarget: number; show: number; showTarget: number; radius: number; tilt: Euler; onTop: boolean;
  arc: Vector3; // a sideways bulge in the teardown path, so parts that start together part ways cleanly
}
const easeBack = (t: number) => { const c = 1.4; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

export function createLaptop(o: Options): LaptopApi {
  const renderer = new WebGLRenderer({ canvas: o.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NeutralToneMapping; // product-photography colour response
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;

  const scene = new Scene();
  scene.environment = studioEnvironment(renderer);

  const camera = new PerspectiveCamera(30, 1, 0.1, 100);
  scene.add(new HemisphereLight('#FFF8EE', '#3F3B4A', 0.35));
  const key = new DirectionalLight('#FFF4E6', 1.6);
  key.position.set(4, 10, 6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 30 });
  key.shadow.bias = -0.0003;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new DirectionalLight('#FFFFFF', 0.3); rim.position.set(-1, 9, -9); scene.add(rim);

  /* ── soft contact shadows on the floor (depth rendered from below, then blurred) */
  const SW = 18, SH = 18, SDEPTH = 5;
  const shadowGroup = new Group();
  scene.add(shadowGroup);
  const rt = new WebGLRenderTarget(512, 512); rt.texture.generateMipmaps = false;
  const rtBlur = new WebGLRenderTarget(512, 512); rtBlur.texture.generateMipmaps = false;
  const shadowPlaneGeo = new PlaneGeometry(SW, SH).rotateX(Math.PI / 2);
  const shadowPlane = new Mesh(shadowPlaneGeo, new MeshBasicMaterial({ map: rt.texture, opacity: 0.62, transparent: true, depthWrite: false }));
  shadowPlane.renderOrder = 1; shadowPlane.scale.y = -1;
  shadowGroup.add(shadowPlane);
  const blurPlane = new Mesh(shadowPlaneGeo); blurPlane.visible = false; shadowGroup.add(blurPlane);
  const shadowCam = new OrthographicCamera(-SW / 2, SW / 2, SH / 2, -SH / 2, 0, SDEPTH);
  shadowCam.rotation.x = Math.PI / 2;
  shadowGroup.add(shadowCam);
  const depthMat = new MeshDepthMaterial();
  depthMat.userData.darkness = { value: 1.6 };
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.darkness = depthMat.userData.darkness;
    shader.fragmentShader = `uniform float darkness;\n${shader.fragmentShader.replace(
      'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
      'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );',
    )}`;
  };
  depthMat.depthTest = false; depthMat.depthWrite = false;
  const hBlur = new ShaderMaterial(HorizontalBlurShader); hBlur.depthTest = false;
  const vBlur = new ShaderMaterial(VerticalBlurShader); vBlur.depthTest = false;
  function blurShadow(amount: number) {
    blurPlane.visible = true;
    blurPlane.material = hBlur; hBlur.uniforms.tDiffuse.value = rt.texture; hBlur.uniforms.h.value = amount / 256;
    renderer.setRenderTarget(rtBlur); renderer.render(blurPlane, shadowCam);
    blurPlane.material = vBlur; vBlur.uniforms.tDiffuse.value = rtBlur.texture; vBlur.uniforms.v.value = amount / 256;
    renderer.setRenderTarget(rt); renderer.render(blurPlane, shadowCam);
    blurPlane.visible = false;
  }
  function renderContactShadow() {
    const clearAlpha = renderer.getClearAlpha();
    const scrimWas = scrim.visible;
    shadowPlane.visible = false; scrim.visible = false;
    scene.overrideMaterial = depthMat;
    renderer.setClearAlpha(0);
    renderer.setRenderTarget(rt); renderer.clear(); renderer.render(scene, shadowCam);
    scene.overrideMaterial = null;
    blurShadow(3.2); blurShadow(1.2);
    renderer.setRenderTarget(null); renderer.setClearAlpha(clearAlpha);
    shadowPlane.visible = true; scrim.visible = scrimWas;
  }

  /* ── the backdrop that tints in behind a showcased part */
  const scrimCanvas = document.createElement('canvas'); scrimCanvas.width = 512; scrimCanvas.height = 512;
  const scrimTex = new CanvasTexture(scrimCanvas); scrimTex.colorSpace = SRGBColorSpace;
  function paintScrim(hex: string) {
    const g = scrimCanvas.getContext('2d')!;
    const c = new Color(hex), light = c.clone().lerp(new Color('#ffffff'), 0.55), dark = c.clone().lerp(new Color('#000000'), 0.15);
    const grd = g.createRadialGradient(170, 240, 10, 256, 256, 380);
    grd.addColorStop(0, `#${light.getHexString()}`); grd.addColorStop(0.55, hex); grd.addColorStop(1, `#${dark.getHexString()}`);
    g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
    scrimTex.needsUpdate = true;
  }
  const scrim = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: scrimTex, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false }));
  scrim.renderOrder = 999; // drawn last in the main pass, over the whole scene
  scene.add(scrim);

  const color = (id: string) => o.parts.find((p) => p.id === id)?.color ?? '#888888';
  const rigs: PartRig[] = [];
  const add = (id: string | null, build: (g: Group) => void, a: Pose | ((lid: number) => Pose), e: Pose, win: [number, number], tilt: V3 = [0.6, 0, 0], side = 0) => {
    const group = new Group();
    build(group);
    group.traverse((m) => { if ((m as Mesh).isMesh && id) m.userData.part = id; });
    scene.add(group);
    const radius = new Box3().setFromObject(group).getSize(new Vector3()).length() / 2;
    rigs.push({
      id, group, a: typeof a === 'function' ? a : () => a, e, win, lift: 0, phase: rigs.length * 1.37, order: 'XYZ', side,
      inst: 0, instTarget: 0, show: 0, showTarget: 0, radius, tilt: new Euler(...tilt), onTop: false, arc: new Vector3(),
    });
    return rigs[rigs.length - 1];
  };

  // ── bottom case: a unibody tub (rounded corners, thin walls) so installed parts stay visible; ports and feet
  const baseRig = add(null, (g) => {
    const alu = ALU();
    g.add(mesh(slab(3.2, 0.05, 2.2, CASE_R, 0.016), alu, [0, 0.025, 0]));
    g.add(mesh(slab(3.201, TUB_TOP - 0.022, 2.201, CASE_R, 0.0015, [3.1, 2.1, CASE_R - 0.05]), alu, [0, 0.022 + (TUB_TOP - 0.022) / 2, 0]));
    g.add(mesh(new BoxGeometry(3.06, 0.004, 2.06), mat('#2A2B31', { rough: 0.8 }), [0, 0.052, 0]));
    // hinge: one long dark barrel across the back
    const hinge = mesh(new CylinderGeometry(0.038, 0.038, 2.7, 32), mat('#2B2C31', { metal: 0.6, rough: 0.45, env: 0.8 }), [0, HINGE_Y - 0.03, -1.075]); hinge.rotation.z = Math.PI / 2; g.add(hinge);
    // ports, sunk into the side walls: a magnetic charge port, two USB-C and a headphone jack on the left; HDMI, USB-C and a card slot on the right
    const port = BLACK(0.35), py = 0.075;
    const slot = (x: number, z: number, len: number, hgt = 0.026) => g.add(mesh(rb(0.02, hgt, len, Math.min(hgt, len) / 2 - 0.001, 3), port, [x, py, z], false));
    slot(-1.596, -0.62, 0.13, 0.018); slot(-1.596, -0.38, 0.075); slot(-1.596, -0.24, 0.075);
    const jack = mesh(new CylinderGeometry(0.014, 0.014, 0.02, 20), port, [-1.596, py, 0.55], false); jack.rotation.z = Math.PI / 2; g.add(jack);
    slot(1.596, -0.55, 0.12, 0.03); slot(1.596, -0.32, 0.075); slot(1.596, 0.45, 0.2, 0.012);
    for (const [x, z] of [[-1.3, -0.85], [1.3, -0.85], [-1.3, 0.85], [1.3, 0.85]]) g.add(mesh(new CylinderGeometry(0.1, 0.1, 0.012, 32), BLACK(0.85), [x, -0.004, z]));
  }, pose([0, 0, 0]), pose([0, -1.05, -0.25]), [0.25, 0.8]);

  // ── motherboard: sits in the tub (moves with the case)
  add(null, (g) => {
    g.add(mesh(new BoxGeometry(2.7, 0.025, 1.05), PCB(), [0, 0, 0]));
    g.add(flat(2.68, 1.03, mat('#ffffff', { map: pcbTexture(), rough: 0.55, env: 0.5, coat: 0.6, coatRough: 0.2 }), [0, 0.0135, 0]));
    const smd = new InstancedMesh(new BoxGeometry(1, 1, 1), BLACK(0.4), 140);
    const m4 = new Matrix4();
    for (let i = 0; i < 140; i++) {
      const w = 0.02 + rand(i) * 0.05, d = 0.02 + rand(i + 7) * 0.04;
      m4.compose(new Vector3((rand(i + 3) - 0.5) * 2.55, 0.022, (rand(i + 11) - 0.5) * 0.95), new Quaternion(), new Vector3(w, 0.018, d));
      smd.setMatrixAt(i, m4);
      smd.setColorAt(i, new Color(rand(i + 5) > 0.75 ? '#C9CDD4' : rand(i + 9) > 0.85 ? '#B8734A' : '#15161B'));
    }
    smd.castShadow = true; g.add(smd);
    for (let k = 0; k < 6; k++) g.add(mesh(new CylinderGeometry(0.035, 0.035, 0.07, 16), SILVER(), [-1.15 + k * 0.08, 0.045, 0.38]));
  }, pose([0, 0.055, -0.42]), pose([0, -1.05 + 0.055, -0.25 - 0.42]), [0.25, 0.8]);

  // ── CPU: substrate, engraved heat spreader
  add('cpu', (g) => {
    g.add(mesh(rb(0.48, 0.03, 0.48, 0.01), mat(color('cpu'), { rough: 0.45, coat: 0.5 }), [0, 0, 0]));
    for (let i = 0; i < 10; i++) g.add(mesh(new BoxGeometry(0.03, 0.01, 0.02), GOLD(), [-0.2 + i * 0.045, 0.012, 0.22], false));
    g.add(mesh(rb(0.38, 0.045, 0.38, 0.02), SILVER(), [0, 0.035, 0]));
    g.add(flat(0.34, 0.34, mat('#ffffff', { map: engraving(['HU-CORE', 'GCVE · NET · 2026', 'SWE-01  4.2GHz']), metal: 0.85, rough: 0.28, env: 1 }), [0, 0.0585, 0]));
  }, pose([-0.35, 0.085, -0.45]), pose([-1.8, 1.05, 1.3], [0.42, 0.25, 0], 2.15), [0.32, 0.86]);

  // ── GPU: card with shroud, fan and a copper fin stack
  add('gpu', (g) => {
    g.add(mesh(rb(0.66, 0.025, 0.48, 0.01), PCB('#141519'), [0, 0, 0]));
    g.add(mesh(rb(0.64, 0.07, 0.44, 0.03), mat(color('gpu'), { rough: 0.35, metal: 0.2, env: 0.8, coat: 0.6 }), [0, 0.05, 0]));
    g.add(mesh(new CylinderGeometry(0.17, 0.17, 0.02, 40), BLACK(0.6), [-0.12, 0.08, 0]));
    for (let k = 0; k < 9; k++) {
      const piv = new Group(); piv.position.set(-0.12, 0.09, 0); piv.rotation.y = (k / 9) * Math.PI * 2;
      const b = mesh(new BoxGeometry(0.13, 0.006, 0.04), BLACK(0.45), [0.085, 0, 0]); b.rotation.x = 0.45; piv.add(b); g.add(piv);
    }
    g.add(mesh(new CylinderGeometry(0.05, 0.05, 0.02, 24), mat(color('gpu'), { rough: 0.3, coat: 0.6 }), [-0.12, 0.095, 0]));
    const fins = new InstancedMesh(new BoxGeometry(0.008, 0.06, 0.34), COPPER(), 14);
    for (let i = 0; i < 14; i++) fins.setMatrixAt(i, new Matrix4().makeTranslation(0.12 + i * 0.013, 0.1, 0));
    fins.castShadow = true; g.add(fins);
    g.add(flat(0.3, 0.06, mat('#ffffff', { map: partLabel('GPU', 'RENDERS IDEAS · 12GB', '#16151B', '#F4F1EA', 512, 100) }), [-0.12, 0.0855, 0.19]));
  }, pose([0.35, 0.035, -0.45]), pose([0, 0.95, 2.0], [0.42, -0.1, 0], 2.05), [0.36, 0.9]);

  // ── RAM: two SO-DIMMs with heat spreaders and labels
  add('ram', (g) => {
    for (const z of [0, -0.24]) {
      g.add(mesh(rb(0.95, 0.02, 0.18, 0.008), PCB(), [0, 0, z]));
      g.add(mesh(new BoxGeometry(0.92, 0.006, 0.03), GOLD(), [0, 0.0, z + 0.078], false));
      g.add(mesh(rb(0.86, 0.025, 0.13, 0.01), mat(color('ram'), { metal: 0.6, rough: 0.32, env: 0.9, coat: 0.3 }), [-0.02, 0.022, z - 0.01]));
      g.add(flat(0.5, 0.1, mat('#ffffff', { map: partLabel('16GB DDR5', 'MEMORIES · 5600MT/s', '#F4F1EA', '#16151B', 512, 100) }), [-0.12, 0.0352, z - 0.01]));
    }
  }, pose([-1.0, 0.08, -0.3]), pose([-3.35, 0.95, 0.95], [0.42, 0.3, 0], 1.7), [0.3, 0.84]);

  // ── SSD: M.2 stick with controller, NAND and a label
  add('ssd', (g) => {
    g.add(mesh(rb(0.62, 0.018, 0.15, 0.006), PCB('#141519'), [0, 0, 0]));
    g.add(mesh(new BoxGeometry(0.1, 0.018, 0.09), BLACK(0.35), [-0.2, 0.017, 0]));
    g.add(mesh(new BoxGeometry(0.14, 0.018, 0.11), BLACK(0.35), [0.02, 0.017, 0]));
    g.add(mesh(new BoxGeometry(0.06, 0.006, 0.13), GOLD(), [0.3, 0.0, 0], false));
    g.add(flat(0.42, 0.12, mat('#ffffff', { map: partLabel('SSD 1TB', 'NVMe · PROJECTS SAVED', color('ssd')) }), [-0.05, 0.0275, 0]));
  }, pose([0.95, 0.08, -0.3]), pose([1.8, 1.05, 1.3], [0.42, -0.3, 0], 2.45), [0.34, 0.88]);

  // ── Wi-Fi card with a metal shield and antenna leads
  add('wifi', (g) => {
    g.add(mesh(rb(0.24, 0.016, 0.2, 0.006), PCB('#141519'), [0, 0, 0]));
    g.add(mesh(rb(0.2, 0.02, 0.13, 0.004), SILVER(), [0, 0.017, 0.02]));
    g.add(flat(0.16, 0.09, mat('#ffffff', { map: partLabel('Wi-Fi 7', 'CONNECTS PEOPLE', color('wifi'), '#ffffff', 256, 140) }), [0, 0.0275, 0.02]));
    for (const [x, c] of [[-0.05, '#ECE6F6'], [0.05, '#16151B']] as [number, string][]) {
      g.add(mesh(new CylinderGeometry(0.02, 0.02, 0.015, 16), GOLD(), [x, 0.015, -0.07]));
      const curve = new CatmullRomCurve3([new Vector3(x, 0.02, -0.07), new Vector3(x * 2, 0.08, -0.25), new Vector3(x * 3, 0.06, -0.45)]);
      g.add(mesh(new TubeGeometry(curve, 24, 0.007, 8), mat(c, { rough: 0.5 })));
    }
  }, pose([1.2, 0.08, -0.72]), pose([3.35, 0.95, 0.9], [0.42, -0.35, 0], 2.45), [0.38, 0.9]);

  // ── battery: wrapped cells with a spec label
  add('battery', (g) => {
    g.add(mesh(rb(2.2, 0.065, 0.62, 0.03), BLACK(0.7), [0, 0, 0]));
    for (let k = 0; k < 3; k++) g.add(mesh(rb(0.68, 0.06, 0.56, 0.025), mat('#1C1D23', { rough: 0.4, coat: 0.4 }), [-0.72 + k * 0.72, 0.01, 0]));
    g.add(flat(1.3, 0.34, mat('#ffffff', { map: partLabel('72Wh Li-ion', 'MOTIVATION · FAST CHARGE · 11.55V', color('battery')), coat: 0.3 }), [0, 0.0415, 0]));
    g.add(mesh(new BoxGeometry(0.2, 0.012, 0.08), GOLD(), [1.0, 0.035, -0.26], false));
  }, pose([0, 0.08, 0.55]), pose([0, 0.42, 3.0], [0.28, 0, 0], 1.1), [0.28, 0.82]);

  // ── speakers: a pair, each its own rig so they can move independently
  const grille = grilleTexture('rgba(255,255,255,.22)');
  for (const side of [-1, 1]) {
    add('speakers', (g) => {
      g.add(mesh(rb(0.3, 0.07, 0.56, 0.03), BLACK(0.55), [0, 0, 0]));
      g.add(flat(0.26, 0.52, mat(color('speakers'), { rough: 0.6, env: 0.4 }), [0, 0.0352, 0]));
      g.add(flat(0.26, 0.52, mat('#ffffff', { map: grille, transparent: true, rough: 0.6 }), [0, 0.036, 0]));
    }, pose([side * 1.38, 0.085, 0.55]), pose([side * 3.7, 0.65, 2.35], [0.32, 0, side * -0.15], 1.45), [0.3, 0.86], [0.6, 0, 0], side);
  }

  // ── keyboard layout, worked out first: the deck's underglow needs to know where every key sits
  const layout = keyboardLayout();
  const U = 0.1945, GAP = 0.032, X0 = -1.41;
  const rowZ = [-0.935, -0.77, -0.58, -0.39, -0.2, -0.01];
  const keySize = (k: KeyDef) => ({ w: k.w * U - GAP, d: k.row === 0 ? 0.1 : k.half ? 0.078 : 0.168 });
  const keyZ = (k: KeyDef) => rowZ[k.row] + (k.half === 'up' ? -0.043 : k.half === 'down' ? 0.043 : 0);

  // ── backlight underglow: a soft mask of every key, tinted by a gradient that drifts through the part colours
  const GW = 2.86, GD = 1.12, GZ = -0.455;
  const glowMask = canvasTex(1024, 400, (g) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, 1024, 400);
    g.filter = 'blur(7px)'; g.fillStyle = '#fff';
    for (const k of layout) {
      const s = keySize(k);
      const cx = ((X0 + k.x * U + GW / 2) / GW) * 1024, cz = ((keyZ(k) - GZ + GD / 2) / GD) * 400;
      const w = (s.w / GW) * 1024 + 10, h = (s.d / GD) * 400 + 10;
      g.beginPath(); g.roundRect(cx - w / 2, cz - h / 2, w, h, 8); g.fill();
    }
    g.filter = 'none';
  }, false);
  const glowUniforms = { uMask: { value: glowMask as Texture }, uTime: { value: 0 }, uPower: { value: 0 }, uSweep: { value: 0 } };
  const glowPlane = new Mesh(new PlaneGeometry(GW, GD), new ShaderMaterial({
    uniforms: glowUniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform sampler2D uMask; uniform float uTime, uPower, uSweep; varying vec2 vUv;
      vec3 pal(float t) {
        t = abs(fract(t) * 2.0 - 1.0);
        vec3 a = vec3(0.06, 0.55, 0.56), b = vec3(0.23, 0.60, 0.85), c = vec3(0.56, 0.36, 0.85), d = vec3(0.88, 0.19, 0.48);
        return t < 0.33 ? mix(a, b, t / 0.33) : t < 0.66 ? mix(b, c, (t - 0.33) / 0.33) : mix(c, d, (t - 0.66) / 0.34);
      }
      void main() {
        float m = texture2D(uMask, vUv).r;
        float on = smoothstep(vUv.x - 0.12, vUv.x, uSweep);
        gl_FragColor = vec4(pal(vUv.x * 0.55 + uTime * 0.035) * m * uPower * on * 0.85, 1.0);
      }`,
    transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  glowPlane.rotation.x = -Math.PI / 2;
  glowPlane.position.set(0, DECK_H / 2 + 0.0034, GZ);

  // ── keyboard deck (top case): one bead-blasted slab with rounded corners, a black keyboard well,
  //    speaker grilles either side, the trackpad recess and the thumb scoop on the front edge
  const deckGrille = grilleTexture('rgba(12,12,16,.85)');
  const deckRig = add('keyboard', (g) => {
    // the slab reaches down inside the case walls, so only its rounded top edge shows: one seamless side
    g.add(mesh(slab(3.198, DECK_H + 0.03, 2.198, CASE_R, 0.012), ALU_DECK(), [0, -0.015, 0]));
    // the well rises a hair above the deck, so the keys look set into it
    g.add(mesh(rb(2.92, 0.01, 1.13, 0.012), mat('#0b0b0d', { rough: 0.75, env: 0.3 }), [0, DECK_H / 2 - 0.002, -0.455]));
    g.add(glowPlane);
    for (const x of [-1.52, 1.52]) g.add(flat(0.12, 1.0, mat('#ffffff', { map: deckGrille, transparent: true }), [x, DECK_H / 2 + 0.0004, -0.46]));
    // a dark hairline round the trackpad, and the scoop you lift the lid with
    g.add(mesh(rb(1.41, 0.002, 0.87, 0.06), mat('#3a3b40', { rough: 0.6 }), [0, DECK_H / 2, 0.6], false));
    g.add(mesh(rb(0.42, 0.012, 0.05, 0.006), mat('#6b6d73', { metal: 1, rough: 0.5, env: 0.8 }), [0, DECK_H / 2 - 0.004, 1.088], false));
  }, pose([0, DECK_Y, 0]), pose([0, 1.95, -0.65], [0.24, 0, 0], 0.95), [0.15, 0.72], [0.75, 0, 0]);

  // ── keys: a real layout, sculpted caps, backlit legends
  const atlases = keyAtlases(layout, (k) => { const s = keySize(k); return s.w / s.d; });
  for (const t of [atlases.map, atlases.glow]) t.wrapS = t.wrapT = RepeatWrapping;
  const keySide = mat('#0c0c0f', { rough: 0.7, env: 0.25 });
  const keys: Mesh[] = [];
  const keyTops: MeshPhysicalMaterial[] = [];
  const keyHome: Vector3[] = [], keyFly: Vector3[] = [], keySpin: Euler[] = [], keyCol: number[] = [], keyRow: number[] = [];
  const geoCache = new Map<string, RoundedBoxGeometry>();
  layout.forEach((k, i) => {
    const s = keySize(k);
    const gk = `${s.w.toFixed(3)}x${s.d.toFixed(3)}`;
    if (!geoCache.has(gk)) geoCache.set(gk, rb(s.w, 0.022, s.d, 0.009, 3));
    const cell = (t: Texture) => { const c = t.clone(); c.repeat.set(1 / KB_COLS, 1 / atlases.rows); c.offset.set((i % KB_COLS) / KB_COLS, 1 - (Math.floor(i / KB_COLS) + 1) / atlases.rows); return c; };
    const top = mat('#ffffff', { map: cell(atlases.map), rough: 0.62, env: 0.25 });
    top.emissiveMap = cell(atlases.glow);
    top.emissive = new Color(k.hl ? '#ffc43a' : '#cfeaff');
    top.emissiveIntensity = 0;
    const m = new Mesh(geoCache.get(gk)!, [keySide, keySide, top, keySide, keySide, keySide]);
    m.castShadow = true; m.receiveShadow = true; m.userData.part = 'keyboard';
    scene.add(m); keys.push(m); keyTops.push(top);
    keyHome.push(new Vector3(X0 + k.x * U, KEY_Y, keyZ(k)));
    keyCol.push(k.x / 14.5); keyRow.push(k.row);
    // torn down: the keys lift off as one floating sheet, rows fanning back a little
    keyFly.push(new Vector3(0, 0.42 + k.row * 0.035, -0.06 * k.row));
    keySpin.push(new Euler(-0.08 - k.row * 0.02, 0, 0));
  });

  // ── trackpad: glass with a polished rim
  add('trackpad', (g) => {
    g.add(mesh(rb(1.38, 0.01, 0.84, 0.055, 4), mat('#72757B', { rough: 0.42, metal: 0.6, env: 0.55, coat: 0.15, coatRough: 0.3 }), [0, 0, 0]));
  }, pose([0, DECK_Y + DECK_H / 2 + 0.0035, 0.6]), pose([0, 1.75, 0.55], [0.38, 0, 0], 1.15), [0.2, 0.78], [0.9, 0, 0]);

  // ── lid: aluminium outer shell, a backlit logo, stickers. Pivot on the hinge.
  const stickerSpots: [number, number, number, number][] = [
    [-1.05, 0.45, 0.62, -0.18], [-0.25, 0.35, 0.5, 0.12], [0.6, 0.5, 0.6, -0.08], [1.2, 1.1, 0.5, 0.22],
    [-1.15, 1.35, 0.55, 0.1], [-0.35, 1.25, 0.6, -0.2], [0.45, 1.5, 0.52, 0.15], [1.1, 1.75, 0.46, -0.12],
  ];
  const logoMat = new MeshBasicMaterial({ map: canvasTex(256, 256, (g) => {
    g.clearRect(0, 0, 256, 256);
    g.fillStyle = '#ffffff'; g.font = `800 120px ${F_DISP}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('HU', 128, 136);
  }), transparent: true, toneMapped: false, color: new Color(0, 0, 0) });
  const lidRig = add(null, (g) => {
    g.add(mesh(slab(3.2, 0.036, 2.15, CASE_R, 0.012), ALU(), [0, 0.026, 1.075]));
    g.add(mesh(new CylinderGeometry(0.17, 0.17, 0.002, 64), mat('#C4C7CE', { metal: 1, rough: 0.06, env: 1.4 }), [0, 0.0445, 0.95]));
    g.add(flat(0.3, 0.3, logoMat, [0, 0.0462, 0.95]));
    o.stickers.slice(0, stickerSpots.length).forEach((s, i) => {
      const [x, z, size, tilt] = stickerSpots[i];
      const m = flat(size, size, mat('#ffffff', { map: stickerTexture(s, i), transparent: true, rough: 0.45, coat: 0.4 }), [x, 0.047 + i * 0.0003, z], tilt);
      m.userData.sticker = s.id;
      g.add(m);
    });
  }, (lid) => pose([0, HINGE_Y, -1.1], [OPEN * lid, 0, 0]), pose([-3.0, 2.15, -2.6], [-1.72, Math.PI, 0], 0.74), [0.14, 0.72]);
  lidRig.order = 'YXZ';
  lidRig.arc.set(-0.6, 0.35, -1.3); // the lid swings back and left, away from the screen

  // ── screen: thin glossy bezel, camera notch, a live display under glass, and light that spills onto the keys
  const screen = makeScreen();
  const dispMat = new MeshBasicMaterial({ map: screen.tex, toneMapped: false, color: new Color(0, 0, 0) });
  const spill = new PointLight('#c4d6f2', 0, 2.6, 2);
  const screenRig = add('screen', (g) => {
    g.add(mesh(slab(3.16, 0.02, 2.1, CASE_R - 0.012, 0.006), mat('#060607', { rough: 0.12, metal: 0.1, env: 0.9, coat: 1, coatRough: 0.03 }), [0, -0.017, 1.075]));
    const disp = new Mesh(new PlaneGeometry(3.06, 1.97), dispMat);
    disp.rotation.x = Math.PI / 2;
    disp.position.set(0, -0.0302, 1.065);
    g.add(disp);
    const glass = new Mesh(new PlaneGeometry(3.1, 2.03), new MeshPhysicalMaterial({ color: '#000000', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.8, clearcoat: 1 }));
    glass.rotation.x = Math.PI / 2; glass.position.set(0, -0.031, 1.07); g.add(glass);
    // notch with a camera lens
    g.add(mesh(rb(0.32, 0.006, 0.07, 0.03), mat('#050506', { rough: 0.3 }), [0, -0.0305, 2.065], false));
    g.add(mesh(new CylinderGeometry(0.014, 0.014, 0.004, 24), mat('#16233a', { rough: 0.05, env: 1.5, coat: 1 }), [0, -0.034, 2.065], false));
    spill.position.set(0, -0.6, 0.9);
    g.add(spill);
  }, (lid) => pose([0, HINGE_Y, -1.1], [OPEN * lid, 0, 0]), pose([3.0, 2.25, -2.1], [-1.72, 0, 0], 0.84), [0.0, 0.55], [-1.72, 0, 0]);
  screenRig.arc.set(0.6, 0.45, 1.2); // the screen comes forward and right first, clear of the lid

  /* ───────────── state ───────────── */
  let target = 0, prog = 0, lid = o.reducedMotion ? 1 : 0, lidTarget = lid;
  let hovered: string | null = null, showId: string | null = null, spin = 0, scrimAmt = 0;
  let introStart = 0, time = 0, last = performance.now(), rebuilt = 0, poweredAt = 0, dtNow = 1 / 60;
  // frame-rate independent easing toward a target (same feel at 60Hz and 120Hz)
  const damp = (cur: number, to: number, rate: number, dt: number) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
  const lidEase = (t: number) => { const c = 0.55; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const installedSet = new Set<string>();
  const totalParts = new Set(rigs.map((r) => r.id).filter(Boolean)).size;
  const pickables: Object3D[] = [];
  scene.traverse((m) => { if ((m as Mesh).isMesh && (m.userData.part || m.userData.sticker)) pickables.push(m); });

  const qA = new Quaternion(), qE = new Quaternion(), qI = new Quaternion(), qF = new Quaternion(), qS = new Quaternion(), sway = new Quaternion(), qy = new Quaternion();
  const e1 = new Euler(), v = new Vector3(), vv = new Vector3(), pA = new Vector3(), pE = new Vector3(), pI = new Vector3(), pS = new Vector3(), pFree = new Vector3();
  const boxTmp = new Box3(), Y = new Vector3(0, 1, 0), right = new Vector3();
  let kx = 1, kz = 1, portrait = false;

  // where a showcased part floats: left half on desktop, upper area on phones
  function showcasePoint(out: Vector3, dist: number) {
    out.set(portrait ? 0 : -0.46, portrait ? 0.42 : 0.02, 0.5).unproject(camera);
    return out.sub(camera.position).normalize().multiplyScalar(dist).add(camera.position);
  }

  function applyPoses(p: number) {
    const floatAmt = o.reducedMotion ? 0 : ease(clamp01((p - 0.55) / 0.45));
    const chassis = baseRig.group.position; // installed parts follow the case wherever it is
    for (const r of rigs) {
      const t = ease(clamp01((p - r.win[0]) / (r.win[1] - r.win[0])));
      const A = r.a(lid), E = r.e, A1 = r.a(1);
      // ease the installed / showcased blends toward their targets
      r.inst = o.reducedMotion ? r.instTarget : damp(r.inst, r.instTarget, 4.2, dtNow);
      r.show = o.reducedMotion ? r.showTarget : damp(r.show, r.showTarget, 4.8, dtNow);
      const inst = r.instTarget ? easeBack(clamp01(r.inst)) : ease(clamp01(r.inst));
      const show = ease(clamp01(r.show));
      const loose = (1 - clamp01(r.inst)) * (1 - show);
      const lift = r.id && r.id === hovered && p > 0.85 && loose > 0.9 ? 0.14 : 0;
      r.lift = damp(r.lift, lift, 9, dtNow);

      // exploded target, or its slot back inside the case
      pE.set(E.pos[0] * kx, E.pos[1], E.pos[2] * kz);
      pI.set(A1.pos[0], A1.pos[1], A1.pos[2]).add(chassis);
      pE.lerp(pI, inst);
      qE.setFromEuler(e1.set(E.rot[0], E.rot[1], E.rot[2], r.order));
      qI.setFromEuler(e1.set(A1.rot[0], A1.rot[1], A1.rot[2], r.order));
      qE.slerp(qI, clamp01(inst));
      const sE = MathUtils.lerp(E.scale, 1, clamp01(inst));

      // scroll: assembled → (exploded or installed)
      pA.set(A.pos[0], A.pos[1], A.pos[2]);
      qA.setFromEuler(e1.set(A.rot[0], A.rot[1], A.rot[2], r.order));
      r.group.position.lerpVectors(pA, pE, t);
      r.group.position.y += r.lift + Math.sin(time * 0.8 + r.phase) * 0.07 * floatAmt * loose;
      r.group.position.addScaledVector(r.arc, Math.sin(Math.PI * t) * loose); // bulges mid-flight, zero at both ends
      qF.slerpQuaternions(qA, qE, t);
      sway.setFromEuler(e1.set(Math.sin(time * 0.6 + r.phase) * 0.035 * floatAmt * loose, 0, Math.cos(time * 0.5 + r.phase) * 0.035 * floatAmt * loose, 'XYZ'));
      qF.multiply(sway);
      let scale = MathUtils.lerp(A.scale, sE, t);

      // showcase: float in front of the camera and turn slowly
      if (show > 0.001) {
        pFree.copy(r.group.position);
        const sc = ((portrait ? 0.62 : 1.25) / Math.max(0.2, r.radius)) * (r.id === 'speakers' ? 0.7 : 1);
        showcasePoint(pS, 8);
        if (r.side) { right.set(1, 0, 0).applyQuaternion(camera.quaternion); pS.addScaledVector(right, r.side * (portrait ? 0.38 : 0.55)); }
        qy.setFromAxisAngle(Y, spin);
        qS.setFromEuler(r.tilt).premultiply(qy);
        // aim the part's own centre (not its pivot) at the showcase point
        r.group.position.copy(pS); r.group.quaternion.copy(qS); r.group.scale.setScalar(sc); r.group.updateMatrixWorld(true);
        boxTmp.setFromObject(r.group).getCenter(v);
        pS.add(vv.copy(pS).sub(v));
        r.group.position.lerpVectors(pFree, pS, show);
        qF.slerp(qS, show);
        scale = MathUtils.lerp(scale, sc, show);
      }
      r.group.quaternion.copy(qF);
      r.group.scale.setScalar(scale);
    }

    // keys ride on the deck; they scatter only while the deck is loose
    const deck = deckRig.group;
    const looseDeck = (1 - clamp01(deckRig.inst)) * (1 - ease(clamp01(deckRig.show)));
    const hoverLift = hovered === 'keyboard' && p > 0.85 && looseDeck > 0.9 ? 0.14 : 0;
    deck.updateMatrixWorld(true);
    for (let k = 0; k < keys.length; k++) {
      // columns peel off left to right, then the whole sheet of keys ripples
      const tk = ease(clamp01((p - 0.1 - keyCol[k] * 0.22) / 0.42)) * looseDeck;
      const wave = Math.sin(time * 1.9 - keyCol[k] * 7 - keyRow[k] * 0.7);
      v.copy(keyHome[k]).sub(vv.set(0, DECK_Y, 0)).applyMatrix4(deck.matrixWorld);
      v.addScaledVector(keyFly[k], tk);
      v.y += hoverLift * 0.6 + wave * 0.045 * floatAmt * looseDeck;
      qA.setFromEuler(e1.set(keySpin[k].x * tk + Math.cos(time * 1.9 - keyCol[k] * 7 - keyRow[k] * 0.7) * 0.14 * floatAmt * looseDeck, 0, 0, 'XYZ')).premultiply(deck.quaternion);
      keys[k].position.copy(v);
      keys[k].quaternion.copy(qA);
      keys[k].scale.setScalar(deck.scale.x);
    }

    // the floor follows the case down
    shadowGroup.position.set(0, MathUtils.lerp(-0.01, -1.12, ease(clamp01(p))), MathUtils.lerp(0, -0.1, ease(clamp01(p))));

    // tinted backdrop behind the showcased part
    const anyShow = rigs.reduce((m, r) => Math.max(m, r.show), 0);
    scrimAmt = ease(clamp01(anyShow));
    showcasePoint(scrim.position, 11);
    scrim.quaternion.copy(camera.quaternion);
    scrim.scale.set(30, 30, 1);
    (scrim.material as MeshBasicMaterial).opacity = scrimAmt * 0.62; // translucent: the split laptop shows through, tinted
    scrim.visible = scrimAmt > 0.002;
  }

  /* ───────────── camera ───────────── */
  let W = 1, H = 1;
  const camA = new Vector3(), camE = new Vector3(), look = new Vector3();
  function placeCamera(p: number) {
    const aspect = W / H;
    portrait = aspect < 0.9;
    kx = portrait ? 0.5 : 1;
    kz = portrait ? 1.3 : 1;
    const far = Math.max(1, 1.62 / aspect);
    const t = ease(clamp01(p));
    const pa = Math.max(1, 2.1 * (0.46 / aspect)), pe = Math.max(1, 1.5 * (0.46 / aspect));
    camA.set(0.6, 3.4, 7.8).multiplyScalar(portrait ? pa : far);
    camE.set(0, 7.0, 14.2).multiplyScalar(portrait ? pe : far);
    camera.position.lerpVectors(camA, camE, t);
    if (!o.reducedMotion) camera.position.x += Math.sin(time * 0.25) * 0.25 * t * (1 - scrimAmt);
    look.set(0, MathUtils.lerp(0.6, 1.3, t), MathUtils.lerp(0, 0.4, t));
    // once every part is back in, glide down to the rebuilt laptop
    rebuilt = damp(rebuilt, installedSet.size >= totalParts ? 1 : 0, 2.2, dtNow);
    if (rebuilt > 0.001) {
      const r = ease(clamp01(rebuilt)) * t, ch = baseRig.group.position;
      camera.position.lerp(vv.copy(camA).multiplyScalar(1.05).add(ch), r);
      look.lerp(v.set(0, 0.55, 0).add(ch), r);
    }
    camera.lookAt(look);
    const off = 1 - t;
    if (portrait) camera.setViewOffset(W, H, 0, -H * (0.14 * off + 0.1 * t), W, H);
    else camera.setViewOffset(W, H, -W * 0.17 * off, 0, W, H);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  function resize() {
    const r = o.canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(o.canvas);
  resize();

  /* ───────────── labels follow their parts ───────────── */
  const box = new Box3();
  const rigOf = (id: string) => rigs.find((x) => x.id === id);
  function anchor(id: string) {
    const r = rigOf(id);
    if (!r) return v.set(0, 0, 0);
    const targetObj = id === 'speakers' ? rigs.filter((x) => x.id === 'speakers').pop()!.group : r.group;
    box.setFromObject(targetObj);
    box.getCenter(v);
    v.y = box.max.y + 0.08;
    if (id === 'screen' || id === 'battery') v.z = box.max.z;
    if (id === 'keyboard') v.z = box.min.z;
    return v;
  }
  function project(id: string) {
    anchor(id).project(camera);
    return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
  }
  function placeLabels(p: number) {
    const base = clamp01((p - 0.8) / 0.15) * (1 - scrimAmt);
    o.labels.forEach((el, id) => {
      let show = base;
      if (id === 'stickers') {
        show *= 1 - clamp01(lidRig.inst * 1.5);
        box.setFromObject(lidRig.group); box.getCenter(v); v.y = box.max.y + 0.05; v.project(camera);
        el.style.transform = `translate(${(v.x * 0.5 + 0.5) * W}px, ${(-v.y * 0.5 + 0.5) * H}px)`;
      } else {
        const r = rigOf(id);
        if (r) show *= 1 - clamp01(r.inst * 1.5);
        const { x, y } = project(id);
        el.style.transform = `translate(${x}px, ${y}px)`;
      }
      el.style.opacity = String(show);
      el.style.visibility = show > 0.02 ? 'visible' : 'hidden';
    });
  }

  /* ───────────── picking ───────────── */
  const ray = new Raycaster();
  const ndc = new Vector2();
  function hit(e: PointerEvent | MouseEvent) {
    const r = o.canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const h = ray.intersectObjects(pickables, false)[0];
    return h ? h.object : null;
  }
  o.canvas.addEventListener('pointermove', (e) => {
    const obj = hit(e);
    o.canvas.style.cursor = obj ? 'pointer' : '';
    const partId = obj?.userData.part ?? null;
    if (partId !== hovered) { hovered = partId; o.onHover(partId); }
  });
  o.canvas.addEventListener('pointerleave', () => { hovered = null; o.onHover(null); });
  o.canvas.addEventListener('click', (e) => {
    const obj = hit(e);
    if (!obj) return;
    const at = { x: e.clientX, y: e.clientY };
    if (obj.userData.sticker) o.onSticker(obj.userData.sticker, at);
    else if (obj.userData.part) o.onPick(obj.userData.part, at);
  });

  /* ───────────── x-ray ───────────── */
  function setXray(on: boolean) {
    scene.traverse((m) => {
      const mm = m as Mesh;
      if (!mm.isMesh || mm === shadowPlane || mm === scrim || mm === blurPlane) return;
      const ms = (Array.isArray(mm.material) ? mm.material : [mm.material]) as MeshPhysicalMaterial[];
      ms.forEach((x) => { if (!x.transparent && !(x as any).isMeshBasicMaterial) { x.wireframe = on; x.needsUpdate = true; } });
    });
  }

  /* ───────────── loop ───────────── */
  let frameNo = 0;
  function frame(now: number) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (document.hidden) return;
    time += dt;
    dtNow = dt;
    if (showId && !o.reducedMotion) spin += dt * 0.35;
    if (introStart) {
      const t = clamp01((now - introStart) / 1600);
      lid = lidEase(t);
      if (t > 0.5 && !poweredAt) poweredAt = now; // the screen wakes as the lid passes halfway
      if (t >= 1) introStart = 0;
    } else lid = damp(lid, lidTarget, 12, dt);
    prog = o.reducedMotion ? target : damp(prog, target, 5.5, dt);

    // power-on: a flicker, a boot screen, then the UI and a backlight sweep across the keys
    const age = poweredAt ? (now - poweredAt) / 1000 : -1;
    const power = age < 0 ? 0 : age < 0.25 ? 0.35 + Math.random() * 0.5 : 1;
    const uiAge = age - 1.25;
    const sweep = clamp01((uiAge - 0.05) / 0.9) * 1.15;
    dispMat.color.setScalar(power);
    logoMat.color.setScalar(power * 0.9);
    spill.intensity = power * 0.4;
    const lifted = ease(clamp01((prog - 0.1) / 0.6)) * (1 - clamp01(deckRig.inst)) * (1 - clamp01(deckRig.show));
    glowUniforms.uPower.value = power * (1 - 0.85 * lifted);
    glowUniforms.uSweep.value = sweep;
    glowUniforms.uTime.value = time;
    for (let k = 0; k < keyTops.length; k++) keyTops[k].emissiveIntensity = power * 0.9 * clamp01((sweep - keyCol[k]) * 6);
    screen.update(now, { power, bootAge: Math.max(0, age), uiAge, installed: installedSet.size, total: totalParts, torn: prog });
    placeCamera(prog);
    applyPoses(prog);
    placeLabels(prog);
    if ((frameNo++ & 1) === 0) renderContactShadow(); // every other frame is plenty
    // A showcased part lives on layer 1 and is drawn in a second pass, after the tinted backdrop,
    // so nothing else in the scene can ever sit in front of it.
    let onTop = false;
    for (const r of rigs) {
      const want = r.show > 0.002;
      if (want !== r.onTop) {
        r.onTop = want;
        r.group.traverse((m) => m.layers.set(want ? 1 : 0));
        if (r === deckRig) keys.forEach((k) => k.layers.set(want ? 1 : 0));
      }
      onTop ||= want;
    }
    camera.layers.set(0);
    renderer.render(scene, camera);
    if (onTop) {
      renderer.autoClear = false;
      renderer.clearDepth();
      camera.layers.set(1);
      renderer.render(scene, camera);
      camera.layers.set(0);
      renderer.autoClear = true;
    }
  }
  scene.traverse((o) => { if ((o as any).isLight) o.layers.enableAll(); });
  requestAnimationFrame(frame);

  return {
    setProgress: (p) => { target = clamp01(p); },
    setXray,
    focus: (id) => {
      rigs.forEach((r) => { r.showTarget = r.id === id ? 1 : 0; });
      showId = rigOf(id) ? id : null;
      if (showId) { paintScrim(color(id)); spin = -0.35; }
    },
    release: (install) => {
      if (!showId) return;
      const id = showId;
      rigs.forEach((r) => {
        // the stickered lid has no room of its own: it goes back on with the screen
        if (r.id !== id && !(id === 'screen' && r === lidRig)) return;
        r.showTarget = 0;
        if (install) { r.instTarget = 1; r.inst = Math.min(r.inst, 0.02); }
      });
      if (install) { installedSet.add(id); o.onInstalled(Array.from(installedSet)); }
      showId = null;
    },
    reset: () => {
      installedSet.clear();
      rigs.forEach((r) => { r.instTarget = 0; });
      o.onInstalled([]);
    },
    spinBy: (rad) => { spin += rad; },
    installed: () => Array.from(installedSet),
    playIntro: () => { lid = 0; lidTarget = 1; poweredAt = 0; setTimeout(() => { introStart = performance.now(); }, 450); },
    skipIntro: () => { introStart = 0; lid = 1; lidTarget = 1; poweredAt = performance.now() - 5000; },
    pointAt: (id) => {
      const q = project(id);
      const r = o.canvas.getBoundingClientRect();
      return { x: q.x + r.left, y: q.y + r.top };
    },
  };
}
