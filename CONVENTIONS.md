# Site conventions

Plain HTML / CSS / JS. No build step, no dependencies — open `index.html` directly
or drag the whole folder onto any static host.

## Structure

```
architecture-portfolio/
  index.html              Home — hero, featured work grid, about teaser
  about.html               Bio, skills, education/experience
  contact.html              Email, socials, résumé link
  css/style.css              All styling (design tokens at the top)
  js/main.js                 Mobile nav toggle only
  projects/
    project-template.html    Copy this to start a new project page
    project-01.html ... 04.html
  assets/
    images/project-0X/       One folder per project
    resume.pdf                Your résumé (add this file)
```

## Design tokens

Everything visual — colors, spacing, type scale — is defined as CSS custom
properties at the top of `css/style.css` under `:root`. Change a value there
and it updates the whole site.

## Color: white, black, and one hue per project

The site is pure white (`#fff`) and black (`#000`) with greys for secondary
text and rules. **Color appears only to identify a project.** Six accents are
defined in `:root` as `--accent-1` through `--accent-6`.

Each project is assigned one accent via an `.accent-N` class, and that color
shows up in exactly three places:

- the small square swatch next to the project's category label,
- the project title on hover, and the rule that wipes across the card,
- the top border of the metadata bar on the project's own page.

Nothing else on the site is colored. Keep it that way — the restraint is what
makes the projects read as distinct.

To assign an accent to a project, add the class in two places:

- `index.html` — on the card: `<a class="project-card accent-2" ...>`
- `projects/project-0X.html` — on the hero: `<section class="project-hero accent-2">`

Both places must use the same number or the project's color signature will be
inconsistent between the grid and its page.

## Adding a new project

1. Copy `projects/project-template.html` → `projects/project-05.html` (next number).
2. Fill in every `[bracketed]` placeholder: title, type/year eyebrow, location,
   program, status, role, and the overview paragraphs.
3. Set its accent class (`accent-1` … `accent-6`) on the `.project-hero` section,
   and use the same one on its card in `index.html`.
4. Create `assets/images/project-05/` and drop your images in.
5. Swap each placeholder `<span class="placeholder-label">` block for an
   `<img>` tag — the commented-out example above each one shows the exact
   markup and expected path.
6. Add a matching tile to the `.work-grid` on `index.html` (copy an existing
   `<a class="project-card">` block and point it at your new page).
7. Update the `project-nav` prev/next links at the bottom of the new page and
   its two neighbors so the click-through chain stays correct.

## Image guidelines

- **Cover / hero images:** 2400px wide minimum, landscape, JPG at ~80% quality
  (renders and site photos compress well; keep files under ~500KB each so
  pages load fast).
- **Gallery images:** same treatment. Wide images (site plans, sections,
  elevations) go in the `.wide` / `.span-2` slots; details and interiors go in
  the standard square-ish slots.
- **Aspect ratios are fixed by CSS** (`.img-frame`), so images are cropped via
  `object-fit: cover`. Frame your exports accordingly rather than relying on
  the browser to letterbox them.
- Keep filenames lowercase with hyphens: `cover.jpg`, `01-exterior.jpg`,
  `02-plan.jpg`.

## Adding your résumé

Drop a PDF at `assets/resume.pdf` — it's already linked from the About and
Contact pages.

## Deploying

This is a static site, so any of these work with zero configuration:

- **Netlify / Vercel:** drag the `architecture-portfolio` folder onto their
  dashboard, or connect it as a repo.
- **GitHub Pages:** push the folder to a repo and enable Pages on the `main`
  branch.

No server, database, or build process required.
