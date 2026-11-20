// Everything interactive except the 3D model itself (that's laptop.ts, loaded on demand).
import type { LaptopApi } from './laptop';

const root = document.documentElement;
const $ = <T extends Element = HTMLElement>(s: string, el: ParentNode = document) => el.querySelector(s) as T | null;
const $$ = <T extends Element = HTMLElement>(s: string, el: ParentNode = document) => Array.from(el.querySelectorAll(s)) as T[];
function safe<T>(fn: () => T): T | null { try { return fn(); } catch { return null; } }
const store = {
  get: (k: string, s: Storage | null = safe(() => localStorage)) => safe(() => s?.getItem(k) ?? null),
  set: (k: string, v: string, s: Storage | null = safe(() => localStorage)) => safe(() => s?.setItem(k, v)),
};
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, still ? 0 : ms));
const data = JSON.parse($('#laptop-data')!.textContent!) as {
  parts: { id: string; color: string; title: string; aspect: string; joke: string }[];
  stickers: { id: string; icon: string; title: string; text: string; todo: boolean }[];
  order: string[];
};

/* ───────────── theme ───────────── */
const themeBtn = $('#theme-toggle')!;
const effectiveTheme = () => root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const paintTheme = () => { $('.theme-label', themeBtn)!.textContent = effectiveTheme(); };
themeBtn.addEventListener('click', () => {
  const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next; store.set('theme', next); paintTheme();
});
paintTheme();

/* ───────────── the laptop ───────────── */
let laptop: LaptopApi | null = null;
const hero = $('#hero')!;
const sticky = $('.sticky')!;
const canvas = $<HTMLCanvasElement>('#laptop-canvas')!;
const breakBtn = $('#break-toggle')!;
const labels = new Map<string, HTMLElement>();
$$('.labels [data-part]').forEach((el) => labels.set(el.dataset.part!, el));

function progress() {
  const r = hero.getBoundingClientRect();
  const span = hero.offsetHeight - innerHeight;
  return span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
}
const tornEnd = () => hero.offsetTop + hero.offsetHeight - innerHeight;
function onScroll() {
  const p = progress();
  root.style.setProperty('--p', p.toFixed(3));
  root.classList.toggle('torn', p > 0.85);
  breakBtn.setAttribute('aria-pressed', String(p > 0.5));
  laptop?.setProgress(still ? (p > 0.5 ? 1 : 0) : p);
}
addEventListener('scroll', onScroll, { passive: true });
addEventListener('resize', onScroll);
onScroll();

breakBtn.addEventListener('click', () => {
  scrollTo({ top: progress() > 0.5 ? 0 : tornEnd(), behavior: still ? 'auto' : 'smooth' });
});
$$('[data-action="tear"]').forEach((b) => b.addEventListener('click', (e) => {
  e.preventDefault();
  scrollTo({ top: tornEnd(), behavior: still ? 'auto' : 'smooth' });
}));

const pop = $('#sticker-pop')!;
function showSticker(id: string, at: { x: number; y: number }) {
  const s = data.stickers.find((x) => x.id === id);
  if (!s) return;
  $('.sp-title', pop)!.textContent = s.title;
  const t = $('.sp-text', pop)!;
  t.textContent = s.text;
  t.classList.toggle('todo-inline', s.todo);
  pop.hidden = false;
  const r = sticky.getBoundingClientRect();
  pop.style.left = `${Math.min(r.width - 290, Math.max(12, at.x - r.left - 130))}px`;
  pop.style.top = `${Math.max(70, at.y - r.top - 150)}px`;
  pop.classList.remove('pop-in'); void pop.offsetWidth; pop.classList.add('pop-in');
}
document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !(e.target as Element).closest('#sticker-pop')) pop.hidden = true; });

/* ───────────── rebuild progress ───────────── */
const rebuild = $('#rebuild')!;
const rebuildCount = $('#rebuild-count')!;
function paintRebuild(ids: string[]) {
  const total = data.parts.length;
  rebuildCount.textContent = String(ids.length);
  $$('.rb-dot', rebuild).forEach((d) => d.classList.toggle('in', ids.includes(d.dataset.part!)));
  rebuild.hidden = ids.length === 0;
  rebuild.classList.toggle('done', ids.length >= total);
  root.classList.toggle('rebuilt', ids.length >= total);
}
$('#rebuild-reset')!.addEventListener('click', () => laptop?.reset());

