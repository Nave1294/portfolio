// Generates the static site from content/ into dist/.
//   node build.mjs
// No dependencies. Everything the dashboard edits lives in content/.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "dist");

const read = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));

/* Stylesheet and script URLs carry a hash of their contents. Without it a
   returning visitor can pair newly deployed HTML with a cached script — which
   is not a cosmetic mismatch: the gallery would render every panel expanded. */
// Line endings are normalised first: git stores LF, a Windows checkout has
// CRLF, and hashing the raw bytes would give the local build and CI different
// versions for identical content.
const assetVersion = (p) =>
  existsSync(join(ROOT, p))
    ? createHash("sha1")
        .update(readFileSync(join(ROOT, p), "utf8").split(String.fromCharCode(13)).join(""))
        .digest("hex")
        .slice(0, 8)
    : "0";
const CSS_V = assetVersion("css/style.css");
const TRANSITION_V = assetVersion("css/transition.css");
const JS_V = assetVersion("js/main.js");

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

/* ---------- prose ----------
   The paragraph fields are edited as rich text in the dashboard, which stores
   markdown. Everything is escaped first, so only the four constructs below can
   ever produce markup: the dashboard is trusted, but not trusted to be a
   template. Plain prose passes through untouched, which is what nearly all of
   it is. */
const mdInline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+)_/g, "$1<em>$2</em>")
    // Any relative path, plus http(s) and mailto. Anything else carrying a
    // scheme — javascript:, data:, vbscript: — is left as the literal text it
    // was typed as, rather than becoming a link.
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, text, href) => {
      const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(href);
      if (scheme && !/^(https?|mailto)$/i.test(scheme[1])) return whole;
      return `<a href="${href}">${text}</a>`;
    });

