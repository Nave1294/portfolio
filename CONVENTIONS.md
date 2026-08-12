# How this site works

The site is **generated**. You never edit HTML — you edit content files, and a
build script turns them into the static site.

```
content/settings.json      Everything site-wide: landing page, home, about, contact
content/projects/*.json    One file per project
css/style.css              All styling (design tokens at the top)
js/main.js                 Mobile nav
build.mjs                  The generator
assets/images/             Images, one folder per project
dist/                      BUILD OUTPUT — never edit, never committed
```

## The loop

```bash
node build.mjs
```

That reads `content/`, writes `dist/`. To preview:

```bash
python -m http.server 8765 --directory dist
```

Pushing to `main` runs the same build on GitHub and deploys it. There is no
manual publish step.

## Landing page

Controlled entirely by `landing` in `content/settings.json`:

| Field | What it does |
| --- | --- |
| `enabled` | `true` shows the landing page; `false` sends visitors straight to the work grid |
| `welcomeText` | The greeting. **Always black**, lighter weight |
| `highlightText` | Your text, following the greeting. Colored and bold. Blank shows the greeting alone |
| `highlightColor` | Hex color for `highlightText` **only** |
| `subtitle` | The line beneath |
| `buttonLabel` | Text on the button |
| `buttonDelaySeconds` | How long before the button fades in |

The text block is left-aligned, starts on the screen's left-third line, and is
centered vertically; the button sits on the same left edge. Below 860px the
block returns to full width so the heading has room.

Only `highlightText` carries color — the greeting, subtitle and button stay
black on white.

### The swipe

Clicking Enter swipes the landing page off to the left while the work grid
arrives from the right. Configured in `css/transition.css`, which is linked
only from those two pages.

It works in two halves, since they are separate documents:

1. The Enter click is intercepted. `swipe-leaving` animates the landing page
   out to the left, a flag is left in `sessionStorage`, and navigation happens
   when the animation ends (or after 450ms, whichever comes first).
2. The work page reads that flag in an inline `<head>` script — **before the
   first paint**, otherwise the page would appear in place and then jump right
   — and adds `swipe-entering`, which animates it in from the right.

`js/main.js` removes the class once the animation finishes. That matters: a
transform left on the wrapper would make it a containing block and break the
sticky header.

This is deliberately plain CSS animation rather than the View Transitions API,
which only supports cross-document transitions in some browsers. Visitors with
"reduce motion" enabled get a plain navigation, as does anyone whose animation
never fires — the timeout still navigates.

Durations live in `css/transition.css` as `--swipe-out` and `--swipe-in`. If
you lengthen `--swipe-out`, raise the navigation safety timeout in the landing
page script in `build.mjs` to stay ahead of it.

### Items rising into view

Elements marked `.reveal` on the work page fade and rise, staggered 90ms apart
so a row of cards cascades rather than landing together. Handled in
`js/main.js`.

When arriving via the swipe, items already on screen start rising immediately,
so the cascade plays *during* the incoming slide rather than after it. Those
are picked by a vertical measurement: the swipe is a horizontal transform, so
it leaves `getBoundingClientRect().top` untouched and the reading stays
accurate while the page is still off to the right. Leaving that to the
observer would be unreliable, since transform animations usually run on the
compositor and intersection updates lag behind them.

Everything below the fold waits for scroll, handled by an IntersectionObserver.

Two safeguards, because these elements start at `opacity: 0` and something
must always bring them back:

- The hiding rule is scoped to `html.js`, a class set by an inline script. With
  JavaScript unavailable the rule never applies and content is simply visible.
- A watchdog reveals anything still hidden four seconds after load, and
  `.is-in` sets `opacity: 1` directly as well as animating it. If the observer
  never fires, or animations are unavailable, the content still appears.

A missed animation is cosmetic; invisible content is a broken page. Keep both
safeguards if you change this.

When `enabled` is `true`, the landing page is `index.html` and the work grid
moves to `work.html`. When `false`, the work grid becomes `index.html`. The
build rewrites every navigation link to match, so you never have to think
about it.

