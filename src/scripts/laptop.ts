// The laptop: a procedural three.js model that tears down into its parts.
// Built entirely from code (rounded boxes + canvas textures), so there are no model files to load.
// Scroll progress (0 = assembled, 1 = torn down) drives every part's pose; torn-down parts float.
// Opening a part flies it to a showcase in front of the camera; closing it snaps it back INTO
// the laptop, so visiting every part rebuilds the machine.
import {
  BackSide, Box3, BoxGeometry, CanvasTexture, CatmullRomCurve3, Color, CylinderGeometry, DirectionalLight, DoubleSide,
  Euler, Group, HemisphereLight, InstancedMesh, MathUtils, Matrix4, Mesh, MeshBasicMaterial, MeshDepthMaterial,
  MeshPhysicalMaterial, NeutralToneMapping, Object3D, OrthographicCamera, PCFSoftShadowMap, PerspectiveCamera,
  PlaneGeometry, PMREMGenerator, Quaternion, Raycaster, RepeatWrapping, Scene, ShaderMaterial, SRGBColorSpace, Texture,
  TubeGeometry, Vector2, Vector3, WebGLRenderer, WebGLRenderTarget,
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
// fine horizontal streaks, like brushed aluminium
let brushedTex: Texture | null = null;
function brushed() {
  if (brushedTex) return brushedTex;
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgb(150,150,150)'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const y = rand(i) * 512, l = 40 + rand(i + 1) * 260, x = rand(i + 2) * 512, s = 120 + rand(i + 3) * 70;
    g.fillStyle = `rgba(${s},${s},${s},0.35)`; g.fillRect(x, y, l, 1);
  }
  brushedTex = new CanvasTexture(c);
  brushedTex.wrapS = brushedTex.wrapT = RepeatWrapping;
  brushedTex.repeat.set(2, 2);
  return brushedTex;
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
const ALU = () => mat('#8A8D96', { metal: 1, rough: 0.36, env: 1.0, roughMap: brushed(), aniso: 0.55 });
const ALU_DECK = () => mat('#80838C', { metal: 1, rough: 0.4, env: 0.95, roughMap: brushed(), aniso: 0.55 });
const GOLD = () => mat('#D4AF5A', { metal: 1, rough: 0.25, env: 1 });
const SILVER = () => mat('#D2D6DD', { metal: 1, rough: 0.22, env: 1.1 });
const COPPER = () => mat('#C27C52', { metal: 1, rough: 0.3, env: 1 });
// solder mask is glossy: a clear coat over a matte board
const PCB = (c = '#10302A') => mat(c, { rough: 0.6, env: 0.6, coat: 0.7, coatRough: 0.18 });
const BLACK = (rough = 0.5) => mat('#121216', { rough, env: 0.6 });
const OPEN = -1.88; // lid angle when open (about 108°)
const F_MONO = '"JetBrains Mono Variable", ui-monospace, monospace';
const F_DISP = '"Bricolage Grotesque Variable", sans-serif';

/* ───────────── textures ───────────── */
function screenTexture() {
  return canvasTex(1280, 800, (g) => {
    g.fillStyle = '#0F1016'; g.fillRect(0, 0, 1280, 800);
    // window chrome
    g.fillStyle = '#181A22'; g.fillRect(0, 0, 1280, 56);
    ['#FF5F57', '#FEBC2E', '#28C840'].forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(34 + i * 30, 28, 9, 0, 7); g.fill(); });
    g.fillStyle = '#0F1016'; g.fillRect(150, 12, 220, 44);
    g.fillStyle = '#D9D6E3'; g.font = `500 22px ${F_MONO}`; g.fillText('whoami.ts', 178, 42);
    g.fillStyle = '#F2B705'; g.fillRect(150, 12, 220, 3);
    g.fillStyle = '#7C7A89'; g.fillText('teardown.ts', 400, 42);
    // gutter + code
    const lines: [string, string][][] = [
      [['// hi, you found the screen', '#6B6A78']],
      [['const ', '#C792EA'], ['harshitha', '#82AAFF'], [' = {', '#D9D6E3']],
      [['  role: ', '#D9D6E3'], ["'SWE · GCVE networking'", '#C3E88D'], [',', '#D9D6E3']],
      [['  based: ', '#D9D6E3'], ["'Bengaluru'", '#C3E88D'], [',', '#D9D6E3']],
      [['  loves: ', '#D9D6E3'], ["['systems', 'dance', 'papers']", '#C3E88D'], [',', '#D9D6E3']],
      [['  mode: ', '#D9D6E3'], ["'build → break → rebuild'", '#F78C6C'], [',', '#D9D6E3']],
      [['};', '#D9D6E3']],
      [['', '#D9D6E3']],
      [['teardown', '#82AAFF'], ['(harshitha, { gently: ', '#D9D6E3'], ['true', '#F78C6C'], [' });', '#D9D6E3']],
    ];
    g.font = `500 30px ${F_MONO}`;
    lines.forEach((ln, i) => {
      const y = 120 + i * 44;
      g.fillStyle = '#4A4957'; g.fillText(String(i + 1).padStart(2, ' '), 36, y);
      let x = 110;
      ln.forEach(([t, c]) => { g.fillStyle = c; g.fillText(t, x, y); x += g.measureText(t).width; });
    });
    g.fillStyle = '#F2B705'; g.fillRect(110 + 0, 120 + 8 * 44 + 10, 16, 34);
    // big name card
    g.fillStyle = '#FFF8EA'; g.font = `800 92px ${F_DISP}`;
    g.fillText('Harshitha', 110, 620);
    g.fillStyle = '#9A98A8'; g.font = `500 28px ${F_MONO}`;
    g.fillText('scroll ↓ to take this laptop apart', 114, 672);
    // status bar
    g.fillStyle = '#F2B705'; g.fillRect(0, 760, 1280, 40);
    g.fillStyle = '#16151B'; g.font = `600 20px ${F_MONO}`;
    g.fillText('● main   ⎇ teardown   UTF-8   Bengaluru, IN', 24, 787);
  });
}

