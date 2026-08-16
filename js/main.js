// The arriving page is marked by an inline script in <head> (before first
// paint). Once it has slid in, drop the class: a lingering transform on the
// wrapper would become a containing block and break the sticky header.
(() => {
  const root = document.documentElement;
  if (!root.classList.contains("swipe-entering")) return;

  const done = () => root.classList.remove("swipe-entering");
  const wrapper = document.querySelector(".swipe-root");
  if (wrapper) wrapper.addEventListener("animationend", done, { once: true });
  // Safety net if the animation never runs (reduced motion, older browser).
  setTimeout(done, 1200);
})();

// Rise items into place as they reach the viewport, starting immediately so
// the cascade runs *during* the incoming swipe rather than after it. The
// observer measures the animated position, so items begin as soon as the
// sliding wrapper carries them into view.
//
// The elements start at opacity 0, so whatever reveals them must be
// dependable — hence the watchdog below.
(() => {
  const items = Array.from(document.querySelectorAll(".reveal"));
  if (!items.length) return;

  const reveal = (el, delay) => {
    if (el.classList.contains("is-in")) return;
    if (delay) el.style.animationDelay = delay + "ms";
    el.classList.add("is-in");
  };

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    items.forEach((el) => reveal(el, 0));
    return;
  }

  let pending = items.slice();

  // Arriving mid-swipe: start the on-screen items now so the cascade runs
  // alongside the page sliding in.
  //
  // Deliberately measured vertically. The swipe is a horizontal transform,
  // which leaves getBoundingClientRect().top untouched, so this is accurate
  // even while the wrapper is still off to the right. Leaving it to the
  // observer would be unreliable — transform animations are commonly run on
  // the compositor, and intersection updates can lag behind them.
  if (document.documentElement.classList.contains("swipe-entering")) {
    const line = window.innerHeight * 0.92;
    const onScreen = pending.filter(
      (el) => el.getBoundingClientRect().top < line
    );
    onScreen.forEach((el, index) => reveal(el, index * 90));
    pending = pending.filter((el) => !onScreen.includes(el));
  }

  // Everything further down waits until scrolled to. IntersectionObserver
  // rather than measuring on scroll: it keeps watching as the page reflows,
  // so a late-loading image can't strand an element whose position was
  // sampled before layout settled.
  let observer = null;
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries, obs) => {
        // Stagger within each batch so a row of cards cascades in.
        entries
          .filter((entry) => entry.isIntersecting)
          .forEach((entry, index) => {
            reveal(entry.target, index * 90);
            obs.unobserve(entry.target);
            pending = pending.filter((el) => el !== entry.target);
          });
      },
      { threshold: 0.08, rootMargin: "0px 0px -8% 0px" }
    );
    pending.forEach((el) => observer.observe(el));
  }

  // Watchdog: these elements start invisible, so something must always
  // reveal them. If anything is still hidden well after load — no observer
  // support, or it never fired — show it regardless of position. A missed
  // animation is a cosmetic loss; invisible content is a broken page.
  setTimeout(() => {
    pending.forEach((el) => reveal(el, 0));
    if (observer) observer.disconnect();
  }, 4000);
})();

