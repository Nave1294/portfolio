// The arriving page is marked by an inline script in <head> (before first
// paint). Once it has slid in, drop the class: a lingering transform on the
// wrapper would become a containing block and break the sticky header.
// Resolves once the page is settled, so reveals don't fight the swipe.
const swipeSettled = new Promise((resolve) => {
  const root = document.documentElement;
  if (!root.classList.contains("swipe-entering")) return resolve();

  const done = () => {
    root.classList.remove("swipe-entering");
    resolve();
  };
  const wrapper = document.querySelector(".swipe-root");
  if (wrapper) wrapper.addEventListener("animationend", done, { once: true });
  // Safety net if the animation never runs (reduced motion, older browser).
  setTimeout(done, 1200);
});

// Rise items into place as they reach the viewport. Anything already on
// screen animates immediately; the rest wait until scrolled to.
//
// Uses plain geometry rather than IntersectionObserver. The elements start at
// opacity 0, so whatever reveals them must be dependable — and a watchdog
// below guarantees nothing can stay invisible even if this logic fails.
swipeSettled.then(() => {
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

  // IntersectionObserver rather than measuring on scroll: it keeps watching
  // as the page reflows, so late-loading images can't leave an element
  // stranded because its position was sampled before layout settled.
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
    items.forEach((el) => observer.observe(el));
  }

  // Watchdog: these elements start invisible, so something must always
  // reveal them. If anything is still hidden well after load — no observer
  // support, or it never fired — show it regardless of position. A missed
  // animation is a cosmetic loss; invisible content is a broken page.
  setTimeout(() => {
    pending.forEach((el) => reveal(el, 0));
    if (observer) observer.disconnect();
  }, 4000);
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
