// Turns raw originals in PersonalDetails/ into small web assets in public/media/.
// Run: npm run media   (re-run whenever you add a new video or photo)
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, existsSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import sharp from 'sharp';

const SRC_VIDEOS = 'PersonalDetails/Dance Video';
const SRC_PHOTOS = 'PersonalDetails/Pictures';
const OUT = 'public/media';
mkdirSync(join(OUT, 'dance'), { recursive: true });
mkdirSync(join(OUT, 'photos'), { recursive: true });

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const run = (args) => execFileSync(ffmpeg, ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' });

// Videos: muted, short, compressed loop (mp4 + webm), a poster, and 8 "motion study" frames.
// Sorted by file name so numbering stays stable as you add clips.
const videos = existsSync(SRC_VIDEOS) ? readdirSync(SRC_VIDEOS).filter((f) => /\.(mp4|mov|m4v)$/i.test(f)).sort() : [];
videos.forEach((file, i) => {
  const name = `dance-${String(i + 1).padStart(2, '0')}`;
  const src = join(SRC_VIDEOS, file);
  const base = join(OUT, 'dance', name);
  const scale = 'scale=480:-2';
  run(['-i', src, '-an', '-t', '8', '-vf', `${scale},fps=24`, '-c:v', 'libx264', '-crf', '28', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', `${base}.mp4`]);
  run(['-i', src, '-an', '-t', '8', '-vf', `${scale},fps=24`, '-c:v', 'libvpx-vp9', '-crf', '38', '-b:v', '0', `${base}.webm`]);
  run(['-ss', '1.2', '-i', src, '-frames:v', '1', '-vf', scale, `${base}-poster.jpg`]);
  // 8 evenly spaced frames for the chronophotography strip
  mkdirSync(`${base}-frames`, { recursive: true });
  run(['-i', src, '-vf', `fps=8/6,scale=200:-2`, '-frames:v', '8', `${base}-frames/f%02d.jpg`]);
  // a content file so the clip shows up in the Dance (speakers) room straight away
  const md = join('content', 'videos', `${name}.md`);
  if (!existsSync(md)) {
    writeFileSync(md, `---\ntitle: Dance clip ${i + 1}\npart: speakers\nplatform: local\nsrc: /media/dance/${name}\nposter: /media/dance/${name}-poster.jpg\norder: ${100 - i}\n---\n`);
    console.log('  + created', md, '(rename the title)');
  }
  console.log('video ->', name, '<-', file);
});

// Photos: AVIF + WebP + JPG at 2 widths.
const photos = [SRC_PHOTOS, SRC_VIDEOS].flatMap((d) =>
  existsSync(d) ? readdirSync(d).filter((f) => /\.(jpe?g|png|heic|webp)$/i.test(f)).map((f) => join(d, f)) : []
);
for (const [i, p] of photos.entries()) {
  const name = `photo-${String(i + 1).padStart(2, '0')}`;
  for (const w of [480, 960]) {
    const img = sharp(p).rotate().resize({ width: w, withoutEnlargement: true });
    await img.clone().avif({ quality: 52 }).toFile(join(OUT, 'photos', `${name}-${w}.avif`));
    await img.clone().webp({ quality: 74 }).toFile(join(OUT, 'photos', `${name}-${w}.webp`));
    await img.clone().jpeg({ quality: 78, mozjpeg: true }).toFile(join(OUT, 'photos', `${name}-${w}.jpg`));
  }
  console.log('photo ->', name, '<-', parse(p).base);
}