// Timeline on the work page. Hovering (or focusing) a project shows its
// preview above the axis. The markup ships with the first project active,
// so without scripting the page still shows one preview and a full list of
// links.
document.addEventListener("DOMContentLoaded", () => {
  const scroller = document.querySelector(".tl-scroller");
  if (!scroller) return;

  const items = Array.from(scroller.querySelectorAll(".tl-item"));
  const previews = Array.from(document.querySelectorAll(".tl-preview"));
  if (!items.length) return;

  const reel = document.querySelector(".tl-reel");
  const section = document.querySelector(".timeline");
  const scrub = document.querySelector(".tl-scrub");
  let ring = null;
  const knob = document.querySelector(".tl-scrub-knob");
  const stage = document.querySelector(".tl-stage");
  let active = 0;

  /* The reel is driven by a continuous position rather than a list index, so
     the scrub bar can move it smoothly between projects. `pos` is a float:
     4.0 is the fifth project dead centre, 4.5 is halfway to the sixth. */
  const track = scroller.querySelector(".tl-track");
  let pos = 0;

  // Where a row has to sit for item i to be centred in its window.
  const offsetFor = (list, box, i) => {
    const el = list[i];
    if (!el) return 0;
    return box.clientWidth / 2 - (el.offsetLeft + el.offsetWidth / 2);
  };

  // Items are not evenly spaced — project names vary in width — so the
  // in-between positions are interpolated from the two they fall between
  // rather than assumed to be a fixed step apart.
  const offsetAt = (list, box, p) => {
    const i = Math.max(0, Math.min(list.length - 1, Math.floor(p)));
    const j = Math.min(list.length - 1, i + 1);
    const f = p - i;
    return offsetFor(list, box, i) * (1 - f) + offsetFor(list, box, j) * f;
  };

  const markActive = (index) => {
    if (index === active) return;
    active = index;
    // The ring wears the colour of whatever project it is sitting on.
    if (ring) {
      ring.style.setProperty(
        "--accent",
        getComputedStyle(items[index]).getPropertyValue("--accent").trim()
      );
    }
    items.forEach((el, i) => el.classList.toggle("is-active", i === index));
    previews.forEach((el, i) => {
      const on = i === index;
      el.classList.toggle("is-active", on);
      el.tabIndex = on ? 0 : -1;
    });
  };

  const paint = () => {
    if (reel && stage) reel.style.transform = "translateX(" + offsetAt(previews, stage, pos) + "px)";
    if (track) track.style.transform = "translateX(" + offsetAt(items, scroller, pos) + "px)";
    if (knob) knob.style.setProperty("--at", (items.length > 1 ? pos / (items.length - 1) : 0) * 100 + "%");
    markActive(Math.round(pos));
  };

  const setPos = (p, { glide = true } = {}) => {
    pos = Math.max(0, Math.min(items.length - 1, p));
    section.classList.toggle("is-scrubbing", !glide);
    paint();
  };

  const centre = () => setPos(pos, { glide: true });

  /* Kept so the rest of the file — idle cycling, keyboard, the wheel — can
     still ask for a project by number. */
  const setActive = (index, { slide = true } = {}) => {
    if (index < 0 || index >= items.length) return;
    if (slide) setPos(index, { glide: true });
    else markActive(index);
  };

  window.addEventListener("resize", centre);
  window.addEventListener("load", centre);
  previews.forEach((p) => {
    const img = p.querySelector("img");
    if (img && !img.complete) img.addEventListener("load", centre, { once: true });
  });
  if (window.ResizeObserver && stage) new ResizeObserver(centre).observe(stage);

  /* The wheel steps through the projects, but only over the names. That row
     is a single line of text, so the pictures above it and the rest of the
     page still scroll normally. */
  let wheelAcc = 0;
  let wheelLock = false;

  scroller.addEventListener(
    "wheel",
    (event) => {
      const delta =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (!delta) return;
      event.preventDefault();
      pause();
      if (wheelLock) return;
      wheelAcc += delta;
      // One trackpad flick should move one project, not five.
      if (Math.abs(wheelAcc) < 40) return;
      const step = wheelAcc > 0 ? 1 : -1;
      wheelAcc = 0;
      wheelLock = true;
      setTimeout(() => { wheelLock = false; }, 340);
      setActive(Math.min(items.length - 1, Math.max(0, Math.round(pos) + step)));
    },
    { passive: false }
  );

  /* ---------- drag the timeline itself ----------
     Grab the pictures or the names and pull. The reel follows the finger one
     for one, which is the only gesture that makes sense on a touchscreen —
     the scrub bar wants a pointer that can hover, and a finger cannot.
     Works with a mouse too. */
  const DRAG_MIN = 6;      // px before it counts as a drag rather than a tap
  let dragFrom = null;
  let dragPos = 0;
  let dragTravel = 0;
  // Set only by a drag that actually happened, and spent on the very next
  // click. Testing the travel counter instead let a stale value from an
  // earlier drag swallow a perfectly ordinary tap.
  let swallowClick = false;

  // Distance between two neighbouring pictures, so a pixel of finger maps to
  // the right fraction of a project.
  const previewStep = () => {
    if (previews.length < 2) return stage.clientWidth || 1;
    return Math.abs(previews[1].offsetLeft - previews[0].offsetLeft) || stage.clientWidth || 1;
  };

  const dragStart = (event) => {
    if (event.button && event.button !== 0) return;
    dragFrom = event.clientX;
    dragPos = pos;
    dragTravel = 0;
  };

  const dragMove = (event) => {
    if (dragFrom === null) return;
    const dx = event.clientX - dragFrom;
    dragTravel = Math.max(dragTravel, Math.abs(dx));
    if (dragTravel < DRAG_MIN) return;
    pause();
    setPos(dragPos - dx / previewStep(), { glide: false });
  };

  const dragEnd = () => {
    if (dragFrom === null) return;
    dragFrom = null;
    if (dragTravel >= DRAG_MIN) {
      setPos(Math.round(pos), { glide: true });
      swallowClick = true;
    }
  };

  [stage, scroller].forEach((zone) => {
    if (!zone) return;
    zone.addEventListener("pointerdown", dragStart);
    zone.addEventListener("pointermove", dragMove);
    zone.addEventListener("pointerup", dragEnd);
    zone.addEventListener("pointercancel", dragEnd);
    zone.addEventListener("pointerleave", dragEnd);
    // A drag that ends on a picture must not also follow its link.
    zone.addEventListener(
      "click",
      (event) => {
        if (!swallowClick) return;
        swallowClick = false;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );
  });

  /* ---------- the scrub bar ----------
     Hold the pointer away from the middle and the reel runs that way, faster
     the further out you hold it. The curve is deliberately steep near the
     centre: the middle third barely moves, so it is easy to hold still and
     read, while the last stretch of the pull is much quicker — the whole
     run in under two seconds if you hold it right at the edge. */
  if (scrub) {
    const DEAD = 0.08;        // of half the bar — a still zone in the middle
    const CURVE = 2.5;        // >1 puts the speed at the ends, not the centre
    const TOP_SPEED = 6.5;    // projects per second, held right at the edge
    let rate = 0;
    let raf = null;
    let last = 0;

    const step = (now) => {
      if (!rate) { raf = null; return; }
      const dt = Math.min(0.05, (now - last) / 1000 || 0);
      last = now;
      setPos(pos + rate * dt, { glide: false });
      raf = requestAnimationFrame(step);
    };

    const run = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    };

    // Where the pointer was last seen, so arming can pick up from a hand that
    // has been holding still — the dwell would otherwise expire against a
    // stale rate of zero and nothing would happen until the pointer twitched.
    let aimX = null;

    const applyAim = () => {
      if (aimX === null) return;
      const r = scrub.getBoundingClientRect();
      const rel = (aimX - (r.left + r.width / 2)) / (r.width / 2);
      const mag = Math.abs(rel);
      scrub.style.setProperty("--aim", ((rel + 1) / 2) * 100 + "%");
      if (!armed) { rate = 0; return; }   // still waiting out the dwell
      rate = mag < DEAD ? 0 : Math.sign(rel) * Math.pow((mag - DEAD) / (1 - DEAD), CURVE) * TOP_SPEED;
      if (rate) { pause(); run(); }
    };

    const aim = (event) => {
      aimX = event.clientX;
      applyAim();
    };

    /* A ring stands in for the pointer over the bar, and the bar only takes
       control once the pointer has stayed on it for a moment. Passing
       across on the way somewhere else leaves the reel alone; the ring
       filling in is what says the bar is now listening. */
    const DWELL = 1000;
    // Asked here rather than borrowed from the cycling block below, which is
    // declared later — reading it early would throw before it exists.
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let armed = false;
    let armTimer = null;
    let ringX = 0, ringY = 0, ringRaf = null;

    if (fine && !calm) {
      ring = document.createElement("div");
      ring.className = "tl-cursor";
      // Two circles: a faint track, and a stroke that sweeps around it over
      // the dwell so the wait is visible rather than merely endured.
      ring.innerHTML =
        '<svg viewBox="0 0 44 44" aria-hidden="true">' +
        '<circle class="tl-cursor-track" cx="22" cy="22" r="21"></circle>' +
        '<circle class="tl-cursor-fill" cx="22" cy="22" r="21"></circle></svg>';
      // The sweep is timed from the same constant that gates the control, so
      // the ring completing and the bar engaging cannot drift apart.
      ring.style.setProperty("--dwell", DWELL + "ms");
      document.body.appendChild(ring);
      scrub.classList.add("has-cursor");
    }

    const drawRing = () => {
      ring.style.transform = "translate3d(" + ringX + "px," + ringY + "px,0)";
      ringRaf = null;
    };

    scrub.addEventListener("pointerenter", () => {
      scrub.classList.add("is-live");
      if (ring) {
        // Restart the sweep from empty on every entry, not just the first.
        ring.classList.remove("is-filling", "is-armed");
        void ring.offsetWidth;
        ring.classList.add("is-on", "is-filling");
        ring.style.setProperty(
          "--accent",
          getComputedStyle(items[active]).getPropertyValue("--accent").trim()
        );
      }
      armed = false;
      clearTimeout(armTimer);
      armTimer = setTimeout(() => {
        armed = true;
        scrub.classList.add("is-armed");
        if (ring) ring.classList.add("is-armed");
        applyAim();                  // pick up wherever the pointer is resting
      }, DWELL);
    });

    scrub.addEventListener("pointermove", (event) => {
      if (ring) {
        ringX = event.clientX;
        ringY = event.clientY;
        if (!ringRaf) ringRaf = requestAnimationFrame(drawRing);
      }
      aim(event);
    });

    scrub.addEventListener("pointerleave", () => {
      clearTimeout(armTimer);
      armed = false;
      aimX = null;
      scrub.classList.remove("is-live", "is-armed");
      if (ring) ring.classList.remove("is-on", "is-filling", "is-armed");
      rate = 0;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      // Settle on whichever project is nearest, with the transition back on.
      setPos(Math.round(pos), { glide: true });
    });
  }

  // Hovering a name selects it but leaves the reel where it is — that is
  // what the photos are for. Keyboard focus does move it, so tabbing
  // cannot leave the focused project off-screen.
  items.forEach((el, i) => {
    el.addEventListener("focus", () => {
      pause();
      setActive(i);
    });
  });
  previews.forEach((el, i) => {
    el.addEventListener("focus", () => {
      pause();
      setActive(i);
    });
  });

  // Drift through the projects while nobody is interacting, so the stage
  // isn't a static image. Any interaction takes over immediately and
  // cycling only resumes once things have been quiet for a moment.
  const CYCLE_MS = 4500;
  const RESUME_MS = 6000;
  const stillMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let cycle = null;
  let resume = null;

  const stop = () => {
    clearInterval(cycle);
    cycle = null;
  };

  function play() {
    if (cycle || stillMotion.matches || document.hidden || items.length < 2) return;
    cycle = setInterval(() => setActive((active + 1) % items.length), CYCLE_MS);
  }

  function pause() {
    stop();
    clearTimeout(resume);
    resume = setTimeout(play, RESUME_MS);
  }

  if (section) {
    section.addEventListener("mouseenter", stop);
    section.addEventListener("mouseleave", () => {
      clearTimeout(resume);
      resume = setTimeout(play, 1200);
    });
  }

  // No point animating a tab nobody is looking at.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else play();
  });

  stillMotion.addEventListener?.("change", () => (stillMotion.matches ? stop() : play()));

  play();

  /* A wheel gesture over the timeline used to step through the projects,
     which meant preventDefault() on every vertical scroll across the whole
     section — so the page could not be scrolled past the strip at all. The
     projects are reachable by hover, click, arrow keys and the row's own
     sideways scroll, none of which cost the reader the page. */

  scroller.addEventListener("keydown", (event) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    pause();
    setActive(Math.min(items.length - 1, Math.max(0, active + step)), {
      scrollAxis: true,
    });
  });
});

