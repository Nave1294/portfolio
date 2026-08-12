// Reverse the page swipe when the visitor is going back, so the motion
// follows the direction of travel. No-ops where view transitions are
// unsupported. The transition renders in the arriving document, so tagging
// it here is enough to restyle both the outgoing and incoming halves.
window.addEventListener("pagereveal", (event) => {
  if (!event.viewTransition || !event.viewTransition.types) return;
  const activation = window.navigation && window.navigation.activation;
  if (activation && activation.navigationType === "traverse") {
    event.viewTransition.types.add("back");
  }
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
