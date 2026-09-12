(() => {
  "use strict";

  const YEAR_OVERRIDES_KEY = "timeline-party-hitster-year-overrides";

  function readOverrides() {
    try { return JSON.parse(localStorage.getItem(YEAR_OVERRIDES_KEY) || "{}"); }
    catch { return {}; }
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>\"]/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
    }[c]));
  }

  function enhanceCorrections() {
    const panel = document.querySelector('.enhance-panel[data-panel="corrections"]');
    if (!panel) return;

    const overrides = readOverrides();
    panel.querySelectorAll('.stat-row').forEach((row) => {
      const button = row.querySelector('[data-enhance="delete-correction"][data-card]');
      if (!button) return;

      const id = String(Number(button.dataset.card)).padStart(5, "0");
      const card = globalThis.HITSTER_DK_CARDS?.[id];
      const correctedYear = Number(overrides[id] ?? overrides[String(Number(id))]);
      if (!card || !Number.isInteger(correctedYear)) return;

      const oldYear = Number(card.originalYear);
      const span = row.querySelector('span');
      if (!span) return;

      const yearText = Number.isInteger(oldYear) && oldYear !== correctedYear
        ? `<strong>${oldYear} → ${correctedYear}</strong>`
        : `<strong>${correctedYear}</strong>`;

      span.innerHTML = `<strong>Kort ${Number(id)}</strong><br>${esc(card.artist)} – ${esc(card.title)}<br>${yearText}`;
    });
  }

  const observer = new MutationObserver(enhanceCorrections);
  observer.observe(document.querySelector("#app") || document.documentElement, { childList: true, subtree: true });
  enhanceCorrections();
})();
