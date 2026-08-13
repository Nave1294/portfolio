// Generates the static site from content/ into dist/.
//   node build.mjs
// No dependencies. Everything the dashboard edits lives in content/.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist");

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

/* ---------- escaping ----------
   Content comes from a dashboard, so it must never be trusted as markup. */
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// For values placed inside a CSS declaration. Anything not a plain hex color
// is dropped rather than passed through.
const cssColor = (s, fallback = "#000000") =>
  /^#[0-9a-fA-F]{3,8}$/.test(String(s || "").trim()) ? String(s).trim() : fallback;

const attr = (s) => esc(s);

/* ---------- load content ---------- */
const settings = read("content/settings.json");

const projectsDir = join(ROOT, "content", "projects");
const projects = existsSync(projectsDir)
  ? readdirSync(projectsDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(projectsDir, f), "utf8")))
      .filter((p) => p.published !== false)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  : [];

const landingOn = settings.landing?.enabled !== false;
// With a landing page, the grid moves to work.html so index.html can be the door.
const WORK_URL = landingOn ? "work.html" : "index.html";

/* ---------- shared partials ---------- */
const site = settings.site || {};
const contact = settings.contact || {};

// `swipe` links the swipe stylesheet; `swipeIn` additionally marks the page as
// the arrival side. The inline script must run before the first paint,
// otherwise the page renders in place and then jumps right to animate in.
function head(
  title,
  { depth = 0, description = "", swipe = false, swipeIn = false } = {}
) {
  const up = depth ? "../".repeat(depth) : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>${
    description ? `\n<meta name="description" content="${attr(description)}">` : ""
  }
<link rel="stylesheet" href="${up}css/style.css">${
    swipe ? `\n<link rel="stylesheet" href="${up}css/transition.css">` : ""
  }
<script>document.documentElement.classList.add("js")</script>${
    swipeIn
      ? `\n<script>try{if(sessionStorage.getItem("swipe-in")==="1"){sessionStorage.removeItem("swipe-in");document.documentElement.classList.add("swipe-entering")}}catch(e){}</script>`
      : ""
  }
</head>
<body>`;
}

function header(current, depth = 0) {
  const up = depth ? "../".repeat(depth) : "";
  const on = (k) => (current === k ? ' aria-current="page"' : "");
  return `
<header class="site-header">
  <div class="container">
    <a href="${up}${WORK_URL}" class="logo">${esc(
    (site.name || "").toUpperCase()
  )} <span>/ ${esc(site.role || "")}</span></a>
    <nav>
      <ul class="nav-links">
        <li><a href="${up}${WORK_URL}"${on("work")}>Work</a></li>
        <li><a href="${up}about.html"${on("about")}>About</a></li>
        <li><a href="${up}contact.html"${on("contact")}>Contact</a></li>
      </ul>
    </nav>
    <button class="nav-toggle" aria-expanded="false" aria-label="Toggle menu">Menu</button>
  </div>
</header>`;
}

function footer(depth = 0, { full = true, wrapped = false } = {}) {
  const up = depth ? "../".repeat(depth) : "";
  const year = new Date().getFullYear();
  const links = [];
  if (contact.email)
    links.push(
      `<a href="mailto:${attr(contact.email)}" class="text-link">${esc(contact.email)}</a>`
    );
  links.push(`<a href="${up}contact.html" class="text-link">Contact page →</a>`);
  if (contact.linkedin)
    links.push(
      `<a href="${attr(contact.linkedin)}" class="text-link" rel="noopener">LinkedIn</a>`
    );

  const top =
    full && (contact.footerCta || links.length)
      ? `
    <div class="footer-grid">
      ${contact.footerCta ? `<h2>${esc(contact.footerCta)}</h2>` : "<div></div>"}
      <div class="footer-links">
        ${links.join("\n        ")}
      </div>
    </div>`
      : "";

  return `
<footer class="site-footer">
  <div class="container">${top}
    <div class="footer-bottom">
      <span>© ${year} ${esc(site.name || "")}</span>
      <a class="to-top" href="#top">
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 19V5M5 12l7-7 7 7"></path></svg>
        Back to top
      </a>
    </div>
  </div>
</footer>
${wrapped ? "</div>\n" : ""}
<script src="${up}js/main.js"></script>
</body>
</html>
`;
}

/* ---------- image helper ----------
   An empty src renders the labelled grey frame, so an unfinished project
   still lays out correctly instead of collapsing. */
function frame(src, alt, extraClass = "", depth = 0) {
  const up = depth ? "../".repeat(depth) : "";
  const cls = ("img-frame " + extraClass).trim();
  if (src) {
    return `<div class="${cls}"><img src="${up}${attr(src)}" alt="${attr(alt || "")}" loading="lazy"></div>`;
  }
  return `<div class="${cls}"><span class="placeholder-label">${esc(alt || "Image")}</span></div>`;
}

/* ---------- pages ---------- */

function landingPage() {
  const l = settings.landing || {};
  const delay = Number(l.buttonDelaySeconds) || 3;
  // "Welcome" is always black; only highlightText takes the chosen colour.
  const highlight = String(l.highlightText || "").trim();
  const heading =
    esc(l.welcomeText || "Welcome") +
    (highlight ? ` <span class="landing-highlight">${esc(highlight)}</span>` : "");

  return `${head(site.name || "Portfolio", {
    description: site.description,
    swipe: true,
  })}

<div class="swipe-root">
  <main class="landing" style="--highlight-color: ${cssColor(l.highlightColor)}">
    <div class="landing-inner">
      <h1 class="landing-welcome fade-in">${heading}</h1>
      <p class="landing-subtitle fade-in fade-delay-1">${esc(l.subtitle || "")}</p>
      <a href="${WORK_URL}" class="landing-enter btn" id="landing-enter">${esc(
    l.buttonLabel || "Enter"
  )}</a>
    </div>
  </main>
</div>

<script>
(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Reveal the enter button after the copy has settled.
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("landing-enter");
    if (!btn) return;
    setTimeout(function () { btn.classList.add("is-visible"); }, reduce ? 0 : ${
      delay * 1000
    });

    if (reduce) return; // plain navigation

    btn.addEventListener("click", function (event) {
      // Let modified clicks (new tab, etc.) behave normally.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
      event.preventDefault();

      var target = btn.getAttribute("href");
      try { sessionStorage.setItem("swipe-in", "1"); } catch (e) {}
      document.body.classList.add("swipe-leaving");

      var navigated = false;
      var go = function () {
        if (navigated) return;
        navigated = true;
        window.location.href = target;
      };
      var root = document.querySelector(".swipe-root");
      if (root) root.addEventListener("animationend", go, { once: true });
      // Safety net if the animation never fires. Must exceed --swipe-out.
      setTimeout(go, 700);
    });
  });
})();
</script>
</body>
</html>
`;
}

/* ---------- timeline ----------
   Projects laid along a horizontally scrolling track. Whichever project sits
   nearest the centre becomes active and its cover fades in above. The track
   runs newest first; `date` is the label shown on it. */

/* A timeline should read chronologically, so the track sorts by year rather
   than by the authored `order` the other pages use. Projects with no year
   keep their authored order and follow the dated ones — an unknown date
   shouldn't get to claim it is the most recent. */
function timelineOrder(list) {
  const yearOf = (p) => {
    const m = String(p.date || p.year || "").match(/\d{4}/);
    return m ? Number(m[0]) : null;
  };
  return list
    .map((p, i) => ({ p, i, y: yearOf(p) }))
    .sort((a, b) => {
      if (a.y === null || b.y === null) {
        // Both undated: keep the authored order. One undated: it goes last.
        return a.y === b.y ? a.i - b.i : a.y === null ? 1 : -1;
      }
      return b.y - a.y || a.i - b.i;
    })
    .map((x) => x.p);
}

// A short line for the hover preview: the project's own summary if set,
// otherwise the opening of its description.
function projectSummary(p) {
  if (p.summary && p.summary.trim()) return p.summary.trim();
  const first = (p.body || []).find((b) => b && b.trim() && !b.trim().startsWith("["));
  if (!first) return "";
  const clean = first.trim().replace(/\s+/g, " ");
  if (clean.length <= 150) return clean;
  const cut = clean.slice(0, 150);
  return cut.slice(0, cut.lastIndexOf(" ")) + "…";
}

/* The timeline's scroller spans the full width of the page, so a wheel or
   trackpad gesture anywhere over it moves the projects sideways instead of
   moving the page. These bookend it with an explicit way out in each
   direction. "#top" is the spec's special fragment for the top of the
   document, so it needs no matching element. */
function jumpLink(dir, href, label) {
  const d = dir === "up" ? "M19 15l-7-7-7 7" : "M5 9l7 7 7-7";
  return `    <a class="tl-jump tl-jump--${dir}" href="${href}" aria-label="${attr(
    label
  )}">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${d}"></path></svg>
    </a>`;
}

function renderTimeline() {
  // Both the reel and the track index into this same ordering, so the
  // preview that fades in always belongs to the centred project.
  const ordered = timelineOrder(projects);

  // A reel of covers: the active one centred and full size, its neighbours
  // shrunk and faded either side.
  const previews = ordered
    .map(
      (p, i) => `        <a class="tl-preview${i === 0 ? " is-active" : ""}"
          href="projects/${attr(p.slug)}.html" data-index="${i}" tabindex="-1">
          <span class="tl-preview-img">${
            p.cover
              ? `<img src="${attr(p.cover)}" alt="${attr(p.title)}" loading="lazy">`
              : `<span class="placeholder-label">${esc(p.title)}</span>`
          }</span>
          <span class="tl-preview-text">
            <span class="tl-preview-title">${esc(p.title)}</span>
            <span class="tl-preview-desc">${esc(projectSummary(p))}</span>
          </span>
        </a>`
    )
    .join("\n");

  const items = ordered
    .map(
      (p, i) => `        <a class="tl-item accent-${Number(p.accent) || 1}${
        i === 0 ? " is-active" : ""
      }" href="projects/${attr(p.slug)}.html" data-index="${i}">
          <span class="tl-title">${esc(p.title)}</span>
          <span class="tl-tick" aria-hidden="true"></span>
          <span class="tl-date">${esc(p.date || "—")}</span>
        </a>`
    )
    .join("\n");

  return `  <section class="timeline" id="work">
    <div class="container">
      <div class="section-head reveal">
        <h2>Selected Work</h2>
      </div>
    </div>

