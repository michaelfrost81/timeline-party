(() => {
  "use strict";

  const STORAGE_KEY = "timeline-party-apple-music-developer-token";
  const providerApi = () => globalThis.TimelinePartyMusicProviders;
  const isApple = () => providerApi()?.selectedId?.() === "apple";

  function storedToken() {
    return String(localStorage.getItem(STORAGE_KEY) || "").trim();
  }

  const saved = storedToken();
  if (saved && !globalThis.TIMELINE_PARTY_APPLE_MUSIC_TOKEN) {
    globalThis.TIMELINE_PARTY_APPLE_MUSIC_TOKEN = saved;
  }

  function render() {
    const host = document.querySelector("[data-participant-music-sync]");
    if (!host) return;
    let panel = host.querySelector("[data-apple-token-setup]");
    if (!isApple()) {
      if (panel) panel.remove();
      return;
    }

    const configured = Boolean(globalThis.TIMELINE_PARTY_APPLE_MUSIC_TOKEN || globalThis.TimelinePartyAppleMusic?.configured?.());
    if (configured) {
      if (panel) panel.remove();
      return;
    }

    if (!panel) {
      panel = document.createElement("div");
      panel.dataset.appleTokenSetup = "1";
      panel.className = "apple-music-setup";
      host.appendChild(panel);
    }

    panel.innerHTML = `
      <p class="hint"><strong>Apple Music skal aktiveres én gang</strong></p>
      <p class="hint">Timeline Party er klar til MusicKit. Indsæt en gyldig Apple Music developer token på denne testenhed for at aktivere Apple Music-afspilleren.</p>
      <input type="password" autocomplete="off" spellcheck="false" data-apple-token-input placeholder="Apple Music developer token">
      <div class="row">
        <button type="button" class="secondary" data-save-apple-token>Gem og aktivér</button>
        ${storedToken() ? '<button type="button" class="secondary" data-clear-apple-token>Fjern token</button>' : ""}
      </div>
      <p class="hint">Tokenen gemmes kun lokalt i denne browsers lager på testversionen.</p>
    `;
  }

  document.addEventListener("click", (event) => {
    const save = event.target.closest("[data-save-apple-token]");
    if (save) {
      event.preventDefault();
      const input = document.querySelector("[data-apple-token-input]");
      const token = String(input?.value || "").trim();
      if (!token) return;
      localStorage.setItem(STORAGE_KEY, token);
      globalThis.TIMELINE_PARTY_APPLE_MUSIC_TOKEN = token;
      location.reload();
      return;
    }

    const clear = event.target.closest("[data-clear-apple-token]");
    if (clear) {
      event.preventDefault();
      localStorage.removeItem(STORAGE_KEY);
      delete globalThis.TIMELINE_PARTY_APPLE_MUSIC_TOKEN;
      location.reload();
    }
  });

  document.addEventListener("timeline-party-music-provider-change", () => setTimeout(render, 0));
  new MutationObserver(render).observe(document.documentElement, { childList: true, subtree: true });
  render();
})();
