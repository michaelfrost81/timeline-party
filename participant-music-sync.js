(() => {
  "use strict";

  const MUSIC_SIGNAL_URL = "https://timeline-party-music-sync-test.onrender.com";
  const TOKEN_KEY = "timeline-party-spotify-token";
  const GAME_CODE_KEY = "timeline-party-game-code";
  const PLAYER_ID_KEY = "timeline-party-player-id";
  const NAME_KEY = "timeline-party-name";
  const PENDING_KEY = "timeline-party-music-pending";

  let musicSocket = null;
  let joinedRoom = "";
  let status = "";
  let pendingCommand = null;
  let lastRemoteUri = "";
  let lastRemoteStartedAt = 0;

  const room = () => String(localStorage.getItem(GAME_CODE_KEY) || "").trim().toUpperCase();
  const playerId = () => localStorage.getItem(PLAYER_ID_KEY) || "";
  const playerName = () => localStorage.getItem(NAME_KEY) || "Spiller";
  const isHostUi = () => Boolean(document.querySelector('button[data-action="restartGame"]'));
  const tokenData = () => { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch { return null; } };

  function saveToken(data, old = null) {
    const value = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || old?.refresh_token || "",
      expires_at: Date.now() + (Math.max(60, Number(data.expires_in) || 3600) - 30) * 1000
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(value));
    return value;
  }

  async function accessToken() {
    const current = tokenData();
    if (!current?.access_token) throw new Error("Forbind Spotify først.");
    if (current.expires_at > Date.now()) return current.access_token;
    if (!current.refresh_token) throw new Error("Spotify-login er udløbet. Forbind Spotify igen.");
    const body = new URLSearchParams({ client_id: "412f73264b6b4c2c97ed07d67f64622b", grant_type: "refresh_token", refresh_token: current.refresh_token });
    const response = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!response.ok) throw new Error("Spotify-login er udløbet. Forbind Spotify igen.");
    return saveToken(await response.json(), current).access_token;
  }

  async function spotifyApi(path, options = {}, retry = true) {
    const token = await accessToken();
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) }
    });
    if (response.status === 401 && retry) {
      const current = tokenData();
      if (current?.refresh_token) { current.expires_at = 0; localStorage.setItem(TOKEN_KEY, JSON.stringify(current)); }
      await accessToken();
      return spotifyApi(path, options, false);
    }
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json())?.error?.message || ""; } catch {}
      throw new Error(detail || `Spotify svarede ${response.status}`);
    }
    return response;
  }

  async function findTimelinePartyDevice(timeoutMs = 8000) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const data = await (await spotifyApi("/me/player/devices")).json();
        const devices = data.devices || [];
        const exact = devices.find((device) => device.name === "Timeline Party");
        if (exact?.id) return exact.id;
        const web = devices.find((device) => /timeline party/i.test(device.name || ""));
        if (web?.id) return web.id;
      } catch (error) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Spotify-afspilleren er ikke klar endnu. Tryk på Spotify-knappen og prøv igen.");
  }

  function setStatus(message) {
    status = message || "";
    renderMusicStatus();
  }

  function renderMusicStatus() {
    const menu = document.querySelector("section.game-actions");
    if (!menu) return;
    let box = menu.querySelector("[data-participant-music-sync]");
    if (!box) {
      box = document.createElement("div");
      box.dataset.participantMusicSync = "1";
      box.className = "participant-music-sync";
      const heading = menu.querySelector("h2");
      if (heading) heading.insertAdjacentElement("afterend", box); else menu.prepend(box);
    }
    const connected = Boolean(tokenData());
    const participantConnect = !isHostUi() ? `<button type="button" class="secondary" data-spotify-connect>${connected ? "🟢 Spotify tilsluttet" : "🎧 Forbind Spotify"}</button>` : "";
    const helper = connected
      ? "Spotify er klar til fælles sangafspilning."
      : "For at høre rundens sang på denne enhed skal du forbinde din egen Spotify Premium-konto.";
    const html = `${participantConnect}<p class="hint music-sync-hint">${status || helper}</p>`;
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  function ensureSignal() {
    const code = room();
    if (!code || !playerId()) return;
    if (!musicSocket) {
      musicSocket = globalThis.io(MUSIC_SIGNAL_URL, { transports: ["websocket", "polling"], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 800, reconnectionDelayMax: 5000 });
      musicSocket.on("connect", joinSignalRoom);
      musicSocket.on("music:play", handleRemotePlay);
      musicSocket.on("music:state", handleRemoteState);
      musicSocket.on("music:stop", handleRemoteStop);
      musicSocket.on("disconnect", () => setStatus("Musiksynkronisering forbinder igen…"));
    }
    if (musicSocket.connected && joinedRoom !== code) joinSignalRoom();
  }

  function joinSignalRoom() {
    const code = room();
    if (!musicSocket?.connected || !code) return;
    musicSocket.emit("music:join", { room: code, playerId: playerId(), name: playerName() }, (result) => {
      if (result?.ok) { joinedRoom = code; renderMusicStatus(); }
    });
  }

  function storePending(command) {
    pendingCommand = command;
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(command)); } catch {}
  }
  function clearPending() {
    pendingCommand = null;
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
  }

  async function playRemote(command) {
    if (!command?.uri) return;
    if (!tokenData()) {
      storePending(command);
      setStatus("🎵 Værten har startet sangen. Forbind Spotify for at høre den her.");
      return;
    }
    storePending(command);
    setStatus("🎵 Gør Spotify klar…");
    try {
      const deviceId = await findTimelinePartyDevice();
      const target = Number(command.startedAt) || Date.now();
      if (target > Date.now() + 150) await new Promise((resolve) => setTimeout(resolve, target - Date.now() - 100));
      const position = Math.max(0, Math.min(Number(command.durationMs) || Infinity, Date.now() - target));
      await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
        method: "PUT",
        body: JSON.stringify({ uris: [command.uri], position_ms: Math.floor(position) })
      });
      lastRemoteUri = command.uri;
      lastRemoteStartedAt = target;
      clearPending();
      setStatus(`🔊 Fælles afspilning er i gang${position > 1200 ? ` · synkroniseret ved ${Math.round(position / 100) / 10} sek.` : ""}`);
    } catch (error) {
      setStatus(`⚠️ ${error.message}`);
    }
  }

  function handleRemotePlay(command) {
    if (command.senderId === playerId()) return;
    playRemote(command);
  }

  async function handleRemoteState(command) {
    if (command.senderId === playerId() || !tokenData()) return;
    try {
      const deviceId = await findTimelinePartyDevice(4000);
      const elapsed = command.playing ? Math.max(0, Date.now() - Number(command.changedAt || Date.now())) : 0;
      const position = Math.max(0, Number(command.positionMs) || 0) + elapsed;
      if (command.playing && (command.uri || lastRemoteUri)) {
        await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: "PUT", body: JSON.stringify({ uris: [command.uri || lastRemoteUri], position_ms: Math.floor(position) }) });
        setStatus("🔊 Sangafspilningen fortsætter synkroniseret.");
      } else {
        try { await spotifyApi(`/me/player/seek?position_ms=${Math.floor(position)}&device_id=${encodeURIComponent(deviceId)}`, { method: "PUT" }); } catch {}
        await spotifyApi(`/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, { method: "PUT" });
        setStatus("⏸ Værten har sat musikken på pause.");
      }
    } catch (error) { setStatus(`⚠️ ${error.message}`); }
  }

  async function handleRemoteStop(command) {
    if (command?.senderId === playerId() || !tokenData()) return;
    clearPending();
    try {
      const deviceId = await findTimelinePartyDevice(3000);
      await spotifyApi(`/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, { method: "PUT" });
      setStatus("Musikken er stoppet. Klar til næste runde.");
    } catch { setStatus("Klar til næste runde."); }
  }

  async function currentSpotifyState() {
    const response = await spotifyApi("/me/player");
    if (response.status === 204) return null;
    return response.json();
  }

  async function broadcastHostPlaybackWhenReady() {
    if (!isHostUi() || !musicSocket?.connected || !tokenData()) return;
    setStatus("🎵 Synkroniserer sangen til de andre spillere…");
    const started = Date.now();
    while (Date.now() - started < 10000) {
      try {
        const state = await currentSpotifyState();
        const uri = state?.item?.uri || "";
        if (state?.is_playing && uri && Number.isFinite(state.progress_ms)) {
          musicSocket.emit("music:play", {
            room: room(), uri, durationMs: Number(state.item?.duration_ms) || 0,
            startedAt: Date.now() - Number(state.progress_ms || 0)
          });
          setStatus("🔊 Sangen sendes synkroniseret til de tilsluttede spillere.");
          return;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    setStatus("⚠️ Kunne ikke synkronisere sangen automatisk. Værten kan stadig afspille lokalt.");
  }

  async function broadcastHostState() {
    if (!isHostUi() || !musicSocket?.connected || !tokenData()) return;
    try {
      const state = await currentSpotifyState();
      if (!state?.item?.uri) return;
      musicSocket.emit("music:state", {
        room: room(), playing: Boolean(state.is_playing), positionMs: Number(state.progress_ms) || 0,
        changedAt: Date.now(), uri: state.item.uri
      });
    } catch {}
  }

  document.addEventListener("click", (event) => {
    const gameButton = event.target.closest("button[data-action]");
    if (gameButton?.dataset.action === "useQrSong") setTimeout(broadcastHostPlaybackWhenReady, 250);
    if (gameButton && ["revealSong", "nextSong", "restartGame", "endGame"].includes(gameButton.dataset.action)) {
      if (isHostUi() && musicSocket?.connected) musicSocket.emit("music:stop", { room: room() });
    }
    if (event.target.closest("[data-spotify-pause]")) setTimeout(broadcastHostState, 500);
    if (event.target.closest("[data-spotify-manual-play]")) setTimeout(broadcastHostPlaybackWhenReady, 350);
  });

  function restorePending() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
      if (saved?.uri && Date.now() - Number(saved.startedAt || 0) < Math.max(180000, Number(saved.durationMs) || 0)) playRemote(saved);
    } catch {}
  }

  const observer = new MutationObserver(() => { renderMusicStatus(); ensureSignal(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { ensureSignal(); renderMusicStatus(); }, 1500);
  ensureSignal();
  renderMusicStatus();
  setTimeout(restorePending, 1500);
})();