${jumpLink("up", "#top", "Back to top")}

    <div class="tl-stage">
      <div class="tl-reel">
${previews}
      </div>
    </div>

    <div class="tl-scroller" tabindex="0" role="list" aria-label="Projects">
      <div class="tl-track">
        <div class="tl-axis" aria-hidden="true"></div>
${items}
      </div>
    </div>

${jumpLink("down", "#about-teaser", "Continue to About")}
  </section>`;
}

function workPage() {
  const h = settings.home || {};
  const cards = projects
    .map((p) => {
      const href = `projects/${attr(p.slug)}.html`;
      const meta = [p.type, p.year].filter(Boolean).join(" — ");
      return `        <a class="project-card reveal accent-${
        Number(p.accent) || 1
      }" href="${href}">
          ${frame(p.cover, p.cover ? p.title : `[Cover image — ${p.title}]`)}
          <div class="card-caption">
            <h3>${esc(p.title)}</h3>
            <span class="card-meta"><i class="swatch"></i>${esc(meta)}</span>
          </div>
        </a>`;
    })
    .join("\n\n");

  const metaRow = (h.meta || [])
    .filter((m) => m && m.label)
    .map(
      (m) =>
        `<div class="reveal"><strong>${esc(m.label)}</strong>${esc(m.value)}</div>`
    )
    .join("\n        ");

  return `${head(`${site.name} — ${site.role} Portfolio`, {
    description: site.description,
    // Only meaningful when a landing page exists to swipe from.
    swipe: landingOn,
    swipeIn: landingOn,
  })}
