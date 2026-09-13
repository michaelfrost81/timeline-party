(() => {
  "use strict";

  let coordinating = false;
  let settleFrame = null;

  const isEnglish = () => localStorage.getItem("timeline-party-language") === "en-US";

  function clickIfPresent(selector) {
    const button = document.querySelector(selector);
    if (button) button.click();
  }

  function settlePanels(kind) {
    if (settleFrame !== null) cancelAnimationFrame(settleFrame);
    settleFrame = requestAnimationFrame(() => {
      settleFrame = requestAnimationFrame(() => {
        settleFrame = null;
        coordinating = true;
        try {
          if (kind === "enhance") {
            clickIfPresent('.xp-panel [data-xp="close"]');
          } else if (kind === "xp") {
            clickIfPresent('.enhance-panel [data-enhance="close"]');
          }
        } finally {
          coordinating = false;
        }
        translateDynamicStats();
      });
    });
  }

  document.addEventListener("click", (event) => {
    if (coordinating) return;

    const enhanceButton = event.target.closest('[data-enhance="settings"],[data-enhance="stats"],[data-enhance="corrections"]');
    const xpButton = event.target.closest('[data-xp="profile"],[data-xp="history"]');

    if (!enhanceButton && !xpButton) return;

    coordinating = true;
    try {
      if (enhanceButton) clickIfPresent('.xp-panel [data-xp="close"]');
      if (xpButton) clickIfPresent('.enhance-panel [data-enhance="close"]');
    } finally {
      coordinating = false;
    }

    settlePanels(enhanceButton ? "enhance" : "xp");
  }, true);

  function translateDynamicStats() {
    if (!isEnglish()) return;

    document.querySelectorAll(".enhance-panel .stat-row span, .enhance-panel > p").forEach((node) => {
      if (node.children.length) return;
      let text = node.textContent || "";

      text = text.replace(/(\d+)\/(\d+) korrekte\b/g, "$1/$2 correct");
      text = text.replace(/(\d+) sejre\b/g, (_, count) => `${count} ${Number(count) === 1 ? "win" : "wins"}`);
      text = text.replace(/(\d+) spil\b/g, (_, count) => `${count} ${Number(count) === 1 ? "game" : "games"}`);
      text = text.replace(/(\d+) point\b/g, (_, count) => `${count} ${Number(count) === 1 ? "point" : "points"}`);
      text = text.replace(/(\d+) afsluttede spil\b/g, (_, count) => `${count} completed ${Number(count) === 1 ? "game" : "games"}`);
      text = text.replace(/(\d+) gemte runder\b/g, (_, count) => `${count} saved ${Number(count) === 1 ? "round" : "rounds"}`);

      if (node.textContent !== text) node.textContent = text;
    });
  }

  document.addEventListener("timeline-party-language-change", () => requestAnimationFrame(translateDynamicStats));

  const observer = new MutationObserver(() => requestAnimationFrame(translateDynamicStats));
  observer.observe(document.querySelector("#app") || document.documentElement, { childList: true, subtree: true });

  translateDynamicStats();
})();
