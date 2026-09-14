(() => {
  "use strict";

  const SIGNAL_URL = "https://timeline-party-video-signal.onrender.com";
  let bypassNextJoin = false;
  let warming = false;
  let suppressTransientUntil = 0;

  const en = () => localStorage.getItem("timeline-party-language") === "en-US";
  const t = (da, us) => en() ? us : da;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  const originalAlert = window.alert.bind(window);
  window.alert = message => {
    const text = String(message || "").trim();
    const transient = text.toLowerCase() === "timeout" || text === "Videoforbindelsen svarede ikke." || text === "The video connection did not respond.";
    if (transient && Date.now() < suppressTransientUntil) return;
    originalAlert(message);
  };

  function setButtonState(button, busy) {
    if (!button) return;
    if (busy) {
      button.dataset.videoOriginalText = button.textContent || "";
      button.disabled = true;
      button.textContent = `⏳ ${t("Forbinder til video…", "Connecting to video…")}`;
    } else {
      button.disabled = false;
      if (button.dataset.videoOriginalText) button.textContent = button.dataset.videoOriginalText;
      delete button.dataset.videoOriginalText;
    }
  }

  async function warmServer(button) {
    if (warming) return false;
    warming = true;
    suppressTransientUntil = Date.now() + 90000;
    setButtonState(button, true);
    const started = Date.now();
    let ok = false;

    while (Date.now() - started < 70000) {
      try {
        const response = await fetch(`${SIGNAL_URL}/?wake=${Date.now()}`, {
          mode: "cors",
          cache: "no-store",
          credentials: "omit"
        });
        if (response.ok) {
          ok = true;
          break;
        }
      } catch {}
      await sleep(2500);
    }

    warming = false;
    setButtonState(button, false);
    return ok;
  }

  document.addEventListener("click", async event => {
    const button = event.target.closest('[data-video-action="join"]');
    if (!button) return;

    if (bypassNextJoin) {
      bypassNextJoin = false;
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const ready = await warmServer(button);
    if (!ready) {
      suppressTransientUntil = 0;
      originalAlert(t(
        "Videoserveren kunne ikke vækkes. Prøv igen om et øjeblik.",
        "The video server could not be reached. Please try again in a moment."
      ));
      return;
    }

    await sleep(1200);
    bypassNextJoin = true;
    button.click();
  }, true);
})();
