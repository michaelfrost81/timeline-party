(() => {
  "use strict";

  let coordinating = false;

  document.addEventListener("click", (event) => {
    if (coordinating) return;

    const enhanceButton = event.target.closest('[data-enhance="settings"],[data-enhance="stats"],[data-enhance="corrections"]');
    const xpButton = event.target.closest('[data-xp="profile"],[data-xp="history"]');

    if (!enhanceButton && !xpButton) return;

    coordinating = true;
    try {
      if (enhanceButton) {
        const xpClose = document.querySelector('.xp-panel [data-xp="close"]');
        if (xpClose) xpClose.click();
      }

      if (xpButton) {
        const enhanceClose = document.querySelector('.enhance-panel [data-enhance="close"]');
        if (enhanceClose) enhanceClose.click();
      }
    } finally {
      coordinating = false;
    }
  }, true);
})();