${landingOn ? '<div class="swipe-root">' : ""}
${header("work")}

<main>

  <section class="hero">
    <div class="container">
      ${h.eyebrow ? `<span class="eyebrow reveal">${esc(h.eyebrow)}</span>` : ""}
      <h1 class="reveal">${esc(h.headline)}</h1>
      ${h.intro ? `<p class="lede reveal">${esc(h.intro)}</p>` : ""}
      ${metaRow ? `\n      <div class="hero-meta">\n        ${metaRow}\n      </div>` : ""}
    </div>
  </section>

${
    projects.length === 0
      ? '  <section class="work"><div class="container"><p class="lede">No published projects yet.</p></div></section>'
      : (h.layout || "timeline") === "grid"
      ? `  <section class="work" id="work">
    <div class="container">
      <div class="section-head reveal">
        <h2>Selected Work</h2>
      </div>

      <div class="work-grid">

${cards}

      </div>
    </div>
  </section>`
      : renderTimeline()
  }

  <section class="about-teaser" id="about-teaser">
    <div class="container split">
      <div class="reveal">
        <span class="eyebrow">About</span>
        <h2>${esc(h.aboutHeadline)}</h2>
        <p class="lede" style="margin-top: 1rem;">${esc(h.aboutSummary)}</p>
        <a href="about.html" class="btn" style="margin-top: 2rem;">More about me →</a>
      </div>
      ${frame(h.portrait, "[Portrait or studio photo]", "reveal")}
    </div>
  </section>

