import { getCollection } from 'astro:content';
import { existsSync } from 'node:fs';
import site from '../../content/site.config';

/** The resume button only shows when the PDF is actually in public/ (it's kept out of git until there's a public version). */
export const hasResume = !site.links.resume.startsWith('/') || existsSync(`public${site.links.resume}`);

export const isTodo = (s?: string) => !!s && s.includes('TODO(harshitha)');
/** Turns "TODO(harshitha) paper title" into something readable on the page. */
export const todoText = (s: string) => s.replace(/TODO\(harshitha\):?\s*/g, '');

/** True when a colour is dark enough that text on it should be light. */
export function isDark(hex: string) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.22;
}

const byOrder = <T extends { data: { order: number } }>(a: T, b: T) => b.data.order - a.data.order;

export async function loadAll() {
  const partsAll = await getCollection('parts');
  const ids = site.partsOrder.filter((id) => partsAll.some((p) => p.id === id));
  const parts = ids.map((id) => {
    const p = partsAll.find((x) => x.id === id)!;
    // the live name (picked from `names`) is what labels and chips show
    const live = (p.data.names ?? [])[(p.data.name ?? 1) - 1] ?? p.data.aspect;
    return { id, entry: p, ...p.data, aspect: live };
  });

  return {
    parts,
    experience: (await getCollection('experience')).sort(byOrder),
    projects: (await getCollection('projects')).sort(byOrder),
    reading: (await getCollection('reading')).sort(byOrder),
    events: (await getCollection('events')).sort(byOrder),
    videos: (await getCollection('videos')).sort(byOrder),
    changelog: (await getCollection('changelog')).sort((a, b) => b.data.version.localeCompare(a.data.version, undefined, { numeric: true })),
  };
}
