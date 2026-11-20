# Teardown: Harshitha's site

My laptop, taken apart. Scroll to break it down; click any part (CPU, GPU, RAM, battery...) to open its full-screen room.

## Run it

```
npm install
npm run dev        # http://localhost:4321
npm run build      # static site in dist/
```

## Editing: you never need to touch layout code

Everything you'd change lives in `content/`. Save a file and the dev server reloads.

### Change your "Now" focus
Open `content/site.config.ts` and edit `now.text` (and `now.updated`, e.g. `'2027-01'`).

### Add a project
Create `content/projects/my-project.md`:

```md
---
title: My project
stack: [Go, Kubernetes]
summary: One line that says what it does.
status: Shipped            # optional
links: { code: https://github.com/..., writeup: https://... }   # optional
order: 5                   # higher shows first
---
A few sentences: why you built it, what broke, what you changed.
```

### Add a paper, book or source of motivation (with your takeaway)
`kind: paper` and `kind: my-research` show in the **keyboard** room; `kind: book` and `kind: source` (a person, podcast, habit) show in the **battery** room.
Create `content/reading/some-paper.md`:

```md
---
kind: paper            # paper | my-research | book | source
title: Attention Is All You Need
authors: Vaswani et al.
year: "2017"
link: https://arxiv.org/abs/1706.03762
read: 2026-12
order: 6
---
Your takeaway, in your words. Two to four sentences is plenty.
```

### Add a YouTube video (or LinkedIn post)
Create `content/videos/my-video.md`:

```md
---
title: How a packet finds its way across a VPC
part: gpu              # gpu = Tech content room, speakers = Dance room
platform: youtube      # youtube | linkedin | instagram | local
url: https://www.youtube.com/watch?v=XXXX
order: 2
---
One line on what it explains.
```

When your channel launches, also set `links.youtube` in `content/site.config.ts`. The "Launching soon" block turns into a Subscribe button automatically.

### Add a dance clip
1. Drop the original into `PersonalDetails/Dance Video/` (originals are never committed).
2. Run `npm run media`. It writes small muted web versions, a poster and motion-study frames to `public/media/dance/`, **and creates `content/videos/dance-0N.md` for you**, so the clip appears in the speakers (Dance) room with its own frame scrubber. Rename its title.

### Add your photo
Drop it in `PersonalDetails/Pictures/`, run `npm run media`, find its name in the output (e.g. `photo-03`), then set `"portrait": "/media/photos/photo-03"` in `content/photos.json`. The screen room shows it in place of the HU monogram.

### Add photos
Drop them in `PersonalDetails/Pictures/`, run `npm run media`, then add an entry to `content/photos.json`. The RAM (memories) room lays out 1, 2 or 3+ photos differently. The "On rotation" list (films, music, places) is `rotation` in the same file.

### Change the cursors
Three unnamed cursors drift between the parts that are still loose, and only once the laptop is taken apart. Their colours are in `src/pages/index.astro` (search for `cursor`).

### Edit the laptop stickers (travel & hobbies)
`content/stickers.json`. Each sticker has a `title`, the `text` that pops up when clicked, and an `icon`: plane, camera, clapper, headphones, sneaker, code, books, mic or pin. Up to 8 fit on the lid.

### Change what a laptop part stands for
Each part is a file in `content/parts/` (`cpu.md`, `gpu.md` ...). Change `aspect` (what it means), `color` (its room colour), `joke` (the scribbled note) and the text below the `---`. `room` picks which content the room shows.

### Add an event / experience
Same pattern: one file in `content/events/` or `content/experience/`. Copy an existing file and change it.

### Change colours
Each part's colour is `color:` in its `content/parts/*.md`. Site-wide colours (paper, ink, haldi yellow) are at the top of `src/styles/global.css`.

### Reorder or hide parts
`content/site.config.ts` → `partsOrder`. Remove an id to hide its room (the 3D part stays on the laptop for now).

### Write a changelog entry
Add `content/changelog/v1.1.md` with `version` and `date`, and two lines: what broke, what you changed.

## Placeholders
Anything starting with `TODO(harshitha)` shows up on the page with a yellow dashed box or a wavy underline, so nothing unfinished slips through. Full list: [TODO.md](TODO.md).

## Deploying (GitHub + Vercel)
1. **Create the repo**: on github.com (signed in as U-Harshitha) go to *New repository*, name it `portfolio`, leave it **empty** (no README, no .gitignore, no licence), and pick Private or Public.
2. **Push**: in this folder run `git push -u origin main`. The first time, Git opens a browser window to sign in to GitHub.
3. **Import to Vercel**: on vercel.com sign in with GitHub, then *Add New… → Project → Import* `U-Harshitha/Portfolio`. Vercel detects Astro; `vercel.json` already sets the build (`npm run build`) and output (`dist`). Click **Deploy**.
4. Your site is live at `https://portfolio-<something>.vercel.app`. Share previews, the sitemap and robots.txt use that address automatically.
5. **Nicer address (optional)**: in Vercel, *Project → Settings → Domains*, either rename the `.vercel.app` subdomain (e.g. `harshitha.vercel.app` if it's free) or add a domain you own. If you use a custom domain, also add `SITE_URL=https://yourdomain` under *Settings → Environment Variables* and redeploy.

After that, every `git push` redeploys the site automatically.

### Hangman game at /hangman
`/hangman` is proxied (see `rewrites` in `vercel.json`) to the Phoenix app from
[U-Harshitha/Hangman-in-Phoenix](https://github.com/U-Harshitha/Hangman-in-Phoenix), hosted on Render.
Link to it with a plain `<a href="/hangman">`. If the Render service URL ever changes, update both
`destination` hosts in `vercel.json`.

**Resume**: `public/resume.pdf` is kept out of git because your current resume shows your phone number. Resume buttons hide themselves when the file isn't there. To publish one: save a version without the phone number as `public/resume.pdf`, delete the last two lines of `.gitignore`, then `git add public/resume.pdf .gitignore && git commit -m "Add resume" && git push`.

## Where things are

| Path | What it is |
|---|---|
| `content/` | everything you edit |
| `src/scripts/laptop.ts` | the 3D laptop (three.js, built from code) and its teardown |
| `src/scripts/site.ts` | everything else: scroll, opening parts, the rebuild counter, cursors, X-ray, stickers |
| `src/components/Room.astro` | what each part's room shows |
| `src/components/PartArt.astro` | the comic illustration at the top of each room |
| `src/styles/global.css` | colours, type, motion |
| `scripts/process-media.mjs` | video/photo conversion |
| `scripts/make-og.mjs` | share image + touch icon |
| `DESIGN.md` | decisions and why |