(async () => {
  try {
    const probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) throw new Error('no webgl');
    const { createLaptop } = await import('./laptop');
    laptop = createLaptop({
      canvas,
      parts: data.parts,
      stickers: data.stickers,
      labels,
      reducedMotion: still,
      onPick: (id) => openRoom(id),
      onSticker: (id, at) => showSticker(id, at),
      onHover: (id) => labels.forEach((el, k) => el.classList.toggle('is-hot', k === id)),
      onInstalled: paintRebuild,
    });
    root.classList.add('webgl');
    if (import.meta.env.DEV) (window as any).__laptop = laptop; // handy for debugging in the dev server only
    const first = !store.get('opened', safe(() => sessionStorage)) && !location.hash && progress() < 0.05;
    if (first && !still) laptop.playIntro(); else laptop.skipIntro();
    store.set('opened', '1', safe(() => sessionStorage));
    onScroll();
    const deep = location.hash.slice(1);
    if (deep && pageFor(deep)) openRoom(deep, { push: false });
  } catch {
    root.classList.add('no-webgl');
    const deep = location.hash.slice(1);
    if (deep && pageFor(deep)) openRoom(deep, { push: false });
  }
})();

/* ───────────── three cursors, wandering between loose parts ───────────── */
const cursorLayer = $('#cursors')!;
const cursors = $$('.cursor', cursorLayer).map((el, i) => ({ el, i, x: NaN, y: NaN, target: '', next: 0, hop: 0 }));
function tickCursors(now: number) {
  requestAnimationFrame(tickCursors);
  if (!laptop || root.classList.contains('room-open') || progress() < 0.8) return;
  const installed = laptop.installed();
  const loose = data.order.filter((id) => !installed.includes(id));
  if (!loose.length) return;
  const box = sticky.getBoundingClientRect();
  cursors.forEach((c) => {
    if (!loose.includes(c.target) || now > c.next) {
      const taken = cursors.filter((o) => o !== c).map((o) => o.target);
      const free = loose.filter((id) => !taken.includes(id) && id !== c.target);
      c.target = (free.length ? free : loose)[Math.floor(Math.random() * (free.length || loose.length))];
      c.next = now + 2600 + c.i * 900 + Math.random() * 1500;
      c.hop = now;
    }
    const p = laptop!.pointAt(c.target);
    const tx = p.x - box.left + 14 + Math.sin(now / 900 + c.i) * 6;
    const ty = p.y - box.top + 58 + Math.cos(now / 1100 + c.i * 2) * 5;
    if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
    if (!Number.isFinite(c.x)) { c.x = tx; c.y = ty; }
    const k = still ? 1 : 0.05;
    c.x += (tx - c.x) * k;
    c.y += (ty - c.y) * k;
    c.el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`;
    c.el.classList.toggle('arrived', now - c.hop > 1000 && now - c.hop < 1350);
  });
}
requestAnimationFrame(tickCursors);

/* ───────────── X-ray ───────────── */
const xrayBtn = $('#xray-toggle')!;
xrayBtn.addEventListener('click', () => {
  const on = root.dataset.xray !== 'on';
  if (on) root.dataset.xray = 'on'; else delete root.dataset.xray;
  xrayBtn.setAttribute('aria-pressed', String(on));
  laptop?.setXray(on);
});

/* ───────────── rooms: the part flies out, its story slides in ───────────── */
const room = $<HTMLDialogElement>('#room')!;
const scroller = $('#room-scroll')!;
const stageJoke = $('#stage-joke')!;
const stage = $('#room-stage')!;
let current: string | null = null;
let opener: HTMLElement | null = null;
let pushed = false;

const pageFor = (id: string) => $(`.room-page[id="${CSS.escape(id)}"]`, room);
const partInfo = (id: string) => data.parts.find((p) => p.id === id);
function nextOf(id: string) {
  const installed = laptop?.installed() ?? [];
  const order = data.order;
  const start = order.indexOf(id);
  for (let k = 1; k <= order.length; k++) {
    const cand = order[(start + k) % order.length];
    if (cand !== id && !installed.includes(cand)) return cand;
  }
  return null;
}

function fillPage(id: string) {
  const page = pageFor(id)!;
  $$('.room-page.is-current', room).forEach((p) => p.classList.remove('is-current'));
  page.classList.add('is-current');
  page.classList.remove('enter'); void page.offsetWidth; page.classList.add('enter');
  room.style.setProperty('--c', page.style.getPropertyValue('--c'));
  room.dataset.dark = page.dataset.dark ?? 'false';
  const info = partInfo(id);
  stageJoke.textContent = info?.joke ?? '';
  room.classList.toggle('has-part', !!info && !!laptop);
  const nxt = nextOf(id);
  const nb = $('[data-next]', page);
  if (nb) {
    const nn = partInfo(nxt ?? '');
    $('.next-name', nb)!.textContent = nn ? `${nn.title}: ${nn.aspect}` : 'All parts are back in. See it rebuilt';
    nb.dataset.go = nxt ?? '';
  }
  scroller.scrollTop = 0;
}

async function openRoom(id: string, { push = true } = {}) {
  if (!pageFor(id)) return;
  // the 3D stage must be on screen: jump to the torn-down view if we're below it
  if (laptop && partInfo(id) && hero.getBoundingClientRect().bottom < innerHeight * 0.5) scrollTo({ top: tornEnd() });
  if (!room.open) opener = document.activeElement as HTMLElement;
  if (push && location.hash !== `#${id}`) { history.pushState({ part: id }, '', `#${id}`); pushed = true; }
  current = id;
  if (partInfo(id)) laptop?.focus(id);
  fillPage(id);
  if (!room.open) {
    room.showModal();
    root.classList.add('room-open');
    requestAnimationFrame(() => requestAnimationFrame(() => room.classList.add('is-open')));
  }
}

async function goNext(id: string | null) {
  if (!current) return;
  laptop?.release(true); // the part you just read about clicks back into the laptop
  room.classList.add('swapping');
  await wait(420);
  room.classList.remove('swapping');
  if (id) {
    history.replaceState({ part: id }, '', `#${id}`);
    current = id;
    if (partInfo(id)) laptop?.focus(id);
    fillPage(id);
  } else closeUI(false);
}

async function closeUI(install = true) {
  if (!room.open) return;
  if (install) laptop?.release(true);
  room.classList.remove('is-open');
  $$<HTMLVideoElement>('video', room).forEach((v) => v.pause());
  current = null;
  await wait(520);
  room.close();
  root.classList.remove('room-open');
  opener?.focus?.({ preventScroll: true });
}
function close() {
  if (pushed && history.state?.part) { pushed = false; history.back(); return; }
  closeUI();
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

$('#room-close')!.addEventListener('click', close);
room.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
addEventListener('popstate', () => {
  const id = location.hash.slice(1);
  if (id && pageFor(id)) openRoom(id, { push: false }); else closeUI();
});
document.addEventListener('click', (e) => {
  const t = e.target as Element;
  const nxt = t.closest<HTMLElement>('[data-next]');
  if (nxt) { e.preventDefault(); goNext(nxt.dataset.go || null); return; }
  const a = t.closest<HTMLElement>('[data-open]');
  if (!a || !a.dataset.open) return;
  e.preventDefault();
  if (room.open && current !== a.dataset.open) { goNext(a.dataset.open); return; }
  openRoom(a.dataset.open);
});
// drag the showcased part to turn it
let dragX: number | null = null;
stage.addEventListener('pointerdown', (e) => { if ((e.target as Element).closest('button')) return; dragX = e.clientX; stage.setPointerCapture(e.pointerId); stage.classList.add('dragging'); });
stage.addEventListener('pointermove', (e) => { if (dragX === null) return; laptop?.spinBy((e.clientX - dragX) * 0.012); dragX = e.clientX; });
const endDrag = () => { dragX = null; stage.classList.remove('dragging'); };
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);

/* ───────────── design preview picker (only while site.preview is on) ───────────── */
function applyPick(page: HTMLElement, v: string, n: number) {
  const names = JSON.parse(page.dataset.names || '[]') as string[];
  page.dataset.variant = v;
  const title = $('.room-title', page);
  if (title && names[n]) title.textContent = names[n];
  $$<HTMLButtonElement>('.picker [data-v]', page).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  $$<HTMLButtonElement>('.picker [data-n]', page).forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.n) === n)));
  store.set(`pick:${page.id}`, `${v}${n + 1}`);
}
const currentName = (page: HTMLElement) => Number($('.picker [data-n][aria-pressed="true"]', page)?.dataset.n ?? 0);
$$('.room-page').forEach((page) => {
  if (!$('.picker', page)) return;
  const saved = store.get(`pick:${page.id}`);
  const m = saved?.match(/^([a-f])(\d+)$/);
  if (m) applyPick(page, m[1], Number(m[2]) - 1);
});
document.addEventListener('click', async (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>('.picker button');
  if (!b) return;
  const page = b.closest<HTMLElement>('.room-page')!;
  if (b.dataset.v) applyPick(page, b.dataset.v, currentName(page));
  else if (b.dataset.n) applyPick(page, page.dataset.variant || 'a', Number(b.dataset.n));
  else if ('copyPicks' in b.dataset) {
    const picks = $$('.room-page')
      .filter((p) => $('.picker', p))
      .map((p) => {
        const designs = JSON.parse(p.dataset.designs || '[]') as string[];
        const names = JSON.parse(p.dataset.names || '[]') as string[];
        const v = p.dataset.variant || 'a', n = currentName(p);
        const d = designs.length > 1 ? `${v.toUpperCase()} ${designs['abcdef'.indexOf(v)] ?? ''} + ` : '';
        return `${p.id}: ${d}"${names[n] ?? ''}"`;
      })
      .join('\n');
    try { await navigator.clipboard.writeText(picks); b.textContent = 'copied!'; } catch { b.textContent = 'copy failed'; }
    b.classList.add('copied');
    setTimeout(() => { b.textContent = 'copy my picks'; b.classList.remove('copied'); }, 1600);
  }
});