// Gallery tabs on project pages. The markup ships with every panel visible
// so the drawings are reachable without scripting; this hides the inactive
// ones and wires up the tab strips. The strip appears twice, above and below
// the panels, so tabs are matched to panels by aria-controls rather than by
// position.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".gallery-tabs").forEach((wrap) => {
    const panels = Array.from(wrap.querySelectorAll(".gallery-panel"));
    const tabs = Array.from(wrap.querySelectorAll(".gallery-tab"));
    if (panels.length < 2 || !tabs.length) return;

    const select = (panelId, focusTab) => {
      panels.forEach((panel) => {
        panel.hidden = panel.id !== panelId;
      });
      tabs.forEach((tab) => {
        const active = tab.getAttribute("aria-controls") === panelId;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      if (focusTab) focusTab.focus();
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        select(tab.getAttribute("aria-controls"));
        // Switching from the strip below the panels would otherwise leave the
        // reader stranded past the end of the panel they just chose.
        if (tab.closest(".gallery-tablist").classList.contains("is-bottom")) {
          wrap.scrollIntoView({ block: "start" });
        }
      });
      tab.addEventListener("keydown", (event) => {
        const step =
          event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const strip = Array.from(
          tab.closest(".gallery-tablist").querySelectorAll(".gallery-tab")
        );
        const next = strip[(strip.indexOf(tab) + step + strip.length) % strip.length];
        select(next.getAttribute("aria-controls"), next);
      });
    });

    select(panels[0].id);
  });
});

