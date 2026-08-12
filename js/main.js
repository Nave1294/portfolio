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

  const setActive = (index, { scrollAxis = false } = {}) => {
    if (index < 0 || index >= items.length) return;
    if (index === active) {
      centreReel();
      return;
    }
    active = index;
    items.forEach((el, i) => el.classList.toggle("is-active", i === index));
    previews.forEach((el, i) => {
      const on = i === index;
      el.classList.toggle("is-active", on);
      el.tabIndex = on ? 0 : -1;
    });
    centreReel();
    if (scrollAxis) {
      items[index].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  };

  window.addEventListener("resize", centreReel);
  // Covers arrive late and change the reel's measurements.
  window.addEventListener("load", centreReel);
  previews.forEach((p) => {
    const img = p.querySelector("img");
    if (img && !img.complete) img.addEventListener("load", centreReel, { once: true });
  });
  // Catches layout changes a window resize would miss — a late webfont, or
  // the pane itself being resized — which would otherwise leave the reel
  // measured against a stale width and visibly off centre.
  if (window.ResizeObserver && stage) {
    new ResizeObserver(centreReel).observe(stage);
  }

  items.forEach((el, i) => {
    // Pointer and keyboard both drive the preview. The last one stays up
    // rather than clearing, so the stage never blinks empty.
    el.addEventListener("mouseenter", () => {
      pause();
      setActive(i);
    });
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
  scroller.addEventListener("scroll", pause, { passive: true });

  // No point animating a tab nobody is looking at.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else play();
  });

  stillMotion.addEventListener?.("change", () => (stillMotion.matches ? stop() : play()));

  play();

  // Wheel anywhere over the timeline — including the image — steps through
  // the projects. Deltas are accumulated so one trackpad flick does not
  // skip several at once. `section` is declared with the idle cycling above.
  let wheelAcc = 0;
  let wheelLock = false;

  if (section) {
    section.addEventListener(
      "wheel",
      (event) => {
        if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
        event.preventDefault();
        pause();
        if (wheelLock) return;
        wheelAcc += event.deltaY;
        if (Math.abs(wheelAcc) < 40) return;
        const step = wheelAcc > 0 ? 1 : -1;
        wheelAcc = 0;
        wheelLock = true;
        setTimeout(() => (wheelLock = false), 320);
        setActive(Math.min(items.length - 1, Math.max(0, active + step)), {
          scrollAxis: true,
        });
      },
      { passive: false }
    );
  }

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
// ones and wires up the tab strip.
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".gallery-tabs").forEach((wrap) => {
    const tabs = Array.from(wrap.querySelectorAll(".gallery-tab"));
    const panels = Array.from(wrap.querySelectorAll(".gallery-panel"));
    if (tabs.length < 2 || tabs.length !== panels.length) return;

    const select = (index, focus) => {
      tabs.forEach((tab, i) => {
        const active = i === index;
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
        panels[i].hidden = !active;
      });
      if (focus) tabs[index].focus();
    };

    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(i, false));
      tab.addEventListener("keydown", (event) => {
        const step =
          event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        select((i + step + tabs.length) % tabs.length, true);
      });
    });

    select(0, false);
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