// One rich-text value can hold several paragraphs; each becomes its own <p>,
// carrying whatever attributes the surrounding layout needs.
const paras = (value, attrs = "") =>
  String(value ?? "")
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<p${attrs ? " " + attrs : ""}>${mdInline(t)}</p>`);


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

// Research papers and presentations. A separate collection from projects:
// these are read rather than looked at, so they get their own section and a
// long-form page instead of a gallery.
const researchDir = join(ROOT, "content", "research");
const research = existsSync(researchDir)
  ? readdirSync(researchDir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(researchDir, f), "utf8")))
      .filter((r) => r.published !== false)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
  : [];

const landingOn = settings.landing?.enabled !== false;
// With a landing page, the grid moves to work.html so index.html can be the door.
const WORK_URL = landingOn ? "work.html" : "index.html";

/* ---------- shared partials ---------- */
const site = settings.site || {};
const contact = settings.contact || {};

/* ---------- wording ----------
   The site's own furniture — section headings, buttons, the navigation. Held
   here with defaults so every visible string is editable from the dashboard,
   without the config file having to carry copy for a site nobody has edited.
   A blank value in the dashboard means "use the wording below". */
const labels = settings.labels || {};
const lab = (key, fallback) => {
  const v = labels[key];
  return v === undefined || v === null || String(v).trim() === ""
    ? fallback
    : String(v).trim();
};

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
<link rel="preload" href="${up}assets/fonts/schibsted-grotesk.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${up}css/style.css?v=${CSS_V}">${
    swipe ? `\n<link rel="stylesheet" href="${up}css/transition.css?v=${TRANSITION_V}">` : ""
  }
<script>document.documentElement.classList.add("js");try{if(sessionStorage.getItem("page-in")==="1"){sessionStorage.removeItem("page-in");document.documentElement.classList.add("page-entering")}}catch(e){}</script>${
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
        <li><a href="${up}${WORK_URL}"${on("work")}>${esc(lab("navWork", "Work"))}</a></li>${
    research.length
      ? `\n        <li><a href="${up}research.html"${on("research")}>${esc(
          lab("navResearch", "Research")
        )}</a></li>`
      : ""
  }
        <li><a href="${up}about.html"${on("about")}>${esc(lab("navAbout", "About"))}</a></li>
        <li><a href="${up}contact.html"${on("contact")}>${esc(lab("navContact", "Contact"))}</a></li>
      </ul>
    </nav>
    <button class="nav-toggle" aria-expanded="false" aria-label="Toggle menu">${esc(lab("navMenu", "Menu"))}</button>
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
  links.push(`<a href="${up}contact.html" class="text-link">${esc(lab("footerContact", "Contact page →"))}</a>`);
  if (contact.linkedin)
    links.push(
      `<a href="${attr(contact.linkedin)}" class="text-link" rel="noopener">${esc(lab("footerLinkedin", "LinkedIn"))}</a>`
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
        ${esc(lab("backToTop", "Back to top"))}
      </a>
    </div>
  </div>
</footer>
${wrapped ? "</div>\n" : ""}
<script src="${up}js/main.js?v=${JS_V}"></script>
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

/* ---------- orientation ----------
   One question above the work, answered in place. Each answer is a short lay
   of the land rather than a single link — where to look and why, so a visitor
   who says what they came for gets pointed rather than routed.

   Every answer is rendered up front and the script collapses the ones not
   chosen. Without script the page just shows all three as plain suggestions:
   useful either way, and nothing pops up at anybody. */
function guideStrip() {
  const g = settings.guide || {};
  const routes = (g.routes || []).filter((r) => r && r.label);
  if (g.enabled === false || !routes.length) return "";

  const id = (i) => `guide-answer-${i}`;

  const buttons = routes
    .map(
      (r, i) =>
        `            <button class="guide-choice" type="button" aria-controls="${id(
          i
        )}" aria-expanded="false">${esc(r.label)}</button>`
    )
    .join("\n");

  const panels = routes
    .map((r, i) => {
      const links = (r.links || [])
        .filter((l) => l && l.label && l.href)
        .map(
          (l) =>
            `              <a href="${attr(l.href)}" class="text-link">${esc(
              l.label
            )}</a>`
        )
        .join("\n");
      return `        <div class="guide-answer" id="${id(i)}">
          ${paras(r.blurb).join("\n          ")}${
        links
          ? `\n          <div class="guide-links">\n${links}\n          </div>`
          : ""
      }
        </div>`;
    })
    .join("\n");

  return `
  <section class="guide-band" aria-label="Where to start">
    <div class="container">
      <div class="guide reveal">
        <div class="guide-ask">
          ${g.eyebrow ? `<span class="guide-eyebrow">${esc(g.eyebrow)}</span>` : ""}
          <p class="guide-question">${esc(g.question || "What brings you by?")}</p>
          <div class="guide-choices">
${buttons}
          </div>
        </div>
${panels}
      </div>
    </div>
  </section>
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
        <h2>${esc(lab("selectedWork", "Selected Work"))}</h2>
      </div>
    </div>

${jumpLink("up", "#top", lab("backToTop", "Back to top"))}

    <div class="tl-scrub" role="group" aria-label="Sweep to browse the projects">
      <div class="tl-scrub-inner">
        <span class="tl-scrub-rule" aria-hidden="true"></span>
        <span class="tl-scrub-ticks" aria-hidden="true">
${projects.map(() => "<i></i>").join("")}
        </span>
        <span class="tl-scrub-knob" aria-hidden="true"></span>
        <span class="tl-scrub-label" aria-hidden="true">
          <i class="tl-scrub-arrow">‹</i> sweep to browse <i class="tl-scrub-arrow">›</i>
        </span>
      </div>
    </div>

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
      ${paras(h.intro, 'class="lede reveal"').join("\n      ")}
      ${metaRow ? `\n      <div class="hero-meta">\n        ${metaRow}\n      </div>` : ""}
    </div>
  </section>

${guideStrip()}
${
    projects.length === 0
      ? '  <section class="work"><div class="container"><p class="lede">' + esc(lab("emptyWork", "No published projects yet.")) + '</p></div></section>'
      : (h.layout || "timeline") === "grid"
      ? `  <section class="work" id="work">
    <div class="container">
      <div class="section-head reveal">
        <h2>${esc(lab("selectedWork", "Selected Work"))}</h2>
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
        <span class="eyebrow">${esc(lab("aboutEyebrow", "About"))}</span>
        <h2>${esc(h.aboutHeadline)}</h2>
        ${paras(h.aboutSummary, 'class="lede" style="margin-top: 1rem;"').join("\n        ")}
        <a href="about.html" class="btn" style="margin-top: 2rem;">${esc(lab("aboutButton", "More about me →"))}</a>
      </div>
      ${frame(h.portrait, "[Portrait or studio photo]", "reveal")}
    </div>
  </section>