</main>
${footer(0, { wrapped: landingOn })}`;
}

function aboutPage() {
  const a = settings.about || {};
  const paras = (a.paragraphs || [])
    .map(
      (p) =>
        `<p class="lede" style="margin-top: 1rem; max-width: 50ch;">${esc(p)}</p>`
    )
    .join("\n        ");

  const skills = (a.skills || [])
    .map(
      (g) => `        <div>
          <h3>${esc(g.heading)}</h3>
          <ul>
            ${(g.items || []).map((i) => `<li>${esc(i)}</li>`).join("\n            ")}
          </ul>
        </div>`
    )
    .join("\n");

  const timeline = (a.timeline || [])
    .map(
      (t) => `        <div class="timeline-item">
          <span class="year">${esc(t.year)}</span>
          <div>
            <h3>${esc(t.title)}</h3>
            ${t.detail ? `<p style="color: var(--color-text-muted); margin-top: 0.25rem;">${esc(t.detail)}</p>` : ""}
          </div>
        </div>`
    )
    .join("\n");

  return `${head(`About — ${site.name}`)}
${header("about")}

<main>

  <section class="hero" style="padding-bottom: 0;">
    <div class="container split">
      <div>
        <span class="eyebrow">About</span>
        <h1 style="max-width: 14ch;">${esc(site.name)}</h1>
        ${paras}
        ${a.resume ? `<a href="${attr(a.resume)}" class="btn" style="margin-top: 2rem;">Download Résumé / CV ↓</a>` : ""}
      </div>
      ${frame(a.portrait, "[Portrait photo]")}
    </div>
  </section>

  ${
    skills
      ? `<section>
    <div class="container">
      <div class="section-head"><h2>Software &amp; Skills</h2></div>
      <div class="skills-grid">
${skills}
      </div>
    </div>
  </section>`
      : ""
  }

  ${
    timeline
      ? `<section style="padding-top: 0;">
    <div class="container">
      <div class="section-head"><h2>Education &amp; Experience</h2></div>
      <div class="timeline">
${timeline}
      </div>
    </div>
  </section>`
      : ""
  }

