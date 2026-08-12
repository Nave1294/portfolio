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

// Timeline on the work page: whichever project sits nearest the centre of
// the track becomes active, and its cover fades in above. Ships with the
// first project active, so without scripting the page still shows a cover
// and a scrollable list of links.
document.addEventListener("DOMContentLoaded", () => {
  const track = document.querySelector(".tl-track");
  if (!track) return;

  const items = Array.from(track.querySelectorAll(".tl-item"));
  const covers = Array.from(document.querySelectorAll(".tl-cover"));
  if (!items.length) return;

  let active = -1;

  const setActive = (index) => {
    if (index === active || index < 0) return;
    active = index;
    items.forEach((el, i) => el.classList.toggle("is-active", i === index));
    covers.forEach((el, i) => {
      const on = i === index;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-hidden", String(!on));
      // Only the visible cover should be reachable by keyboard.
      el.tabIndex = on ? 0 : -1;
    });
  };

  const update = () => {
    const mid = track.getBoundingClientRect().left + track.clientWidth / 2;
    let best = 0;
    let bestDistance = Infinity;
    items.forEach((el, i) => {
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.left + rect.width / 2 - mid);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = i;
      }
    });
    setActive(best);
  };

  // Measured directly rather than deferred to requestAnimationFrame: with
  // only a dozen items this is cheap, and it keeps the active project in
  // step with the scroll instead of a frame behind it.
  track.addEventListener("scroll", update, { passive: true });
  window.addEventListener("resize", update);

  // A vertical wheel is the natural gesture on a mouse; translate it.
  track.addEventListener(
    "wheel",
    (event) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      track.scrollLeft += event.deltaY;
    },
    { passive: false }
  );

  track.addEventListener("keydown", (event) => {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = Math.min(items.length - 1, Math.max(0, active + step));
    items[next].scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  });

  update();
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
