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
  let musicParticipants = [];
  let lastPlaybackReplayKey = "";

  const providers = () => globalThis.TimelinePartyMusicProviders;
  const selectedProvider = () => providers()?.current?.() || { id: "spotify", label: "Spotify", available: true };
  const room = () => String(localStorage.getItem(GAME_CODE_KEY) || "").trim().toUpperCase();
  const playerId = () => localStorage.getItem(PLAYER_ID_KEY) || "";
  const playerName = () => localStorage.getItem(NAME_KEY) || "Spiller";
  const isHostUi = () => Boolean(document.querySelector('button[data-action="restartGame"]'));
  const tokenData = () => { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch { return null; } };

  function providerReady() {
    const current = selectedProvider();
    if (current.id === "spotify") return Boolean(tokenData());
    return Boolean(current.available && current.connected?.());
  }

  function saveToken(data, old = null) {
    const value = { access_token: data.access_token, refresh_token: data.refresh_token || old?.refresh_token || "", expires_at: Date.now() + (Math.max(60, Number(data.expires_in) || 3600) - 30) * 1000 };
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
    const response = await fetch(`https://api.spotify.com/v1${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) } });
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
      const data = await (await spotifyApi("/me/player/devices")).json();
      const devices = data.devices || [];
      const exact = devices.find((device) => device.name === "Timeline Party");
      if (exact?.id) return exact.id;
      const web = devices.find((device) => /timeline party/i.test(device.name || ""));
      if (web?.id) return web.id;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error("Spotify-afspilleren er ikke klar endnu. Tryk på Spotify-knappen og prøv igen.");
  }

  function setStatus(message) { status = message || ""; renderMusicStatus(); }

  function providerLabel(id) {
    return providers()?.providers?.[id]?.label || id || "Ukendt";
  }

  function renderReadiness() {
    if (!isHostUi() || !musicParticipants.length) return "";
    const others = musicParticipants.filter((item) => item.playerId !== playerId());
    if (!others.length) return '<p class="hint">Ingen andre spillere er koblet på musikdelen endnu.</p>';
    const readyCount = others.filter((item) => item.ready).length;
    const rows = others.map((item) => `<span class="music-ready-player">${item.ready ? "🟢" : "🟠"} ${item.name} · ${providerLabel(item.provider)}</span>`).join("");
    return `<div class="music-readiness"><p class="hint"><strong>Musik klar hos ${readyCount}/${others.length} deltagere</strong></p><div class="music-ready-list">${rows}</div></div>`;
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

    const api = providers();
    const current = selectedProvider();
    const choices = (api?.all?.() || []).map((provider) => {
      const active = provider.id === current.id;
      return `<button type="button" class="secondary" data-music-provider="${provider.id}" aria-pressed="${active ? "true" : "false"}">${provider.icon} ${provider.label}${provider.available ? "" : " · snart"}</button>`;
    }).join("");

    let connect = "";
    let helper = current.description || "Vælg den musiktjeneste, du vil bruge på denne enhed.";
    if (current.id === "spotify") {
      const connected = Boolean(tokenData());
      connect = !isHostUi() ? `<button type="button" class="secondary" data-spotify-connect>${connected ? "🟢 Spotify tilsluttet" : "🎧 Forbind Spotify"}</button>` : "";
      helper = connected ? "Spotify er klar til fælles sangafspilning." : "Forbind din egen Spotify Premium-konto for at høre rundens sang på denne enhed.";
    } else if (current.id === "telmore") {
      helper = "Telmore Musik er valgt. Webafspilleren kan åbnes herfra, men fuld automatisk synkronisering er ikke tilgængelig endnu.";
    } else if (!current.available) {
      helper = `${current.label} er gjort klar i strukturen, men selve login og afspilning er ikke aktiveret endnu.`;
    }

    const html = `<div class="music-provider-picker"><p class="hint"><strong>Musiktjeneste på denne enhed</strong></p><div class="music-provider-buttons">${choices}</div></div>${connect}<p class="hint music-sync-hint">${status || helper}</p>${renderReadiness()}`;
    if (box.innerHTML !== html) box.innerHTML = html;
  }

  function ensureSignal() {
    const code = room(); if (!code || !playerId()) return;
    if (!musicSocket) {
      musicSocket = globalThis.io(MUSIC_SIGNAL_URL, { transports: ["websocket", "polling"], reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 800, reconnectionDelayMax: 5000 });
      musicSocket.on("connect", joinSignalRoom);
      musicSocket.on("music:play", handleRemotePlay);
      musicSocket.on("music:state", handleRemoteState);
      musicSocket.on("music:stop", handleRemoteStop);
      musicSocket.on("music:presence", (payload) => {
        musicParticipants = Array.isArray(payload?.participants) ? payload.participants : [];
        renderMusicStatus();
      });
      musicSocket.on("disconnect", () => setStatus("Musiksynkronisering forbinder igen…"));
    }
    if (musicSocket.connected && joinedRoom !== code) joinSignalRoom();
  }

  function replayCurrentPlayback(playback) {
    if (!playback || isHostUi() || playback.senderId === playerId()) return;
    const key = `${room()}|${playback.senderId || ""}|${playback.playing ? "1" : "0"}|${Math.floor(Number(playback.startedAt || playback.changedAt || 0) / 1000)}|${playback.track?.isrc || spotifyUriFrom(playback)}`;
    if (key === lastPlaybackReplayKey) return;
    lastPlaybackReplayKey = key;
    if (playback.playing) {
      setStatus("🔄 Genoptager den aktuelle sang efter genforbindelse…");
      playRemote(playback);
    } else {
      handleRemoteState(playback);
    }
  }

  function joinSignalRoom() {
    const code = room(); if (!musicSocket?.connected || !code) return;
    musicSocket.emit("music:join", {
      room: code,
      playerId: playerId(),
      name: playerName(),
      provider: selectedProvider().id,
      ready: providerReady(),
      isHost: isHostUi()
    }, (result) => {
      if (result?.ok) {
        joinedRoom = code;
        musicParticipants = Array.isArray(result.participants) ? result.participants : musicParticipants;
        renderMusicStatus();
        if (result.playback) setTimeout(() => replayCurrentPlayback(result.playback), 100);
      }
    });
  }

  function reportReadiness() {
    if (!musicSocket?.connected || !joinedRoom) return;
    musicSocket.emit("music:ready", { provider: selectedProvider().id, ready: providerReady() });
  }

  function storePending(command) { pendingCommand = command; try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(command)); } catch {} }
  function clearPending() { pendingCommand = null; try { sessionStorage.removeItem(PENDING_KEY); } catch {} }

  function spotifyUriFrom(command) { return command?.track?.providers?.spotify?.uri || command?.spotifyUri || command?.uri || ""; }

  function dispatchMusicEvent(type, command) {
    document.dispatchEvent(new CustomEvent(`timeline-party-music-${type}`, { detail: command || {} }));
  }

  async function playRemote(command) {
    const current = selectedProvider();
    dispatchMusicEvent("play", command);
    if (!current.available) { storePending(command); setStatus(`🎵 Værten har startet sangen. ${current.label} bliver understøttet i en kommende version.`); return; }
    if (current.id === "telmore") { storePending(command); setStatus("🎵 Værten har startet sangen. Telmore er valgt, men automatisk afspilning kræver stadig en understøttet integration fra Telmore."); return; }
    if (current.id !== "spotify") { storePending(command); setStatus(`⚠️ Afspilning via ${current.label} er endnu ikke implementeret.`); return; }
    const uri = spotifyUriFrom(command);
    if (!uri) { setStatus("⚠️ Rundens sang mangler et Spotify-match."); return; }
    if (!tokenData()) { storePending(command); setStatus("🎵 Værten har startet sangen. Forbind Spotify for at høre den her."); reportReadiness(); return; }

    storePending(command); setStatus("🎵 Gør Spotify klar…");
    try {
      const deviceId = await findTimelinePartyDevice();
      const target = Number(command.startedAt) || Date.now();
      if (target > Date.now() + 150) await new Promise((resolve) => setTimeout(resolve, target - Date.now() - 100));
      const duration = Number(command.track?.durationMs || command.durationMs) || Infinity;
      const position = Math.max(0, Math.min(duration, Date.now() - target));
      await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: "PUT", body: JSON.stringify({ uris: [uri], position_ms: Math.floor(position) }) });
      lastRemoteUri = uri; clearPending();
      setStatus(`🔊 Fælles afspilning er i gang${position > 1200 ? ` · synkroniseret ved ${Math.round(position / 100) / 10} sek.` : ""}`);
      reportReadiness();
    } catch (error) { setStatus(`⚠️ ${error.message}`); reportReadiness(); }
  }

  function handleRemotePlay(command) { if (command.senderId !== playerId()) playRemote(command); }

  async function handleRemoteState(command) {
    if (command.senderId === playerId()) return;
    dispatchMusicEvent("state", command);
    if (selectedProvider().id !== "spotify" || !tokenData()) return;
    try {
      const deviceId = await findTimelinePartyDevice(4000);
      const elapsed = command.playing ? Math.max(0, Date.now() - Number(command.changedAt || Date.now())) : 0;
      const position = Math.max(0, Number(command.positionMs) || 0) + elapsed;
      const uri = spotifyUriFrom(command) || lastRemoteUri;
      if (command.playing && uri) {
        await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, { method: "PUT", body: JSON.stringify({ uris: [uri], position_ms: Math.floor(position) }) });
        setStatus("🔊 Sangafspilningen fortsætter synkroniseret.");
      } else {
        try { await spotifyApi(`/me/player/seek?position_ms=${Math.floor(position)}&device_id=${encodeURIComponent(deviceId)}`, { method: "PUT" }); } catch {}
        await spotifyApi(`/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, { method: "PUT" });
        setStatus("⏸ Værten har sat musikken på pause.");
      }
    } catch (error) { setStatus(`⚠️ ${error.message}`); }
  }

  async function handleRemoteStop(command) {
    if (command?.senderId === playerId()) return;
    dispatchMusicEvent("stop", command);
    clearPending();
    lastPlaybackReplayKey = "";
    if (selectedProvider().id !== "spotify" || !tokenData()) { setStatus("Klar til næste runde."); return; }
    try { const deviceId = await findTimelinePartyDevice(3000); await spotifyApi(`/me/player/pause?device_id=${encodeURIComponent(deviceId)}`, { method: "PUT" }); setStatus("Musikken er stoppet. Klar til næste runde."); }
    catch { setStatus("Klar til næste runde."); }
  }

  async function currentSpotifyState() { const response = await spotifyApi("/me/player"); if (response.status === 204) return null; return response.json(); }

  async function broadcastHostPlaybackWhenReady() {
    if (!isHostUi() || !musicSocket?.connected || !tokenData()) return;
    setStatus("🎵 Synkroniserer sangen til de andre spillere…");
    const started = Date.now();
    while (Date.now() - started < 10000) {
      try {
        const state = await currentSpotifyState();
        const item = state?.item;
        const uri = item?.uri || "";
        if (state?.is_playing && uri && Number.isFinite(state.progress_ms)) {
          const track = {
            isrc: item?.external_ids?.isrc || "",
            durationMs: Number(item?.duration_ms) || 0,
            providers: { spotify: { uri, id: item?.id || "" } }
          };
          const command = { room: room(), track, uri, spotifyUri: uri, durationMs: track.durationMs, startedAt: Date.now() - Number(state.progress_ms || 0) };
          musicSocket.emit("music:play", command);
          dispatchMusicEvent("play", { ...command, senderId: playerId() });
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
      const state = await currentSpotifyState(); if (!state?.item?.uri) return;
      const command = { room: room(), playing: Boolean(state.is_playing), positionMs: Number(state.progress_ms) || 0, changedAt: Date.now(), uri: state.item.uri, spotifyUri: state.item.uri, track: { durationMs: Number(state.item.duration_ms) || 0, isrc: state.item.external_ids?.isrc || "", providers: { spotify: { uri: state.item.uri, id: state.item.id || "" } } } };
      musicSocket.emit("music:state", command);
      dispatchMusicEvent("state", { ...command, senderId: playerId() });
    } catch {}
  }

  document.addEventListener("click", (event) => {
    const providerButton = event.target.closest("[data-music-provider]");
    if (providerButton) {
      event.preventDefault();
      const id = providerButton.dataset.musicProvider;
      providers()?.select?.(id);
      const current = selectedProvider();
      status = current.available ? "" : `${current.label} er valgt, men afspilning er ikke aktiveret endnu.`;
      lastPlaybackReplayKey = "";
      renderMusicStatus();
      if (musicSocket?.connected) joinSignalRoom();
      setTimeout(reportReadiness, 50);
      return;
    }

    const gameButton = event.target.closest("button[data-action]");
    if (gameButton?.dataset.action === "useQrSong") setTimeout(broadcastHostPlaybackWhenReady, 250);
    if (gameButton && ["revealSong", "nextSong", "restartGame", "endGame"].includes(gameButton.dataset.action)) {
      if (isHostUi() && musicSocket?.connected) {
        musicSocket.emit("music:stop", { room: room() });
        dispatchMusicEvent("stop", { senderId: playerId(), at: Date.now() });
      }
    }
    if (event.target.closest("[data-spotify-pause]")) setTimeout(broadcastHostState, 500);
    if (event.target.closest("[data-spotify-manual-play]")) setTimeout(broadcastHostPlaybackWhenReady, 350);
    if (event.target.closest("[data-spotify-connect]")) setTimeout(() => { reportReadiness(); renderMusicStatus(); }, 1800);
  });

  document.addEventListener("timeline-party-music-provider-change", () => { renderMusicStatus(); reportReadiness(); });
  window.addEventListener("storage", (event) => { if (event.key === TOKEN_KEY) { renderMusicStatus(); reportReadiness(); } });

  function restorePending() {
    try { const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null"); if (saved && Date.now() - Number(saved.startedAt || 0) < Math.max(180000, Number(saved.track?.durationMs || saved.durationMs) || 0)) playRemote(saved); } catch {}
  }

  const observer = new MutationObserver(() => { renderMusicStatus(); ensureSignal(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { ensureSignal(); renderMusicStatus(); reportReadiness(); }, 1500);
  ensureSignal(); renderMusicStatus(); setTimeout(restorePending, 1500);
})();
