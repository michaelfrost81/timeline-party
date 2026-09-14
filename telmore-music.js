(() => {
  "use strict";

  const providerApi = () => globalThis.TimelinePartyMusicProviders;
  const isTelmore = () => providerApi()?.selectedId?.() === "telmore";

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

    panel.innerHTML = `
      <p class="hint"><strong>Telmore Musik · beta</strong></p>
      <p class="hint">Telmore kan afspille musik i browseren, men der er ikke en offentlig afspilnings-API, som Timeline Party kan styre direkte endnu.</p>
      <button type="button" class="secondary" data-open-telmore>🎵 Åbn Telmore Musik</button>
      <p class="hint">Du kan derfor allerede vælge Telmore på denne enhed og åbne webafspilleren direkte. Automatisk start, pause og præcis synkronisering bliver aktiveret, hvis Telmore stiller en understøttet integration til rådighed.</p>
    `;
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-open-telmore]");
    if (!button) return;
    event.preventDefault();
    providerApi()?.openExternal?.("telmore");
  });

  document.addEventListener("timeline-party-music-provider-change", renderTelmoreBridge);
  new MutationObserver(renderTelmoreBridge).observe(document.documentElement, { childList: true, subtree: true });
  renderTelmoreBridge();
})();
