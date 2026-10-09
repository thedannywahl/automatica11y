// A browser script that wires up behavior on markup the page already has, the way an IIFE bundle does.
(function () {
  function start() {
    window.__initSawMarkup = Boolean(document.querySelector("[data-toggle]"));
    for (const button of document.querySelectorAll("[data-toggle]")) {
      const target = document.getElementById(button.getAttribute("data-toggle"));
      button.setAttribute("aria-expanded", "false");
      button.addEventListener("click", () => {
        const open = target.hidden;
        target.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
      });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