`welcomeColor` must be a hex value like `#c8452b`. Anything else falls back to
black rather than being written into the page.

## Projects

One JSON file per project in `content/projects/`.

| Field | Notes |
| --- | --- |
| `published` | `false` hides it from the site entirely — no card, no page |
| `order` | Lower numbers first in the grid |
| `accent` | `1`–`6`, the project's signature color |
| `slug` | Becomes the page URL; keep it lowercase with hyphens |
| `cover` | Path like `assets/images/project-01/cover.jpg`. Empty shows a grey frame |
| `body` | Array of paragraphs |
| `gallery` | Array of `{ src, caption, group, building, wide }` — see below |

Unpublishing re-chains the previous/next links automatically, so a hidden
project never leaves a dead link behind.

To add a project, copy an existing JSON file, change `slug` and `order`, and
build. There is nothing else to update — the home grid is generated from
whatever is in the folder.

### The home page timeline

`home.layout` in `settings.json` chooses between `timeline` (default) and
`grid`.

The timeline is an axis spanning the full width of the screen: project names
above the line, years below. It only scrolls sideways when the names cannot
fit.

Hovering or focusing a project reveals a preview above the axis — cover image,
title in the project's accent colour, and a short description. Both the title
and the preview link through to the project.

- `order` controls the sequence, left to right. Set these to match your
  chronology — the timeline does not sort by date.
- `date` is only the label shown under each title. Blank shows a dash.
- `summary` is the preview line. Left empty, the opening of the project's
  description is used instead.

While nobody is interacting, the preview drifts through the projects every few
seconds. Hovering takes over at once, and drifting only resumes after things
have been quiet. It does not run for visitors who prefer reduced motion, nor
in a background tab.

Preview images are clamped against the stage height minus a fixed caption
block. Do not switch that to a percentage — it will not resolve against the
auto-sized grid row and the images will overflow the axis.

Without JavaScript the first preview is shown and the axis is still
scrollable, so every project remains reachable.

### Images are never cropped

Frames use `object-fit: contain` and take each image's own proportions, so no
drawing loses an edge. This matters more than tidy grid rows: cropping a plan
or section destroys information.

If you change this, do not reintroduce `object-fit: cover` on gallery or
project images.

### How a project page organises itself

Each gallery image carries a `group` and an optional `building`:

| Field | What it does |
| --- | --- |
| `group` | `Views`, `Plans`, `Sections & Elevations` or `Diagrams`. Becomes a tab |
| `building` | Optional subheading within a tab — Housing, Garage, School |
| `caption` | Shown under the image |
| `wide` | Spans the full width; otherwise images sit two-up |

**Tabs only appear when a project has more than one group.** A project whose
images are all `Views` gets a plain grid, which is why the untitled imports
look unchanged.

Within the Plans tab, drawings are kept together by building and ordered by
level — site, basement, ground, upper floors, roof — so a reader moves up
through one structure instead of hopping between them.

Keep `wide` for genuinely panoramic drawings (roughly 2.2:1 and wider). Making
everything full width turns the page into one endless column; ordinary 16:9
renders read better two-up.

Without JavaScript every panel is shown with its heading and the tab strip is
hidden, so no drawing becomes unreachable.

## Color

The site is pure white and black. Color appears **only** to identify a
project: the swatch beside its category, the title on hover, and the rule above
its metadata. Six accents (`--accent-1`…`6`) are defined in `css/style.css`.
Keeping color scarce is what makes the projects read as distinct.

## Images

- Cover and wide images: 2400px wide, JPG ~80% quality, ideally under 500KB.
- Aspect ratios are fixed in CSS and images are cropped with `object-fit:
  cover`, so frame your exports accordingly.
- Filenames lowercase with hyphens: `cover.jpg`, `01-exterior.jpg`.

Large files matter here: a 16MB render will make the page slow. Export at a
web-appropriate size before adding it.

## Search engines

`robots.txt` currently blocks all crawlers while the site holds placeholder
content. **Delete it** once the real content is in, or the site will never
appear in search results.
