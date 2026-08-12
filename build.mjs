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

function head(title, { depth = 0, description = "" } = {}) {
  const up = depth ? "../".repeat(depth) : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>${
    description ? `\n<meta name="description" content="${attr(description)}">` : ""
  }
<link rel="stylesheet" href="${up}css/style.css">
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

function footer(depth = 0, { full = true } = {}) {
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
    </div>
  </div>
</footer>

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

  return `${head(site.name || "Portfolio", { description: site.description })}

<main class="landing" style="--highlight-color: ${cssColor(l.highlightColor)}">
  <div class="landing-inner">
    <h1 class="landing-welcome fade-in">${heading}</h1>
    <p class="landing-subtitle fade-in fade-delay-1">${esc(l.subtitle || "")}</p>
    <a href="${WORK_URL}" class="landing-enter btn" id="landing-enter">${esc(
    l.buttonLabel || "Enter"
  )}</a>
  </div>
</main>

<script>
  // Reveal the enter button after the copy has settled.
  document.addEventListener("DOMContentLoaded", function () {
    var btn = document.getElementById("landing-enter");
    if (!btn) return;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setTimeout(function () { btn.classList.add("is-visible"); }, reduce ? 0 : ${delay * 1000});
  });
</script>
</body>
</html>
`;
}

function workPage() {
  const h = settings.home || {};
  const cards = projects
    .map((p) => {
      const href = `projects/${attr(p.slug)}.html`;
      const meta = [p.type, p.year].filter(Boolean).join(" — ");
      return `        <a class="project-card accent-${Number(p.accent) || 1}" href="${href}">
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
    .map((m) => `<div><strong>${esc(m.label)}</strong>${esc(m.value)}</div>`)
    .join("\n        ");

  return `${head(`${site.name} — ${site.role} Portfolio`, {
    description: site.description,
  })}
${header("work")}

<main>

  <section class="hero">
    <div class="container">
      ${h.eyebrow ? `<span class="eyebrow">${esc(h.eyebrow)}</span>` : ""}
      <h1>${esc(h.headline)}</h1>
      ${h.intro ? `<p class="lede">${esc(h.intro)}</p>` : ""}
      ${metaRow ? `\n      <div class="hero-meta">\n        ${metaRow}\n      </div>` : ""}
    </div>
  </section>

  <section class="work" id="work">
    <div class="container">
      <div class="section-head">
        <h2>Selected Work</h2>
      </div>

      <div class="work-grid">

${cards || '        <p class="lede">No published projects yet.</p>'}

      </div>
    </div>
  </section>

  <section class="about-teaser">
    <div class="container split">
      <div>
        <span class="eyebrow">About</span>
        <h2>${esc(h.aboutHeadline)}</h2>
        <p class="lede" style="margin-top: 1rem;">${esc(h.aboutSummary)}</p>
        <a href="about.html" class="btn" style="margin-top: 2rem;">More about me →</a>
      </div>
      ${frame(h.portrait, "[Portrait or studio photo]")}
    </div>
  </section>

</main>
${footer(0)}`;
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

  const gallery = (p.gallery || [])
    .map((g) =>
      "    " + frame(g.src, g.caption, g.wide ? "span-2 wide" : "", 1)
    )
    .join("\n");

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

  ${gallery ? `<div class="container project-gallery">\n${gallery}\n  </div>` : ""}

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