// Lightbox. Any figure opens full screen, and the arrows step through the
// other images in the same panel or the same chapter — which is what reads as
// "adjacent" from where the reader clicked.
document.addEventListener("DOMContentLoaded", () => {
  const images = Array.from(
    document.querySelectorAll(".gallery-panel figure img, .chapter figure img")
  );
  if (!images.length) return;

  const groupOf = (img) => {
    const scope = img.closest(".gallery-panel") || img.closest(".chapter");
    return scope ? Array.from(scope.querySelectorAll("figure img")) : [img];
  };

  const box = document.createElement("div");
  box.className = "lightbox";
  box.hidden = true;
  box.innerHTML =
    '<button class="lightbox-close" type="button" aria-label="Close">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '<button class="lightbox-nav lightbox-prev" type="button" aria-label="Previous image">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>' +
    '<figure class="lightbox-figure"><img alt=""><figcaption></figcaption></figure>' +
    '<button class="lightbox-nav lightbox-next" type="button" aria-label="Next image">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>';
  document.body.appendChild(box);

  const shot = box.querySelector("img");
  const cap = box.querySelector("figcaption");
  const prev = box.querySelector(".lightbox-prev");
  const next = box.querySelector(".lightbox-next");
  const close = box.querySelector(".lightbox-close");

  let group = [];
  let index = 0;
  let opener = null;

  const show = (i) => {
    index = (i + group.length) % group.length;
    const img = group[index];
    shot.src = img.currentSrc || img.src;
    shot.alt = img.alt || "";
    const figcap = img.closest("figure").querySelector("figcaption");
    cap.textContent = figcap ? figcap.textContent.trim() : "";
    cap.hidden = !cap.textContent;
    const many = group.length > 1;
    prev.hidden = next.hidden = !many;
  };

  const open = (img) => {
    group = groupOf(img);
    opener = img;
    show(group.indexOf(img));
    box.hidden = false;
    document.body.classList.add("lightbox-open");
    close.focus();
  };

  const hide = () => {
    box.hidden = true;
    document.body.classList.remove("lightbox-open");
    shot.removeAttribute("src");
    if (opener) opener.focus();
  };

  images.forEach((img) => {
    img.closest("figure").classList.add("is-zoomable");
    img.addEventListener("click", () => open(img));
    // Reachable without a mouse.
    img.tabIndex = 0;
    img.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open(img);
      }
    });
  });

  prev.addEventListener("click", () => show(index - 1));
  next.addEventListener("click", () => show(index + 1));
  close.addEventListener("click", hide);
  box.addEventListener("click", (event) => {
    if (event.target === box) hide();
  });

  document.addEventListener("keydown", (event) => {
    if (box.hidden) return;
    if (event.key === "Escape") hide();
    else if (event.key === "ArrowLeft" && group.length > 1) show(index - 1);
    else if (event.key === "ArrowRight" && group.length > 1) show(index + 1);
  });
});

