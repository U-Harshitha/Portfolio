# What I need from you

## Before deploying (important)
- [ ] **Resume PDF**: kept out of git because it shows your **phone number**; the live site hides Resume buttons until you add a public version (README → Deploying → Resume).
- [ ] **Photos of the office / cafeteria**: confirm they're OK to publish (they show Google branding inside the office). Otherwise I'll remove them.
- [ ] **Domain**: automatic on Vercel. For a custom domain, set `SITE_URL` in Vercel (see README → Deploying).

## Sample content I filled in: check, keep or swap
Placeholders are now filled so the site looks finished. Facts come from your resume and brief. These are **my picks standing in for yours**:
- [ ] **Papers** in the keyboard room: Jupiter Rising, Borg, Attention Is All You Need (`content/reading/jupiter-rising.md`, `borg.md`, `attention.md`). Keep only ones you've read, and rewrite the takeaways in your words.
- [ ] **Book** in the battery room: Designing Data-Intensive Applications (`content/reading/ddia.md`).
- [ ] **Sources** in the battery room: the Google Women Engineers program and hackathons (both from your resume; check the wording).
- [ ] **Films / music / places** in the RAM room (`content/photos.json` → `rotation`) and the matching **stickers** (`content/stickers.json`): heists and space films, music you choreograph to, Hyderabad → Bengaluru.
- [ ] **Sarcasm research** limitation line (Telugu-English code-mixing) and "and co-authors" (`content/reading/sarcasm-polarity.md`).
- [ ] **Project blurbs** for the multi-agent and RAG projects, Life OS, and the new house-plan viewer entry (`content/projects/`).
- [ ] **Event blurbs**: TEDx, CSI/Designathon, Street Cause (`content/events/`). No numbers invented beyond your resume.
- [ ] **Screen room intro** in your voice (`content/parts/screen.md`) and the jokes on each part (`joke:` in `content/parts/*.md`).
- [ ] **Code on the laptop screen** (`CODE` and `makeScreen()` in `src/scripts/laptop.ts`) and the fun specs on component labels ("HU-CORE 4.2GHz", "SSD 1TB", "72Wh").
- [ ] Dance clip title "Group session, November 2026" (`content/videos/dance-01.md`).

## Design picks still open
- [ ] **CPU**: timeline / commit log / datasheet, and a name.
- [ ] **Screen**: letter / boot log / chat / profile (name "whoami" picked).
- [ ] **Speakers**: reel / count sheet / now playing (three new ones).
- [ ] **Trackpad**: name, from 7 options (command bar design kept).
Open any of these on the site, use the bar at the top of the panel, then **copy my picks**.

## Still missing
- [ ] **A photo of you.** `PersonalDetails/Pictures/` only has the Google Cloud office-wall photo (no person in it). Drop your photo there, run `npm run media`, and set `portrait` in `content/photos.json`. The screen room shows an "HU" monogram until then.
- [ ] **Second dance video.** `PersonalDetails/Dance Video/` has one .mp4 and one .jpeg (cupcakes). Drop the second clip in and run `npm run media`; it appears in the Dance room automatically.
- [ ] Instagram (dance) URL, YouTube URL (when it launches), public email: all in `content/site.config.ts`. Buttons appear automatically once set.
- [ ] Confirm the GitHub link `github.com/U-Harshitha` (from your resume).
- [ ] Telugu-English flavour: want a line or two? Tell me where.

## Next build passes

- [ ] Label collision handling at awkward widths; a loading poster while three.js loads (~130 KB gzipped, after the page)
- [ ] Install the missing skills (taste, Emil Kowalski motion, Impeccable, Apple design) if you want them used
- [ ] Polish/critique pass, screen-reader pass, Lighthouse on throttled mobile
