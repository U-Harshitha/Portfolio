# DESIGN.md: Teardown

Decisions and why. Newest version first.

## v2.2: open a part, it clicks back in

**Asked for:** drop the three visitor types (lenses), keep three cursors but only once the laptop is apart, more realism (reference: BuildCores' 3D product renders), a better moment when a part opens, and each part going back into the computer as you look at it.

- **Opening a part**: the part flies out of the scene to a showcase on the left (top band on phones), turns slowly (drag to spin), and the backdrop tints to the part's colour in 3D. The story slides in as a panel from the right (bottom sheet on phones). The handwritten joke sits next to the part.
- **It clicks back in**: leaving a part, or pressing **Next part**, snaps it back into its slot in the case (with a small overshoot). A counter appears ("3/10 parts back in", one dot per part in its colour). "Next part" skips anything already installed. When all ten are in, the lid follows the screen back on, the camera glides down to the whole laptop, and the counter reads "Rebuilt. Build, break, rebuild." with **Take it apart again**. The site's own idea, made literal.
- **Realism**: a studio environment built from softboxes (so metal reflects a photo studio), product-photography tone mapping (Khronos PBR Neutral), brushed anisotropic aluminium, clear-coated circuit boards, keycaps and stickers, a glass layer over the display, soft **contact shadows** on the floor (depth rendered from below and blurred), and an open aluminium tub so installed parts are visible.
- **Removed**: lenses (switcher, "start here!" tags, per-lens buttons). Hero buttons are now **Take it apart** and **Resume**. The three cursors have no names and appear only when the laptop is apart; they hide once it's rebuilt.
- **Media**: each dance clip gets its own frame scrubber; `npm run media` now creates the content file for new clips. Set `portrait` in `content/photos.json` to show a photo of you in the screen room.

## v2.1: realistic laptop, studio theme, multiplayer cursors

**Asked for:** more realistic and techy, a more expensive feel, a wider teardown with gently floating parts, Figma-style cursors that move around and point, a slightly more modern and elegant theme, and placeholders filled in.

- **Laptop realism**: space-grey aluminium (metal, environment reflections), hinge, ports, rubber feet, glossy bezel with webcam, a code-editor screen, **printed keycaps** (one legend atlas; the **H** key is haldi), a PCB with printed traces and 140 tiny components, an engraved CPU heat spreader, a GPU with fan and copper fins, RAM/SSD/Wi-Fi/battery with realistic spec labels (barcode + QR-ish mark). Fill and rim lights added. Internals now sit fully inside the case.
- **Teardown**: about 15% wider. Once apart, every part bobs and sways a little (different phase per part), keys drift, and the camera slowly drifts sideways. Reduced motion turns all of it off.
- **Cursors**: one per lens (Recruiter blue, Builder orange, Watcher red). Each glides between the parts its lens cares about (assembled: screen, keyboard, trackpad), and gives a small "click" when it arrives. Your current lens is marked "you", which also teaches what lenses are without explaining them.
- **Theme ("studio")**: soft radial studio lighting instead of flat paper, hairline borders, pill buttons with layered soft shadows (the hard comic offsets are gone), a segmented lens control, white floating labels with coloured dots, lit gradient room heroes, a white content sheet with a large radius, floating part illustrations. Kalam handwriting stays only for the playful notes. The primary button is ink with a haldi dot.
- **Content**: placeholders replaced with draft copy. Facts come from the resume/brief; taste picks (papers, book, films) are samples listed in TODO.md. A missing link hides its button instead of showing a TODO.

## v2: the laptop (current)

### Why it changed
Your feedback on v1: the stack of layers looked bland and static, too grey, and the side drawers felt like sections, not experiences. You wanted more colour, real movement as you scroll (but not a long page), each part taking over the whole screen, a bit of Paul Fey's story-with-comics feel, and the object to be **your laptop**, with Raycast's keyboard page as the reference for the 3D look.

### What the references taught (looked at in a browser)
- **rikoutaku**: scroll scrubs a 3D room exploding past the camera. The scroll is the control. → our teardown is scroll-scrubbed over ~1.7 screens.
- **akaiito**: each scroll stop is a full-screen scene in its own setting, tied by one motif. (Age-gated; I read its text rather than clicking "18+" for you.) → each part opens a full-screen room in its own colour.
- **Paul Fey**: chapters, big coloured titles, photos in the margins joined by a drawn line. → handwritten annotations, polaroids, scribbled arrows.
- **Raycast keyboard**: real WebGL, soft studio light, matte rounded keycaps that separate on scroll. → three.js with rounded geometry, environment lighting and soft shadows.

### Parts → aspects
You gave the core mapping; I filled in the rest (marked *mine*):

| Part | Room | Colour | Why |
|---|---|---|---|
| Screen | Hello, this is me (intro + photo) | haldi `#F2B705` | what you see first |
| CPU | Work experience | teal `#0F8B8D` | where the work gets done |
| GPU | Tech content | tomato `#E5432F` | renders things people watch |
| RAM | Memories (photos, films, music, places) | sky `#3A9AD9` | what's kept loaded |
| Battery | What keeps me charged (books, sources) | leaf `#4CAF50` | knowledge and motivation |
| Keyboard | Papers & research | indigo `#3B3FB6` | where thinking gets typed out |
| SSD *(mine)* | Projects | marigold `#F08A24` | everything built, saved |
| Speakers *(mine)* | Dance | rani pink `#E0307A` | rhythm, and your dance video is the strongest content |
| Wi-Fi card *(mine)* | Events | violet `#8E5BD8` | connects people; also your networking world |
| Trackpad *(mine)* | Get in touch | charcoal | "touch here" |
| Lid stickers | Travel & hobbies | mixed | click one for a speech bubble |

### Flow
1. **Load**: the laptop sits **closed**, stickers up; the lid swings open (1.5 s, once per visit, skipped on deep links and reduced motion).
2. **Scroll ~1.7 screens**: the laptop tears down. Lid spins round to show its stickers, the screen lifts off, keys scatter, internals rise out of the base and spread like parts on a workbench; the camera pulls back. Intro text slides away.
3. **Pick a part**: comic labels pin to every part ("start here!" tags follow the lens). Hover lifts a part.
4. **Enter**: a circle of the part's colour wipes out from where you clicked and fills the screen; the camera leans in. The room is 2–3 screens: a big hero (title, comic illustration of the part, a scribbled joke), then content on a paper sheet, then a big **Next part** door.
5. **Back**: the wipe shrinks back to the laptop. Esc and the browser back button work; `/#cpu` links straight to a room.
6. Below the hero: "Or skip the screwdriver", a colourful grid of all parts (also the fallback without WebGL).

Total page: about 2.7 screens plus a short footer. Depth comes from clicking into rooms.

### Look
- **Palette**: warm desk paper `#F4EBDD` with a dot grid, ink `#1C1B22`, haldi `#F2B705` for the main buttons. Each room takes its part's colour full-bleed. Dark mode: `#17161D`.
- **Type**: Bricolage Grotesque (condensed, heavy) for titles; Instrument Sans for text; JetBrains Mono for part labels; **Kalam** (Indian Type Foundry) for handwritten notes, which is where the comic voice lives.
- **Comic language**: 2 px ink outlines and hard offset shadows on buttons, chips and labels; speech-bubble labels; die-cut stickers; polaroid photos; scribbled arrows.
- **Laptop**: charcoal shell so the coloured internals pop; one haldi key as a signature.

### Lenses and X-ray (kept)
- Lenses change the "start here!" parts, the "next part" order, the intro line and the main buttons (all from `site.config.ts`).
- X-ray turns the 3D model to wireframe, outlines page regions with their source file, and shows the build flow.

### Stack
Astro 5 static site. **three.js** for the laptop (justified now: the Raycast-style 3D look needs real lighting and depth). The model is built from code (rounded boxes, canvas textures for the screen, stickers and labels), so there are no model files to download. The page script is about 3 KB gzipped; three.js plus the model is about 130 KB gzipped and loads after the page is visible. Without WebGL or JavaScript, all rooms are still readable.

### Known rough edges (base model)
- Some labels overlap at certain widths (keyboard/trackpad).
- Parts are simple shapes; materials and lighting can go further.
- The share image still shows v1's stack.

---

## v1: the stack (retired)
An isometric SVG stack of six slabs with side drawers. Kept the content model, lenses, X-ray, TODO system and the dance motion study; dropped the grey palette, the single-screen rule and the drawers.