</main>
${footer(0)}`;
}

function contactPage() {
  const c = contact;
  const row = (label, value, href) => {
    if (!value) return "";
    const inner = href
      ? `<a href="${attr(href)}" class="text-link" rel="noopener">${esc(value)}</a>`
      : esc(value);
    return `          <dt>${esc(label)}</dt>\n          <dd>${inner}</dd>\n`;
  };

  const left =
    row("Email", c.email, c.email ? `mailto:${c.email}` : null) +
    row("Phone", c.phone) +
    row("Location", c.location);
  const right =
    row("LinkedIn", c.linkedin, c.linkedin) +
    row("Instagram", c.instagram, c.instagram) +
    row("Résumé", settings.about?.resume ? "Download PDF ↓" : "", settings.about?.resume);

  return `${head(`Contact — ${site.name}`)}
${header("contact")}

<main>
  <section class="hero contact-main">
    <div class="container">
      <span class="eyebrow">Contact</span>
      <h1>${esc(c.headline)}</h1>

      <div class="contact-grid">
        <dl class="contact-block">
${left}        </dl>
        <dl class="contact-block">
${right}        </dl>
      </div>
    </div>
  </section>
</main>
${footer(0, { full: false })}`;
}

/* ---------- gallery ----------
   Images carry a `group` (Views / Plans / Sections / Diagrams) and an
   optional `building`. Projects with more than one group get tabs; the
   rest keep a plain grid. Buildings become subheadings inside a tab so
   floors of one structure read together instead of interleaving. */

const GROUP_ORDER = ["Views", "Plans", "Sections & Elevations", "Diagrams"];

function galleryFigure(g) {
  const cls = "gallery-item" + (g.wide ? " span-2" : "");
  const label = g.caption || "Image";
  return `      <figure class="${cls}">
        ${frame(g.src, label, "", 1)}${
    g.caption ? `\n        <figcaption>${esc(g.caption)}</figcaption>` : ""
  }
      </figure>`;
}

// Buildings in first-seen order, each rendered as its own labelled grid.
function renderPanelBody(items) {
  const order = [];
  const byBuilding = new Map();
  for (const it of items) {
    const b = it.building || "";
    if (!byBuilding.has(b)) {
      byBuilding.set(b, []);
      order.push(b);
    }
    byBuilding.get(b).push(it);
  }
  // A single unnamed bucket needs no subheading.
  const showHeadings = order.filter((b) => b).length > 0 && order.length > 1;

  return order
    .map((b) => {
      const grid = byBuilding
        .get(b)
        .map(galleryFigure)
        .join("\n");
      const heading =
        showHeadings && b ? `      <h3 class="gallery-group">${esc(b)}</h3>\n` : "";
      return `${heading}      <div class="project-gallery">\n${grid}\n      </div>`;
    })
    .join("\n");
}

function renderGallery(items) {
  if (!items.length) return "";

  const groups = [];
  for (const name of GROUP_ORDER) {
    const inGroup = items.filter((i) => (i.group || "Views") === name);
    if (inGroup.length) groups.push([name, inGroup]);
  }
  // Anything with an unrecognised group falls in at the end.
  const known = new Set(GROUP_ORDER);
  const rest = items.filter((i) => i.group && !known.has(i.group));
  if (rest.length) groups.push(["More", rest]);

  if (groups.length <= 1) {
    const only = groups.length ? groups[0][1] : items;
    return `<div class="container">\n${renderPanelBody(only)}\n  </div>`;
  }

  const id = (n) => "g-" + n.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const tabs = groups
    .map(
      ([name], i) =>
        `      <button class="gallery-tab" role="tab" id="tab-${id(name)}"
        aria-controls="panel-${id(name)}" aria-selected="${i === 0}">${esc(
          name
        )} <span class="tab-count">${groups[i][1].length}</span></button>`
    )
    .join("\n");

  const panels = groups
    .map(
      ([name, items2]) =>
        `    <section class="gallery-panel" id="panel-${id(
          name
        )}" role="tabpanel" aria-labelledby="tab-${id(name)}">
      <h2 class="gallery-panel-title">${esc(name)}</h2>
