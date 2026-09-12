(() => {
  "use strict";

  function updateDuplicateYearSlots() {
    document.querySelectorAll(".timeline").forEach((timeline) => {
      const years = [...timeline.querySelectorAll(".year")].map((node) => Number(node.textContent.trim()));
      timeline.querySelectorAll('button[data-action="placeSong"]').forEach((button) => {
        const slot = Number(button.dataset.slot);
        const blockedByDuplicateYear = Number.isInteger(slot)
          && slot > 0
          && slot < years.length
          && years[slot - 1] === years[slot];

        if (!blockedByDuplicateYear || button.dataset.duplicateYearBlocked === "1") return;

        button.dataset.duplicateYearBlocked = "1";
        button.disabled = true;
        button.classList.add("occupied");
        button.classList.remove("selected");
        button.textContent = "Ikke mulig";
        button.setAttribute("aria-label", `Kan ikke placeres mellem to sange fra ${years[slot]}`);
      });
    });
  }

  function updateEarlyDecades() {
    const container = document.querySelector(".decades");
    if (!container || container.querySelector('[data-decade="1910"]')) return;

    let currentGame = null;
    let currentPlayerId = null;
    try {
      currentGame = game;
      currentPlayerId = myPlayerId;
    } catch {}

    const player = currentGame?.players?.find((item) => item.id === currentPlayerId) || null;
    const occupied = new Set((currentGame?.players || [])
      .filter((other) => player && other.id !== player.id && other.ready)
      .map((other) => other.selectedDecade)
      .filter(Number.isInteger));

    const fragment = document.createDocumentFragment();
    [1910, 1920, 1930, 1940].forEach((decade) => {
      const selected = player?.selectedDecade === decade;
      const isOccupied = occupied.has(decade);
      const button = document.createElement("button");
      button.type = "button";
      button.className = `decade ${selected ? "selected" : ""} ${isOccupied ? "occupied" : ""}`.trim();
      button.dataset.action = "guessDecade";
      button.dataset.decade = String(decade);
      button.disabled = isOccupied;
      button.textContent = `${decade}'erne${selected ? " ✓" : isOccupied ? " · Optaget" : ""}`;
      fragment.appendChild(button);
    });
    container.prepend(fragment);
  }

  let scheduled = false;
  function updateUi() {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      updateDuplicateYearSlots();
      updateEarlyDecades();
    });
  }

  new MutationObserver(updateUi).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  updateUi();
})();
