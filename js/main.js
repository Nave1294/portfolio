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
  const stage = document.querySelector(".tl-stage");
  let active = 0;

  // Centre the active preview by measuring it, rather than with percentage
  // maths that would resolve against the reel's own width.
  const centreReel = () => {
    if (!reel || !stage || !previews[active]) return;
    const el = previews[active];
    const offset = stage.clientWidth / 2 - (el.offsetLeft + el.offsetWidth / 2);
    reel.style.transform = "translateX(" + offset + "px)";
  };

  const track = scroller.querySelector(".tl-track");

  // The name rides under its own image: same measurement, same moment, so
  // the two never drift apart.
  const centreNames = () => {
    if (!track || !items[active]) return;
    const el = items[active];
    const offset = scroller.clientWidth / 2 - (el.offsetLeft + el.offsetWidth / 2);
    track.style.transform = "translateX(" + offset + "px)";
  };

  const NUDGE = 4;
  let pointerAt = null;
  let pointerMoved = true;

  const centre = () => {
    centreReel();
    centreNames();
    // The row has just moved. Whatever is now under the pointer got there by
    // sliding, so the next hover has to be earned by a real pointer move.
    pointerMoved = false;
  };

  /* Centring slides the name row, which drags a different project under a
     pointer that has not moved — that project's mouseenter then fires, and
     the row slides again, and again. The fix is to tell the two cases
     apart: a hover only counts if the pointer itself moved since the last
     slide. A few pixels of tremor should not count either. */

  stage.addEventListener("pointermove", (event) => {
    if (
      !pointerAt ||
      Math.abs(event.clientX - pointerAt.x) > NUDGE ||
      Math.abs(event.clientY - pointerAt.y) > NUDGE
    ) {
      pointerAt = { x: event.clientX, y: event.clientY };
      pointerMoved = true;
    }
  });

  // Forget where the pointer was whenever it leaves, so coming back counts.
  stage.addEventListener("pointerleave", () => {
    pointerAt = null;
    pointerMoved = true;
  });

  /* Selecting a project and moving the reel to it are separate: the photos
     do both, the names only the first. Hovering a name lights its picture
     up wherever it happens to sit, without dragging everything sideways. */
  const setActive = (index, { slide = true } = {}) => {
    if (index < 0 || index >= items.length) return;
    if (index === active) {
      if (slide) centre();
      return;
    }
    active = index;
    items.forEach((el, i) => el.classList.toggle("is-active", i === index));
    previews.forEach((el, i) => {
      const on = i === index;
      el.classList.toggle("is-active", on);
      el.tabIndex = on ? 0 : -1;
    });
    if (slide) centre();
  };

  window.addEventListener("resize", centre);
  // Covers arrive late and change the reel's measurements.
  window.addEventListener("load", centre);
  previews.forEach((p) => {
    const img = p.querySelector("img");
    if (img && !img.complete) img.addEventListener("load", centre, { once: true });
  });
  // Catches layout changes a window resize would miss — a late webfont, or
  // the pane itself being resized — which would otherwise leave the reel
  // measured against a stale width and visibly off centre.
  if (window.ResizeObserver && stage) {
    new ResizeObserver(centre).observe(stage);
  }

  // Hovering a photo brings it to the middle; the names below follow it.
  // The pictures are the part worth pointing at, and they are large enough
  // to aim for — the names are a label, and are still keyboard-reachable
  // and clickable below.
  previews.forEach((el, i) => {
    el.addEventListener("mouseenter", () => {
      // The reel moved, not the pointer — this hover is the code's own doing.
      if (!pointerMoved) return;
      pause();
      setActive(i);
    });
  });

  // Hovering a name selects it but leaves the reel where it is — that is
  // what the photos are for. Keyboard focus does move it, so tabbing
  // cannot leave the focused project off-screen.
  items.forEach((el, i) => {
    el.addEventListener("mouseenter", () => {
      pause();
      setActive(i, { slide: false });
    });
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

  const section = document.querySelector(".timeline");
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
  const startCursor = () => {
    const scroller = document.querySelector(".tl-stage");
    if (still || !scroller) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const ring = document.createElement("div");
    ring.className = "tl-cursor";
    document.body.appendChild(ring);
    scroller.classList.add("has-cursor");

    let x = 0, y = 0, ticking = false;
    const draw = () => {
      ring.style.transform = ring.classList.contains("is-pressed")
        ? "translate3d(" + x + "px," + y + "px,0) scale(0.82)"
        : "translate3d(" + x + "px," + y + "px,0)";
      ticking = false;
    };
    stage.addEventListener("pointermove", (event) => {
      x = event.clientX;
      y = event.clientY;
      if (!ticking) { ticking = true; requestAnimationFrame(draw); }
    });
    scroller.addEventListener("pointerenter", () => ring.classList.add("is-on"));
    scroller.addEventListener("pointerleave", () => ring.classList.remove("is-on", "is-pressed"));
    scroller.addEventListener("pointerdown", () => ring.classList.add("is-pressed"));
    window.addEventListener("pointerup", () => ring.classList.remove("is-pressed"));
  };

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
    startCursor();
    startParallax();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