${renderPanelBody(items2)}
    </section>`
    )
    .join("\n")

  return `<div class="container gallery-tabs">
    <div class="gallery-tablist" role="tablist" aria-label="Drawings and views">
${tabs}
    </div>
${panels}
  </div>`;
}

/* ---------- walkthrough ----------
   A project can carry `chapters` instead of a tabbed gallery, for work that
   is better read in sequence than browsed. Each chapter is a numbered
   episode with its own heading, text and images. */
function renderChapters(chapters) {
  if (!chapters || !chapters.length) return "";

  const nav = chapters
    .map(
      (c, i) =>
        `        <a href="#chapter-${i + 1}"><span>${String(i + 1).padStart(
          2,
          "0"
        )}</span>${esc(c.title)}</a>`
    )
    .join("\n");

  const sections = chapters
    .map((c, i) => {
      // Images are grouped by size so a full-width drawing isn't forced into
      // the same row as a pair, and a tertiary figure stays small.
      const imgs = c.images || [];
      const wide = imgs.filter((g) => (g.size || "normal") === "wide");
      const small = imgs.filter((g) => g.size === "small");
      const normal = imgs.filter(
        (g) => (g.size || "normal") !== "wide" && g.size !== "small"
      );

      const figure = (img, cls) =>
        `        <figure class="gallery-item${cls}">
          ${frame(img.src, img.caption || c.title, "", 1)}${
          img.caption ? `\n          <figcaption>${esc(img.caption)}</figcaption>` : ""
        }
        </figure>`;

      // A chapter may also carry named blocks: full-bleed images that run the
      // whole screen, and strips that scroll sideways for sequences.
      const blocks = [];

      for (const b of c.blocks || []) {
        const items = (b.images || []).filter((g) => g && g.src);
        if (!items.length) continue;

        if (b.kind === "full") {
          for (const g of items) {
            blocks.push(`      <div class="container">
        <figure class="chapter-wide">
          <img src="../${attr(g.src)}" alt="${attr(g.caption || c.title)}" loading="lazy">${
              g.caption ? `\n          <figcaption>${esc(g.caption)}</figcaption>` : ""
            }
        </figure>
      </div>`);
          }
        } else {
          // Everything that is not full width is a grid. Sequences read down
          // the page in order rather than sideways behind a scrollbar.
          if (b.title) {
            blocks.push(
              `      <div class="container"><h3 class="block-title">${esc(b.title)}</h3></div>`
            );
          }
          blocks.push(
            `      <div class="container project-gallery">\n${items
              .map((g) => figure(g, ""))
              .join("\n")}\n      </div>`
          );
        }
      }

      for (const g of wide) {
        blocks.push(`      <div class="container chapter-figure">\n${figure(g, "")}\n      </div>`);
      }
      if (normal.length) {
        blocks.push(
          `      <div class="container project-gallery">\n${normal
            .map((g) => figure(g, ""))
            .join("\n")}\n      </div>`
        );
      }
      for (const g of small) {
        blocks.push(`      <div class="container chapter-figure is-small">\n${figure(g, "")}\n      </div>`);
      }

      const body = (c.body || [])
        .map((t) => `          <p>${esc(t)}</p>`)
        .join("\n");

      const stats = (c.stats || []).length
        ? `      <div class="container chapter-stats">\n${c.stats
            .map(
              (s) => `        <div class="stat">
          <span class="stat-value">${esc(s.value)}</span>
          <span class="stat-label">${esc(s.label)}</span>
        </div>`
            )
            .join("\n")}\n      </div>`
        : "";

      const list =
        c.list && (c.list.items || []).length
          ? `      <div class="container chapter-list">
        ${c.list.title ? `<h3>${esc(c.list.title)}</h3>` : ""}
        <ul>