</main>
${footer(0, { wrapped: landingOn })}`;
}

function aboutPage() {
  const a = settings.about || {};
  const bio = (a.paragraphs || [])
    .map((p) =>
      paras(p, 'class="lede" style="margin-top: 1rem; max-width: 50ch;"').join("\n        ")
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

  const references = (a.references || [])
    .filter((r) => r && r.name)
    .map(
      (r) => `        <div class="reference">
          <h3>${esc(r.name)}</h3>
          ${r.title ? `<p class="reference-title">${esc(r.title)}</p>` : ""}
          ${r.organization ? `<p class="reference-org">${esc(r.organization)}</p>` : ""}
          ${
            r.email
              ? `<a href="mailto:${attr(r.email)}" class="text-link">${esc(r.email)}</a>`
              : ""
          }
          ${r.phone ? `<p class="reference-phone">${esc(r.phone)}</p>` : ""}
        </div>`
    )
    .join("\n");

  return `${head(`About — ${site.name}`)}
${header("about")}

<main>

  <section class="hero" style="padding-bottom: 0;">
    <div class="container split">
      <div>
        <span class="eyebrow">${esc(lab("aboutEyebrow", "About"))}</span>
        <h1 style="max-width: 14ch;">${esc(site.name)}</h1>
        ${bio}
        ${a.resume ? `<a href="${attr(a.resume)}" class="btn" style="margin-top: 2rem;">${esc(lab("resumeButton", "Download Résumé / CV ↓"))}</a>` : ""}
      </div>
      ${frame(a.portrait, "[Portrait photo]")}
    </div>
  </section>

  ${
    skills
      ? `<section>
    <div class="container">
      <div class="section-head"><h2>${esc(lab("skillsHeading", "Software & Skills"))}</h2></div>
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
      <div class="section-head"><h2>${esc(lab("experienceHeading", "Education & Experience"))}</h2></div>
      <div class="timeline">
${timeline}
      </div>
    </div>
  </section>`
      : ""
  }

  ${
    references
      ? `<section style="padding-top: 0;">
    <div class="container">
      <div class="section-head"><h2>${esc(lab("referencesHeading", "References"))}</h2></div>
      <div class="references-grid">
${references}
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
      <span class="eyebrow">${esc(lab("contactEyebrow", "Contact"))}</span>
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

const GROUP_ORDER = ["Views", "Maps", "Plans", "Sections & Elevations", "Diagrams", "Data", "Massing Exploration", "Film"];

function galleryFigure(g) {
  const cls =
    "gallery-item" +
    (g.wide ? " span-2" : "") +
    (g.size === "small" ? " is-small" : "");
  const label = g.caption || "Image";

  /* An entry carrying a `video` plays in place, using its `src` as the
     poster frame. preload="none" means the file is only fetched once the
     reader asks for it — until then the page costs one poster image. */
  const body = g.video
    ? `<div class="img-frame is-video">
          <video controls preload="none" playsinline${
            g.src ? ` poster="../${attr(g.src)}"` : ""
          }>
            <source src="../${attr(g.video)}" type="video/mp4">
          </video>
        </div>`
    : frame(g.src, label, "", 1);

  return `      <figure class="${cls}">
        ${body}${
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
      // A bucket that is entirely small images packs into a denser grid,
      // so a long serial sequence reads as one sheet, not a slow scroll.
      const dense = byBuilding.get(b).every((g) => g.size === "small");
      return `${heading}      <div class="project-gallery${
        dense ? " is-dense" : ""
      }">\n${grid}\n      </div>`;
    })
    .join("\n");
}

