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
