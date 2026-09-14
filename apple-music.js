(() => {
  "use strict";

  const SCRIPT_URL = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
  const TOKEN_META = "apple-music-developer-token";
  let music = null;
  let developerToken = "";
  let configured = false;
  let authorized = false;
  let initPromise = null;

  const providerApi = () => globalThis.TimelinePartyMusicProviders;
  const isSelected = () => providerApi()?.selectedId?.() === "apple";

  function setProviderState() {
    const provider = providerApi()?.providers?.apple;
    if (!provider) return;
    provider.available = Boolean(configured);
    provider.connected = () => Boolean(configured && authorized);
    provider.description = configured ? "Apple Music · direkte afspilning i Timeline Party" : "Apple Music · kræver MusicKit-opsætning for Timeline Party";
    document.dispatchEvent(new CustomEvent("timeline-party-music-provider-change", { detail: { provider: "apple" } }));
  }

  function loadScript() {
    if (globalThis.MusicKit) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${SCRIPT_URL}"]`);
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", reject, { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = SCRIPT_URL;
      script.defer = true;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Kunne ikke hente Apple Music-afspilleren."));
      document.head.appendChild(script);
    });
  }

  async function getDeveloperToken() {
    const meta = document.querySelector(`meta[name="${TOKEN_META}"]`)?.content?.trim();
    if (meta) return meta;
    if (globalThis.TIMELINE_PARTY_APPLE_MUSIC_TOKEN) return String(globalThis.TIMELINE_PARTY_APPLE_MUSIC_TOKEN);
    try {
      const response = await fetch("/api/apple-music-token", { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) return "";
      const type = response.headers.get("content-type") || "";
      if (type.includes("application/json")) return String((await response.json())?.token || "").trim();
      return String(await response.text()).trim();
    } catch { return ""; }
  }

  async function init() {
    if (configured && music) return music;
    if (initPromise) return initPromise;
    initPromise = (async () => {
      developerToken = await getDeveloperToken();
      if (!developerToken) { configured = false; setProviderState(); return null; }
      await loadScript();
      const MusicKit = globalThis.MusicKit;
      if (!MusicKit) throw new Error("Apple Music kunne ikke initialiseres.");
      MusicKit.configure({ developerToken, app: { name: "Timeline Party", build: "1.0" } });
      music = MusicKit.getInstance();
      configured = true;
      authorized = Boolean(music?.isAuthorized);
      setProviderState();
      return music;
    })().catch((error) => {
      console.warn("Apple Music init failed", error);
      configured = false;
      setProviderState();
      return null;
    }).finally(() => { initPromise = null; });
    return initPromise;
  }

  async function connect() {
    const instance = await init();
    if (!instance) throw new Error("Apple Music er ikke konfigureret på Timeline Party endnu.");
    await instance.authorize();
    authorized = Boolean(instance.isAuthorized);
    setProviderState();
    return authorized;
  }

  async function storefront() {
    const instance = await init();
    return String(instance?.storefrontId || "dk").toLowerCase();
  }

  async function resolveAppleSong(track = {}) {
    const directId = track?.providers?.apple?.id;
    if (directId) return String(directId);
    const isrc = String(track?.isrc || "").trim();
    if (!isrc || !developerToken) return "";
    const store = await storefront();
    const url = `https://api.music.apple.com/v1/catalog/${encodeURIComponent(store)}/songs?filter[isrc]=${encodeURIComponent(isrc)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${developerToken}` } });
    if (!response.ok) return "";
    const data = await response.json();
    return String(data?.data?.[0]?.id || "");
  }

  async function seekTo(positionMs) {
    const seconds = Math.max(0, Number(positionMs) || 0) / 1000;
    if (!music?.player) return;
    if (typeof music.player.seekToTime === "function") await music.player.seekToTime(seconds);
    else { try { music.player.currentPlaybackTime = seconds; } catch {} }
  }

  function positionFor(command = {}) {
    const base = Number(command.positionMs);
    if (Number.isFinite(base)) return Math.max(0, base + Math.max(0, Date.now() - Number(command.receivedAt || Date.now())));
    return Math.max(0, Date.now() - Number(command.startedAt || Date.now()));
  }

  async function playCommand(command = {}) {
    if (!isSelected()) return;
    const instance = await init();
    if (!instance || !configured || !instance.isAuthorized) return;
    authorized = true;
    const songId = await resolveAppleSong(command.track || {});
    if (!songId) throw new Error("Kunne ikke matche rundens sang i Apple Music.");
    const positionMs = positionFor(command);
    await instance.setQueue({ song: songId });
    await instance.play();
    if (positionMs > 250) await seekTo(positionMs);
  }

  async function stateCommand(command = {}) {
    if (!isSelected() || !music?.isAuthorized) return;
    const positionMs = command.playing ? positionFor(command) : Math.max(0, Number(command.positionMs) || 0);
    if (command.playing) {
      const songId = await resolveAppleSong(command.track || {});
      if (songId) await music.setQueue({ song: songId });
      await music.play();
      await seekTo(positionMs);
    } else {
      await seekTo(positionMs);
      music.pause();
    }
  }

  function stopCommand() {
    if (!isSelected() || !music) return;
    try { music.pause(); } catch {}
  }

  function renderConnectButton() {
    const host = document.querySelector("[data-participant-music-sync]");
    if (!host || !isSelected()) return;
    let button = host.querySelector("[data-apple-connect]");
    if (!configured) return;
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.dataset.appleConnect = "1";
      const hint = host.querySelector(".music-sync-hint");
      if (hint) hint.insertAdjacentElement("beforebegin", button); else host.appendChild(button);
    }
    button.textContent = authorized || music?.isAuthorized ? "🟢 Apple Music tilsluttet" : "🍎 Forbind Apple Music";
  }

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-apple-connect]");
    if (!button) return;
    event.preventDefault();
    button.disabled = true;
    try {
      await connect();
      renderConnectButton();
      document.dispatchEvent(new CustomEvent("timeline-party-music-provider-change", { detail: { provider: "apple" } }));
    } catch (error) { alert(error.message || "Kunne ikke forbinde Apple Music."); }
    finally { button.disabled = false; }
  });

  document.addEventListener("timeline-party-music-play", (event) => playCommand(event.detail).catch((error) => console.warn("Apple Music play failed", error)));
  document.addEventListener("timeline-party-music-state", (event) => stateCommand(event.detail).catch((error) => console.warn("Apple Music sync failed", error)));
  document.addEventListener("timeline-party-music-stop", stopCommand);
  document.addEventListener("timeline-party-music-provider-change", () => setTimeout(renderConnectButton, 0));
  new MutationObserver(renderConnectButton).observe(document.documentElement, { childList: true, subtree: true });

  globalThis.TimelinePartyAppleMusic = { init, connect, connected: () => Boolean(configured && (authorized || music?.isAuthorized)), configured: () => configured };
  init();
})();