/* `lead` promotes one group to the first, selected tab. The thesis leads
   with Diagrams, since the argument is carried by the drawings rather than
   by the renders. */
function renderGallery(items, lead = "") {
  if (!items.length) return "";

  const order = GROUP_ORDER.includes(lead)
    ? [lead, ...GROUP_ORDER.filter((n) => n !== lead)]
    : GROUP_ORDER;

  const groups = [];
  for (const name of order) {
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

  // The strip is emitted twice — above the panels and again below them — so a
  // long tab does not have to be scrolled back up to switch. Only the top set
  // carries ids, since the panels' aria-labelledby points at those.
  const tabStrip = (bottom) =>
    groups
      .map(
        ([name], i) =>
          `      <button class="gallery-tab" role="tab"${
            bottom ? "" : ` id="tab-${id(name)}"`
          }
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
${tabStrip(false)}
    </div>
${panels}
    <div class="gallery-tablist is-bottom" role="tablist" aria-label="Drawings and views">
${tabStrip(true)}
    </div>
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

        // A block can carry its own paragraphs, so the argument sits beside
        // the figures it is about rather than stacking at the top of the
        // chapter and leaving the reader to match text to image.
        const blockText = (b.text || []).filter((t) => t && t.trim());
        if (blockText.length) {
          blocks.push(
            `      <div class="container block-text">\n${blockText
              .map((t) => "        " + paras(t).join("\n        "))
              .join("\n")}\n      </div>`
          );
        }

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
        .map((t) => "          " + paras(t).join("\n          "))
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

  const body = (p.body || [])
    .map((t) => "      " + paras(t).join("\n      "))
    .join("\n");

  // A project can carry both: the browsable gallery leads, and the
  // walkthrough follows for anyone who wants to read it in sequence.
  const hasChapters = !!(p.chapters && p.chapters.length);
  const gallery = renderGallery(p.gallery || [], p.galleryLead);
  const sectionHead = (title) =>
    `  <div class="container">
    <div class="section-head reveal"><h2>${esc(title)}</h2></div>
  </div>`;

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
    <div><h2>${esc(lab("overviewHeading", "Overview"))}</h2></div>
    <div>
${body}
    </div>
  </div>`
      : ""
  }

  ${
    hasChapters && gallery
      ? `${sectionHead("Drawings")}\n${gallery}\n\n${sectionHead(
          "Walkthrough"
        )}\n${renderChapters(p.chapters)}`
      : hasChapters
      ? renderChapters(p.chapters)
      : gallery
  }

  <div class="container">
    <nav class="project-nav">
${navLink(prev, lab("prevProject", "← Previous"))}
${navLink(next, lab("nextProject", "Next →"))}
    </nav>
  </div>

${jumpLink("up", "#top", lab("backToTop", "Back to top"))}

</main>
${footer(1, { full: false })}`;
}

/* ---------- research ----------
   Papers and presentations. The index lists them; each gets a long-form page
   with the text set to a reading measure, and the original document offered
   alongside for anyone who would rather have the PDF. */
function researchLine(r) {
  return [r.kind, r.date, r.context].filter(Boolean).join(" · ");
}

function researchIndexPage() {
  const cards = research
    .map((r) => {
      const topics = (r.topics || [])
        .filter(Boolean)
        .map((t) => `<li>${esc(t)}</li>`)
        .join("");
      return `        <a class="paper-card reveal" href="research/${attr(r.slug)}.html">
          <span class="paper-meta">${esc(researchLine(r))}</span>
          <h2>${esc(r.title)}</h2>${
        r.summary ? `\n          <p>${esc(r.summary)}</p>` : ""
      }${topics ? `\n          <ul class="paper-topics">${topics}</ul>` : ""}
        </a>`;
    })
    .join("\n\n");

  const h = settings.researchPage || {};
  return `${head(`${lab("researchHeading", "Research")} — ${site.name}`, {
    description: h.intro || "",
  })}
${header("research")}

<main>

  <section class="hero">
    <div class="container">
      <span class="eyebrow reveal">${esc(lab("researchEyebrow", "Writing"))}</span>
      <h1 class="reveal">${esc(h.headline || lab("researchHeading", "Research"))}</h1>${
    h.intro ? `\n      ${paras(h.intro, 'class="lede reveal"').join("\n      ")}` : ""
  }
    </div>
  </section>

  <section class="papers">
    <div class="container">

${cards}

    </div>
  </section>

</main>
${footer(0)}`;
}

function researchPage(r) {
  const blocks = (b) => {
    if (b.kind === "quote") {
      // Its own field rather than reusing `text`: paragraphs are a list and a
      // quotation is one string, and the dashboard cannot hold both under one
      // name without mangling whichever it did not expect.
      const t = String(b.quoteText || "").trim();
      if (!t) return "";
      return `        <blockquote class="paper-quote">
          ${paras(t).join("\n          ")}${
        b.attribution
          ? `\n          <cite>${esc(b.attribution)}</cite>`
          : ""
      }
        </blockquote>`;
    }
    if (b.kind === "list") {
      const items = (b.items || []).filter(Boolean);
      if (!items.length) return "";
      return `        <div class="paper-list">${
        b.title ? `\n          <h3>${esc(b.title)}</h3>` : ""
      }
          <ul>
${items.map((i) => `            <li>${esc(i)}</li>`).join("\n")}
          </ul>
        </div>`;
    }
    const text = Array.isArray(b.text) ? b.text : [b.text];
    return text
      .filter((t) => t && String(t).trim())
      .flatMap((t) => paras(t))
      .map((p) => "        " + p)
      .join("\n");
  };

  const body = (r.sections || [])
    .map((s) => {
      const inner = (s.blocks || []).map(blocks).filter(Boolean).join("\n\n");
      if (!inner && !s.heading) return "";
      return `      <section class="paper-section">${
        s.heading ? `\n        <h2>${esc(s.heading)}</h2>` : ""
      }
${inner}
      </section>`;
    })
    .filter(Boolean)
    .join("\n\n");

  const refs = (r.references || []).filter(Boolean);
  const refBlock = refs.length
    ? `
      <section class="paper-section paper-refs">
        <h2>${esc(lab("referencesListHeading", "Work cited"))}</h2>
        <ol>
${refs.map((x) => `          <li>${esc(x)}</li>`).join("\n")}
        </ol>
      </section>`
    : "";

  return `${head(`${r.title} — ${site.name}`, {
    depth: 1,
    description: r.summary || "",
  })}
${header("research", 1)}

<main class="paper">

  <section class="hero paper-hero">
    <div class="container">
      <span class="eyebrow reveal">${esc(researchLine(r))}</span>
      <h1 class="reveal">${esc(r.title)}</h1>${
    r.standfirst
      ? `\n      ${paras(r.standfirst, 'class="lede reveal"').join("\n      ")}`
      : ""
  }${
    r.pdf
      ? `\n      <a class="btn" href="../${attr(r.pdf)}" style="margin-top: 2rem;">${esc(
          lab("paperDownload", "Read the original PDF ↓")
        )}</a>`
      : ""
  }
    </div>
  </section>

  <article class="paper-body">
    <div class="container">

${body}
${refBlock}
    </div>
  </article>

</main>
${footer(1)}`;
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

if (research.length) {
  put("research.html", researchIndexPage());
  research.forEach((r) => put(`research/${r.slug}.html`, researchPage(r)));
}

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