// One atlas with every key legend; each keycap shows its cell via texture offset.
const LEGENDS = [
  ['esc', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', '⌫'],
  ['tab', 'Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P', '[', ']', '\\'],
  ['caps', 'A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', ';', "'", '', '⏎'],
  ['⇧', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', ',', '.', '/', '', '↑', '⇧'],
  ['fn', 'ctrl', '⌥', '⌘', '', '', '', '', '', '', '⌘', '←', '↓', '→'],
];
function legendAtlas() {
  return canvasTex(1024, 512, (g) => {
    g.fillStyle = '#1B1C22'; g.fillRect(0, 0, 1024, 512);
    LEGENDS.forEach((row, r) => row.forEach((k, c) => {
      const x = (c % 14) * (1024 / 14), y = r * (512 / 5);
      const hl = r === 2 && c === 6; // the H key, in haldi
      if (hl) { g.fillStyle = '#F2B705'; g.fillRect(x, y, 1024 / 14, 512 / 5); }
      g.fillStyle = hl ? '#16151B' : '#D8D9E0';
      g.font = `${k.length > 1 ? 500 : 600} ${k.length > 2 ? 15 : k.length > 1 ? 18 : 26}px ${F_MONO}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(k, x + 1024 / 28, y + 512 / 10);
    }));
  });
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
  box(4, 12, [-12, 5, 4], [0, 0, 0], 2.2, '#dfe8ff');  // cool strip, left
  box(4, 12, [12, 5, -2], [0, 0, 0], 1.8, '#fff1df');  // warm strip, right
  box(18, 1.2, [0, 3, -14], [0, 0, 0], 3.0);           // rim line behind
  box(20, 7, [0, 1, 15], [0, 0, 0], 1.7);              // wide front fill (lights the front edges)
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
  inst: number; instTarget: number; show: number; showTarget: number; radius: number; tilt: Euler;
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
  const rim = new DirectionalLight('#FFFFFF', 0.8); rim.position.set(-2, 5, -9); scene.add(rim);

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
  const scrim = new Mesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: scrimTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  scrim.renderOrder = 2;
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
      inst: 0, instTarget: 0, show: 0, showTarget: 0, radius, tilt: new Euler(...tilt),
    });
    return rigs[rigs.length - 1];
  };

  // ── bottom case: an open aluminium tub (so installed parts are visible), hinge, ports, feet
  const baseRig = add(null, (g) => {
    const alu = ALU();
    g.add(mesh(rb(3.2, 0.04, 2.2, 0.02, 4), alu, [0, 0.02, 0]));
    g.add(mesh(rb(3.2, 0.17, 0.05, 0.02, 3), alu, [0, 0.085, 1.075]));
    g.add(mesh(rb(3.2, 0.17, 0.05, 0.02, 3), alu, [0, 0.085, -1.075]));
    g.add(mesh(rb(0.05, 0.17, 2.2, 0.02, 3), alu, [1.575, 0.085, 0]));
    g.add(mesh(rb(0.05, 0.17, 2.2, 0.02, 3), alu, [-1.575, 0.085, 0]));
    g.add(mesh(new BoxGeometry(3.08, 0.004, 2.08), mat('#2A2B31', { rough: 0.8 }), [0, 0.042, 0]));
    const hinge = mesh(new CylinderGeometry(0.06, 0.06, 2.3, 24), BLACK(0.35), [0, 0.2, -1.08]); hinge.rotation.z = Math.PI / 2; g.add(hinge);
    for (const z of [-0.45, -0.25]) g.add(mesh(rb(0.03, 0.04, 0.12, 0.015), BLACK(0.3), [-1.6, 0.09, z], false));
    g.add(mesh(rb(0.03, 0.04, 0.12, 0.015), BLACK(0.3), [1.6, 0.09, -0.35], false));
    const jack = mesh(new CylinderGeometry(0.02, 0.02, 0.03, 16), BLACK(0.3), [1.6, 0.09, -0.6], false); jack.rotation.z = Math.PI / 2; g.add(jack);
    for (const [x, z] of [[-1.35, -0.85], [1.35, -0.85], [-1.35, 0.85], [1.35, 0.85]]) g.add(mesh(new CylinderGeometry(0.09, 0.09, 0.015, 24), BLACK(0.8), [x, -0.004, z]));
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
  }, pose([0.35, 0.07, -0.45]), pose([0, 0.95, 2.0], [0.42, -0.1, 0], 2.05), [0.36, 0.9]);

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

  // ── keyboard deck (top case) with speaker grilles either side of the keys
  const deckGrille = grilleTexture('rgba(12,12,16,.85)');
  const deckRig = add('keyboard', (g) => {
    g.add(mesh(rb(3.2, 0.05, 2.2, 0.05, 5), ALU_DECK(), [0, 0, 0]));
    g.add(mesh(rb(2.92, 0.02, 1.02, 0.015), BLACK(0.85), [0, 0.018, -0.5]));
    for (const x of [-1.52, 1.52]) g.add(flat(0.12, 0.95, mat('#ffffff', { map: deckGrille, transparent: true }), [x, 0.0262, -0.5]));
  }, pose([0, 0.195, 0]), pose([0, 1.95, -0.65], [0.24, 0, 0], 0.95), [0.15, 0.72], [0.75, 0, 0]);

  // ── keys: one mesh per key so each shows its own legend and flies on its own
  const atlas = legendAtlas();
  atlas.wrapS = atlas.wrapT = RepeatWrapping;
  const keySide = mat('#1B1C22', { rough: 0.55, env: 0.5, coat: 0.15 });
  const keyGeo = rb(0.168, 0.05, 0.158, 0.026, 2);
  const keys: Mesh[] = [];
  const keyHome: Vector3[] = [], keyFly: Vector3[] = [], keySpin: Euler[] = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) {
    if (r === 4 && c >= 4 && c < 10) continue;
    const tex = atlas.clone();
    tex.repeat.set(1 / 14, 1 / 5);
    tex.offset.set(c / 14, 1 - (r + 1) / 5);
    const top = mat('#ffffff', { map: tex, rough: 0.5, env: 0.5, coat: 0.15 });
    const m = new Mesh(keyGeo, [keySide, keySide, top, keySide, keySide, keySide]);
    m.castShadow = true; m.receiveShadow = true; m.userData.part = 'keyboard';
    scene.add(m); keys.push(m);
    keyHome.push(new Vector3(-1.3 + c * 0.2, 0.245, -0.9 + r * 0.19));
  }
  const space = new Mesh(rb(1.16, 0.05, 0.158, 0.026, 2), keySide);
  space.castShadow = true; space.userData.part = 'keyboard'; scene.add(space); keys.push(space);
  keyHome.push(new Vector3(-1.3 + 6.5 * 0.2, 0.245, -0.9 + 4 * 0.19));
  for (let k = 0; k < keys.length; k++) {
    keyFly.push(new Vector3((rand(k) - 0.5) * 0.8, 0.25 + rand(k + 50) * 0.5, (rand(k + 90) - 0.5) * 0.5));
    keySpin.push(new Euler((rand(k + 3) - 0.5) * 1.4, (rand(k + 4) - 0.5) * 2, (rand(k + 5) - 0.5) * 1.1));
  }

  // ── trackpad: glass
  add('trackpad', (g) => {
    g.add(mesh(rb(1.08, 0.02, 0.64, 0.05), mat('#3E4049', { rough: 0.2, metal: 0.2, env: 1, coat: 1, coatRough: 0.05 }), [0, 0, 0]));
  }, pose([0, 0.225, 0.62]), pose([0, 1.75, 0.55], [0.38, 0, 0], 1.15), [0.2, 0.78], [0.9, 0, 0]);

  // ── lid: aluminium outer shell, logo, stickers. Pivot on the hinge.
  const stickerSpots: [number, number, number, number][] = [
    [-1.05, 0.45, 0.62, -0.18], [-0.25, 0.35, 0.5, 0.12], [0.6, 0.5, 0.6, -0.08], [1.2, 1.1, 0.5, 0.22],
    [-1.15, 1.35, 0.55, 0.1], [-0.35, 1.25, 0.6, -0.2], [0.45, 1.5, 0.52, 0.15], [1.1, 1.75, 0.46, -0.12],
  ];
  const lidRig = add(null, (g) => {
    g.add(mesh(rb(3.2, 0.05, 2.15, 0.05, 5), ALU(), [0, 0.03, 1.075]));
    g.add(mesh(new CylinderGeometry(0.16, 0.16, 0.004, 48), mat('#B4B7BF', { metal: 1, rough: 0.12, env: 1.2 }), [0, 0.056, 0.95]));
    o.stickers.slice(0, stickerSpots.length).forEach((s, i) => {
      const [x, z, size, tilt] = stickerSpots[i];
      const m = flat(size, size, mat('#ffffff', { map: stickerTexture(s, i), transparent: true, rough: 0.45, coat: 0.4 }), [x, 0.0565 + i * 0.0003, z], tilt);
      m.userData.sticker = s.id;
      g.add(m);
    });
  }, (lid) => pose([0, 0.225, -1.1], [OPEN * lid, 0, 0]), pose([-3.0, 2.15, -2.3], [-1.72, Math.PI, 0], 0.74), [0.0, 0.62]);
  lidRig.order = 'YXZ';

  // ── screen: glossy bezel, webcam, display under a glass layer
  add('screen', (g) => {
    g.add(mesh(rb(3.12, 0.025, 2.07, 0.045), mat('#0B0B0E', { rough: 0.15, metal: 0.1, env: 0.9, coat: 1, coatRough: 0.04 }), [0, -0.018, 1.075]));
    const disp = new Mesh(new PlaneGeometry(2.96, 1.85), new MeshBasicMaterial({ map: screenTexture(), toneMapped: false }));
    disp.rotation.x = Math.PI / 2;
    disp.position.set(0, -0.0315, 1.06);
    g.add(disp);
    const glass = new Mesh(new PlaneGeometry(2.98, 1.87), new MeshPhysicalMaterial({ color: '#000000', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.6 }));
    glass.rotation.x = Math.PI / 2; glass.position.set(0, -0.033, 1.06); g.add(glass);
    g.add(mesh(new CylinderGeometry(0.018, 0.018, 0.004, 20), mat('#1E2A3A', { rough: 0.1, env: 1, coat: 1 }), [0, -0.031, 2.04], false));
  }, (lid) => pose([0, 0.225, -1.1], [OPEN * lid, 0, 0]), pose([3.0, 2.15, -2.35], [-1.72, 0, 0], 0.84), [0.0, 0.6], [-1.72, 0, 0]);

  /* ───────────── state ───────────── */
  let target = 0, prog = 0, lid = o.reducedMotion ? 1 : 0, lidTarget = lid;
  let hovered: string | null = null, showId: string | null = null, spin = 0, scrimAmt = 0;
  let introStart = 0, time = 0, last = performance.now(), rebuilt = 0;
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
      r.inst += (r.instTarget - r.inst) * (o.reducedMotion ? 1 : 0.075);
      r.show += (r.showTarget - r.show) * (o.reducedMotion ? 1 : 0.085);
      const inst = r.instTarget ? easeBack(clamp01(r.inst)) : ease(clamp01(r.inst));
      const show = ease(clamp01(r.show));
      const loose = (1 - clamp01(r.inst)) * (1 - show);
      const lift = r.id && r.id === hovered && p > 0.85 && loose > 0.9 ? 0.14 : 0;
      r.lift += (lift - r.lift) * 0.15;

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
    const tk = ease(clamp01((p - 0.12) / 0.6)) * looseDeck;
    const hoverLift = hovered === 'keyboard' && p > 0.85 && looseDeck > 0.9 ? 0.14 : 0;
    deck.updateMatrixWorld(true);
    for (let k = 0; k < keys.length; k++) {
      v.copy(keyHome[k]).sub(vv.set(0, 0.195, 0)).applyMatrix4(deck.matrixWorld);
      v.addScaledVector(keyFly[k], tk);
      v.y += hoverLift * 0.6 + Math.sin(time * 1.1 + k * 0.7) * 0.03 * floatAmt * looseDeck;
      qA.setFromEuler(e1.set(keySpin[k].x * tk, keySpin[k].y * tk + Math.sin(time * 0.7 + k) * 0.1 * floatAmt * looseDeck, keySpin[k].z * tk, 'XYZ')).premultiply(deck.quaternion);
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
    (scrim.material as MeshBasicMaterial).opacity = scrimAmt * 0.97;
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
    rebuilt += ((installedSet.size >= totalParts ? 1 : 0) - rebuilt) * 0.04;
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
    if (showId && !o.reducedMotion) spin += dt * 0.35;
    if (introStart) {
      const t = clamp01((now - introStart) / 1500);
      lid = ease(t);
      if (t >= 1) introStart = 0;
    } else lid += (lidTarget - lid) * 0.2;
    prog += (target - prog) * (o.reducedMotion ? 1 : 0.09);
    placeCamera(prog);
    applyPoses(prog);
    placeLabels(prog);
    if ((frameNo++ & 1) === 0) renderContactShadow(); // every other frame is plenty
    renderer.render(scene, camera);
  }
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
    playIntro: () => { lid = 0; lidTarget = 1; setTimeout(() => { introStart = performance.now(); }, 450); },
    skipIntro: () => { introStart = 0; lid = 1; lidTarget = 1; },
    pointAt: (id) => {
      const q = project(id);
      const r = o.canvas.getBoundingClientRect();
      return { x: q.x + r.left, y: q.y + r.top };
    },
  };
}