/* ───────────── "now playing" dance player ───────────── */
$$('[data-np]').forEach((np) => {
  const v = $<HTMLVideoElement>('video', np)!;
  const fill = $('.np-fill', np)!, cur = $('.np-cur', np)!, dur = $('.np-dur', np)!;
  const frames = $$('[data-np-seek]', np).length || 1;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const sync = () => {
    np.classList.toggle('is-playing', !v.paused);
    if (v.duration) { fill.style.width = `${(v.currentTime / v.duration) * 100}%`; dur.textContent = fmt(v.duration); }
    cur.textContent = fmt(v.currentTime || 0);
  };
  const play = () => v.play().catch(() => {});
  ['play', 'pause', 'timeupdate', 'loadedmetadata'].forEach((ev) => v.addEventListener(ev, sync));
  $('[data-np-play]', np)!.addEventListener('click', () => (v.paused ? play() : v.pause()));
  $('[data-np-restart]', np)!.addEventListener('click', () => { v.currentTime = 0; play(); });
  $$('[data-np-seek]', np).forEach((b) => b.addEventListener('click', async () => {
    if (!v.duration) await play();
    v.currentTime = (Number(b.dataset.npSeek) / frames) * (v.duration || 6);
    play();
  }));
});

/* ───────────── media inside rooms ───────────── */
$$('[data-video]').forEach((box) => {
  const v = $<HTMLVideoElement>('video', box)!;
  const btn = $('.video-toggle', box)!;
  const sync = () => { box.classList.toggle('is-playing', !v.paused); btn.setAttribute('aria-pressed', String(!v.paused)); };
  btn.addEventListener('click', () => (v.paused ? v.play().catch(() => {}) : v.pause()));
  v.addEventListener('play', sync); v.addEventListener('pause', sync);
});

$$('[data-study]').forEach((study) => {
  const big = $<HTMLImageElement>('.study-big', study)!;
  const strip = $('.study-strip', study)!;
  const imgs = $$<HTMLImageElement>('img', strip);
  if (!imgs.length) return;
  let k = 0;
  const show = (i: number) => {
    k = Math.max(0, Math.min(imgs.length - 1, i));
    big.src = imgs[k].src;
    imgs.forEach((im, j) => im.classList.toggle('on', j === k));
    strip.setAttribute('aria-valuenow', String(k + 1));
  };
  const fromPointer = (e: PointerEvent) => {
    const r = strip.getBoundingClientRect();
    show(Math.floor(((e.clientX - r.left) / r.width) * imgs.length));
  };
  strip.addEventListener('pointermove', fromPointer);
  strip.addEventListener('pointerdown', (e) => { strip.setPointerCapture(e.pointerId); fromPointer(e); });
  strip.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); show(k + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); show(k - 1); }
  });
  show(0);
});