// Mobile nav toggle
document.addEventListener("DOMContentLoaded", () => {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");

  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const isOpen = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
      toggle.textContent = isOpen ? "Close" : "Menu";
    });

    links.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        links.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "Menu";
      });
    });
  }
});


/* ============================================================
   POLISH
   Four small behaviours. Each bails out early on reduced motion, and
   none of them is load-bearing: if any fails, the page is exactly the
   site without it.
   ============================================================ */
(() => {
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- page transition ----------
     Fade the main column out, then navigate. The arrival half is armed by
     a flag in sessionStorage and applied by an inline script in <head>,
     before first paint, so the page cannot flash in and then fade. */
  const startTransition = () => {
    if (still) return;
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target.closest("a");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
      if (link.id === "landing-enter") return;         // the swipe owns that one

      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin) return;
      // Same page, or a jump within it: let the browser scroll.
      if (url.pathname === location.pathname && url.hash) return;
      if (url.href === location.href) return;
      if (!/\.html?$/.test(url.pathname) && !url.pathname.endsWith("/")) return;

      event.preventDefault();
      try { sessionStorage.setItem("page-in", "1"); } catch (e) {}
      document.body.classList.add("page-leaving");

      // Navigate on the animation's end, with a timer behind it so a
      // dropped animationend event can never strand the reader.
      let gone = false;
      const go = () => {
        if (gone) return;
        gone = true;
        location.href = url.href;
      };
      const main = document.querySelector("main");
      if (main) main.addEventListener("animationend", go, { once: true });
      setTimeout(go, 320);
    });
  };

  /* ---------- read progress ----------
     Project pages only; a hairline of the project's accent under the
     header. */
  const startProgress = () => {
    if (still || !document.querySelector(".project-hero")) return;
    const bar = document.createElement("div");
    bar.className = "read-progress";
    // Inherit the project's accent from the hero.
    const hero = document.querySelector(".project-hero");
    const accent = getComputedStyle(hero).getPropertyValue("--accent");
    if (accent) bar.style.background = accent.trim();
    document.body.appendChild(bar);

    let ticking = false;
    const draw = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = "scaleX(" + ratio + ")";
      ticking = false;
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(draw);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    draw();
  };

  /* ---------- timeline cursor ---------- */
  /* ---------- hero parallax ----------
     A few pixels of drift, capped, so it reads as depth rather than as an
     effect. */
  const startParallax = () => {
    const img = document.querySelector(".project-hero .img-frame img");
    if (still || !img) return;
    const frame = img.parentElement;
    let ticking = false;
    const draw = () => {
      const rect = frame.getBoundingClientRect();
      if (rect.bottom > 0 && rect.top < window.innerHeight) {
        const past = Math.max(0, -rect.top);
        img.style.setProperty("--parallax", Math.min(28, past * 0.08).toFixed(1) + "px");
      }
      ticking = false;
    };
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(draw);
    }, { passive: true });
    draw();
  };

  /* The arrival animation starts main at opacity 0, so something must always
     finish it. Drop the flag once the animation has had its time: if it ran,
     removing the class is invisible; if it never ran, this is what stops the
     page from staying blank. Same rule as the reveal watchdog above — a lost
     animation is cosmetic, invisible content is a broken page. */
  const armTransitionWatchdog = () => {
    if (!document.documentElement.classList.contains("page-entering")) return;
    setTimeout(() => {
      document.documentElement.classList.remove("page-entering");
    }, 1200);
  };

  const boot = () => {
    armTransitionWatchdog();
    startTransition();
    startProgress();
    startParallax();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
