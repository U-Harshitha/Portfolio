import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const md = (dir: string) => glob({ pattern: '**/*.md', base: `./content/${dir}` });

// One laptop part = one full-screen room. The file name is the part id (cpu, gpu, ram ...).
const parts = defineCollection({
  loader: md('parts'),
  schema: z.object({
    title: z.string(), // the hardware name, e.g. "CPU"
    aspect: z.string(), // what it stands for, e.g. "Work experience"
    color: z.string(), // the room's colour
    room: z.enum(['intro', 'experience', 'projects', 'content', 'memories', 'dance', 'battery', 'research', 'events', 'contact']),
    joke: z.string(), // the comic note scribbled next to the part
    names: z.array(z.string()).default([]), // title options; `name` picks the live one (1-3)
    name: z.number().default(1),
    design: z.enum(['a', 'b', 'c', 'd', 'e', 'f']).default('a'), // which panel design is live
    final: z.boolean().default(false), // true = design and name are chosen; hides the preview picker
  }),
});

const experience = defineCollection({
  loader: md('experience'),
  schema: z.object({
    org: z.string(),
    role: z.string(),
    team: z.string().optional(),
    start: z.string(),
    end: z.string().default('Present'),
    order: z.number().default(0), // higher shows first
  }),
});

const projects = defineCollection({
  loader: md('projects'),
  schema: z.object({
    title: z.string(),
    year: z.string().optional(),
    stack: z.array(z.string()).default([]),
    summary: z.string(),
    status: z.string().optional(),
    links: z.record(z.string()).default({}),
    order: z.number().default(0),
  }),
});

const reading = defineCollection({
  loader: md('reading'),
  schema: z.object({
    kind: z.enum(['my-research', 'paper', 'book', 'source']), // papers + research -> keyboard; books + sources -> battery
    title: z.string(),
    authors: z.string().optional(),
    year: z.string().optional(),
    link: z.string().optional(),
    read: z.string().optional(), // when you read it, e.g. 2026-10
    order: z.number().default(0),
  }),
});

const events = defineCollection({
  loader: md('events'),
  schema: z.object({
    title: z.string(),
    role: z.string(),
    org: z.string().optional(),
    when: z.string().optional(),
    photo: z.string().optional(),
    order: z.number().default(0),
  }),
});

const videos = defineCollection({
  loader: md('videos'),
  schema: z.object({
    title: z.string(),
    part: z.enum(['gpu', 'speakers']), // which room shows it
    platform: z.enum(['youtube', 'linkedin', 'instagram', 'local']),
    url: z.string().optional(), // link to the post / video
    youtubeId: z.string().optional(), // for YouTube: the id after watch?v=
    src: z.string().optional(), // for local clips: base path without extension
    poster: z.string().optional(),
    date: z.string().optional(),
    order: z.number().default(0),
  }),
});

const changelog = defineCollection({
  loader: md('changelog'),
  schema: z.object({ version: z.string(), date: z.string() }),
});

export const collections = { parts, experience, projects, reading, events, videos, changelog };