${c.list.items.map((t) => `          <li>${esc(t)}</li>`).join("\n")}
        </ul>
      </div>`
          : "";

      const quote =
        c.quote && c.quote.text
          ? `      <div class="container">
        <blockquote class="chapter-quote">
          <p>${esc(c.quote.text)}</p>
          ${c.quote.attribution ? `<cite>${esc(c.quote.attribution)}</cite>` : ""}
        </blockquote>
      </div>`
          : "";

      return `    <section class="chapter" id="chapter-${i + 1}">
      <div class="container chapter-head">
        <span class="chapter-number">${String(i + 1).padStart(2, "0")}</span>
        <div>
          <h2>${esc(c.title)}</h2>
          ${c.standfirst ? `<p class="chapter-standfirst">${esc(c.standfirst)}</p>` : ""}
${body}
        </div>
      </div>
${[stats, list, quote, ...blocks].filter(Boolean).join("\n")}
    </section>`;
    })
    .join("\n\n");

  return `  <nav class="chapter-nav" aria-label="Chapters">
    <div class="container">
${nav}
    </div>
  </nav>

${sections}`;
}

function projectPage(p, prev, next) {
  const meta = [
    ["Location", p.location],
    ["Program", p.program],
    ["Status", p.status],
    ["Role", p.role],
  ]
    .filter(([, v]) => v)
    .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
    .join("\n        ");

  const body = (p.body || []).map((t) => `      <p>${esc(t)}</p>`).join("\n");

  const gallery = renderGallery(p.gallery || []);

  const navLink = (target, label, dir) =>
    target
      ? `      <a href="${attr(target.slug)}.html">
        <span class="eyebrow">${label}</span>
        ${esc(target.title)}
      </a>`
      : "      <span></span>";

  return `${head(`${p.title} — ${site.name}`, { depth: 1 })}
${header("work", 1)}

<main>

  <section class="project-hero accent-${Number(p.accent) || 1}">
    <div class="container">
      <span class="eyebrow"><i class="swatch"></i>${esc(
        [p.type, p.year].filter(Boolean).join(" — ")
      )}</span>
      <h1>${esc(p.title)}</h1>

      ${frame(p.cover, p.cover ? p.title : "[Hero image]", "", 1)}

      ${meta ? `<dl class="project-meta-bar">\n        ${meta}\n      </dl>` : ""}
    </div>
  </section>

  ${
    body
      ? `<div class="container project-body">
    <div><h2>Overview</h2></div>
    <div>
${body}
    </div>
  </div>`
      : ""
  }

  ${p.chapters && p.chapters.length ? renderChapters(p.chapters) : gallery}

  <div class="container">
    <nav class="project-nav">
${navLink(prev, "← Previous")}
${navLink(next, "Next →")}
    </nav>
  </div>

</main>
${footer(1, { full: false })}`;
}

/* ---------- write ---------- */
rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "projects"), { recursive: true });

const written = [];
const put = (rel, html) => {
  const p = join(OUT, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, html, "utf8");
  written.push(rel);
};

if (landingOn) {
  put("index.html", landingPage());
  put("work.html", workPage());
} else {
  put("index.html", workPage());
}
put("about.html", aboutPage());
put("contact.html", contactPage());

projects.forEach((p, i) => {
  const prev = projects[(i - 1 + projects.length) % projects.length];
  const next = projects[(i + 1) % projects.length];
  put(
    `projects/${p.slug}.html`,
    projectPage(p, projects.length > 1 ? prev : null, projects.length > 1 ? next : null)
  );
});

// Static passthrough
for (const dir of ["css", "js", "assets"]) {
  if (existsSync(join(ROOT, dir))) cpSync(join(ROOT, dir), join(OUT, dir), { recursive: true });
}
for (const f of [".nojekyll", "robots.txt"]) {
  if (existsSync(join(ROOT, f))) cpSync(join(ROOT, f), join(OUT, f));
}

console.log(
  `Built ${written.length} pages (${projects.length} published project${
    projects.length === 1 ? "" : "s"
  }, landing page ${landingOn ? "on" : "off"}):`
);
written.forEach((w) => console.log("  " + w));
