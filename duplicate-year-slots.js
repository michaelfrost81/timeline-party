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

        if (!blockedByDuplicateYear) return;

        button.disabled = true;
        button.classList.add("occupied");
        button.classList.remove("selected");
        button.textContent = "Ikke mulig";
        button.setAttribute("aria-label", `Kan ikke placeres mellem to sange fra ${years[slot]}`);
      });
    });
  }

  new MutationObserver(updateDuplicateYearSlots).observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  updateDuplicateYearSlots();
})();
