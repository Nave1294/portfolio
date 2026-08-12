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
| `welcomeText` | The large word (default "Welcome") |
| `subtitle` | The line beneath it |
| `welcomeColor` | Hex color for the large word **only** — everything else stays black on white |
| `buttonLabel` | Text on the button |
| `buttonDelaySeconds` | How long before the button fades in |

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
| `gallery` | Array of `{ src, wide, caption }`. `wide: true` spans full width |

Unpublishing re-chains the previous/next links automatically, so a hidden
project never leaves a dead link behind.

To add a project, copy an existing JSON file, change `slug` and `order`, and
build. There is nothing else to update — the home grid is generated from
whatever is in the folder.

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
