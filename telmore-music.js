(() => {
  "use strict";

  const providerApi = () => globalThis.TimelinePartyMusicProviders;
  const isTelmore = () => providerApi()?.selectedId?.() === "telmore";

  function emitHealth(state) {
    document.dispatchEvent(new CustomEvent("timeline-party-music-provider-health", {
      detail: { provider: "telmore", state, driftMs: null }
    }));
  }

  function renderTelmoreBridge() {
    const host = document.querySelector("[data-participant-music-sync]");
    if (!host) return;

    let panel = host.querySelector("[data-telmore-music]");
    if (!isTelmore()) {
      if (panel) panel.remove();
      return;
    }

    if (!panel) {
      panel = document.createElement("div");
      panel.dataset.telmoreMusic = "1";
      panel.className = "telmore-music-beta";
      host.appendChild(panel);
    }

    const html = `
      <p class="hint"><strong>Telmore Musik · beta</strong></p>
      <p class="hint">Telmore kan afspille musik i browseren, men der er ikke en offentlig afspilnings-API, som Timeline Party kan styre direkte endnu.</p>
      <button type="button" class="secondary" data-open-telmore>🎵 Åbn Telmore Musik</button>
      <p class="hint">Du kan bruge Telmores webafspiller ved siden af spillet. Timeline Party afslører ikke sangtitel eller kunstner før svaret, så den manuelle løsning giver ikke svaret væk.</p>
    `;
    if (panel.innerHTML !== html) panel.innerHTML = html;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-telmore]");
    if (!button) return;
    event.preventDefault();
    const opened = providerApi()?.openExternal?.("telmore");
    emitHealth(opened ? "warning" : "error");
  });

  document.addEventListener("timeline-party-music-provider-change", () => {
    renderTelmoreBridge();
    if (isTelmore()) emitHealth("warning");
  });
  document.addEventListener("timeline-party-music-play", () => {
    if (isTelmore()) emitHealth("warning");
  });
  document.addEventListener("timeline-party-music-stop", () => {
    if (isTelmore()) emitHealth("idle");
  });

  const observer = new MutationObserver(() => {
    if (!document.querySelector("[data-participant-music-sync]")) return;
    renderTelmoreBridge();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  renderTelmoreBridge();
})();
