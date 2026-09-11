(() => {
  "use strict";
  const CLIENT_ID = "412f73264b6b4c2c97ed07d67f64622b";
  const REDIRECT_URI = `${location.origin}/callback`;
  const TOKEN_KEY = "timeline-party-spotify-token";
  const VERIFIER_KEY = "timeline-party-spotify-verifier";
  const STATE_KEY = "timeline-party-spotify-state";
  const RETURN_KEY = "timeline-party-spotify-return";
  const YEAR_OVERRIDES_KEY = "timeline-party-hitster-year-overrides";
  const SCOPES = "streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state";

  let player = null;
  let deviceId = null;
  let playerPromise = null;
  let status = "";
  let pendingSong = null;
  let pendingTrack = null;
  let needsManualPlay = false;
  let roundPlaybackActive = false;
  let isPaused = true;
  let positionMs = 0;
  let durationMs = 0;
  let stateUpdatedAt = Date.now();

  const getToken = () => { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch { return null; } };
  const saveToken = (data, old = null) => { const value = { access_token: data.access_token, refresh_token: data.refresh_token || old?.refresh_token || "", expires_at: Date.now() + (Math.max(60, Number(data.expires_in) || 3600) - 30) * 1000 }; localStorage.setItem(TOKEN_KEY, JSON.stringify(value)); return value; };
  const b64url = (bytes) => { let s = ""; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const random = (n) => { const b = new Uint8Array(n); crypto.getRandomValues(b); return b64url(b); };

  function loadYearOverrides() { try { return JSON.parse(localStorage.getItem(YEAR_OVERRIDES_KEY) || "{}"); } catch { return {}; } }
  function applyYearOverrides() {
    const cards = globalThis.HITSTER_DK_CARDS;
    if (!cards) return;
    const overrides = loadYearOverrides();
    Object.entries(overrides).forEach(([key, year]) => {
      if (cards[key] && Number.isInteger(Number(year))) {
        cards[key].year = Number(year);
        cards[key].source = "local-correction";
      }
    });
  }
  function saveYearOverride(cardNumber, year) {
    const key = String(Number(cardNumber)).padStart(5, "0");
    const overrides = loadYearOverrides();
    overrides[key] = Number(year);
    localStorage.setItem(YEAR_OVERRIDES_KEY, JSON.stringify(overrides));
    if (globalThis.HITSTER_DK_CARDS?.[key]) {
      globalThis.HITSTER_DK_CARDS[key].year = Number(year);
      globalThis.HITSTER_DK_CARDS[key].source = "local-correction";
    }
    if (pendingSong && Number(pendingSong.cardNumber) === Number(cardNumber)) pendingSong.year = Number(year);
  }

  async function login() {
    const verifier = random(64), state = random(24), digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
    sessionStorage.setItem(VERIFIER_KEY, verifier); sessionStorage.setItem(STATE_KEY, state); sessionStorage.setItem(RETURN_KEY, "/");
    const query = new URLSearchParams({ client_id: CLIENT_ID, response_type: "code", redirect_uri: REDIRECT_URI, scope: SCOPES, code_challenge_method: "S256", code_challenge: b64url(new Uint8Array(digest)), state });
    location.href = `https://accounts.spotify.com/authorize?${query}`;
  }
  async function refresh(current) {
    if (!current?.refresh_token) throw new Error("Spotify-login er udløbet. Forbind Spotify igen.");
    const body = new URLSearchParams({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: current.refresh_token });
    const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
    if (!r.ok) { localStorage.removeItem(TOKEN_KEY); throw new Error("Spotify-login er udløbet. Forbind Spotify igen."); }
    return saveToken(await r.json(), current).access_token;
  }
  async function accessToken() { const current = getToken(); if (!current?.access_token) throw new Error("Forbind Spotify i spilmenuen først."); return current.expires_at > Date.now() ? current.access_token : refresh(current); }
  async function api(path, options = {}, retry = true, stage = "Spotify") {
    const token = await accessToken();
    const r = await fetch(`https://api.spotify.com/v1${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) } });
    if (r.status === 401 && retry) { await refresh(getToken()); return api(path, options, false, stage); }
    if (!r.ok) { let detail = ""; try { detail = (await r.json())?.error?.message || ""; } catch {} const e = new Error(`${stage} fejlede (${r.status})${detail ? `: ${detail}` : ""}`); e.status = r.status; e.stage = stage; throw e; }
    return r;
  }

  function loadSdk() { if (globalThis.Spotify) return Promise.resolve(); return new Promise((resolve, reject) => { globalThis.onSpotifyWebPlaybackSDKReady = resolve; const s = document.createElement("script"); s.src = "https://sdk.scdn.co/spotify-player.js"; s.async = true; s.onerror = () => reject(new Error("Spotify-afspilleren kunne ikke indlæses.")); document.head.appendChild(s); }); }
  async function ensurePlayer() {
    if (player && deviceId) return deviceId;
    if (playerPromise) return playerPromise;
    playerPromise = (async () => {
      await loadSdk();
      if (!player) {
        player = new Spotify.Player({ name: "Timeline Party", getOAuthToken: async (cb) => { try { cb(await accessToken()); } catch { cb(""); } }, volume: 0.8 });
        player.addListener("ready", ({ device_id }) => { deviceId = device_id; status = "Spotify er klar"; renderControls(); });
        player.addListener("not_ready", () => { deviceId = null; status = "Spotify-afspilleren er offline"; renderControls(); });
        player.addListener("player_state_changed", (state) => {
          if (!state) return;
          positionMs = Number(state.position) || 0;
          durationMs = Number(state.duration) || 0;
          isPaused = Boolean(state.paused);
          stateUpdatedAt = Date.now();
          if (roundPlaybackActive) renderControls();
        });
        player.addListener("autoplay_failed", () => { needsManualPlay = true; status = "iPhone blokerede automatisk afspilning – tryk ▶ Afspil sang"; renderControls(); });
        player.addListener("playback_error", ({ message }) => { needsManualPlay = true; status = `Spotify-afspilning fejlede: ${message || "ukendt fejl"}`; renderControls(); });
        player.addListener("account_error", () => { status = "Spotify Premium er påkrævet"; renderControls(); });
        player.addListener("authentication_error", () => { localStorage.removeItem(TOKEN_KEY); status = "Forbind Spotify igen"; renderControls(); });
        const ok = await player.connect(); if (!ok) throw new Error("Spotify-afspilleren kunne ikke forbindes.");
      }
      const started = Date.now(); while (!deviceId && Date.now() - started < 8000) await new Promise((r) => setTimeout(r, 100));
      if (!deviceId) throw new Error("Spotify-afspilleren blev ikke klar i tide."); return deviceId;
    })();
    try { return await playerPromise; } finally { playerPromise = null; }
  }

  const norm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
  function score(track, song) { const t = norm(track.name), wt = norm(song.title), a = norm(track.artists.map((x) => x.name).join(" ")), wa = norm(song.artist); return (t === wt ? 8 : t.includes(wt) || wt.includes(t) ? 5 : 0) + (a === wa ? 8 : a.includes(wa) || wa.includes(a) ? 5 : 0); }
  async function findTrack(song) {
    const queries = [`track:${song.title} artist:${song.artist}`, `${song.title} ${song.artist}`];
    for (const q of queries) { const data = await (await api(`/search?type=track&limit=10&q=${encodeURIComponent(q)}`, {}, true, "Sangsøgning")).json(); const items = data.tracks?.items || []; if (items.length) return items.sort((a, b) => score(b, song) - score(a, song))[0]; }
    throw new Error("Sangsøgning fejlede: sangen blev ikke fundet på Spotify.");
  }
  async function startExactTrack(track, manual = false) {
    const id = await ensurePlayer();
    if (player?.activateElement) { try { await player.activateElement(); } catch {} }
    if (!manual) await api("/me/player", { method: "PUT", body: JSON.stringify({ device_ids: [id], play: false }) }, true, "Overførsel til Timeline Party-afspilleren");
    await api(`/me/player/play?device_id=${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify({ uris: [track.uri] }) }, true, "Start af sangen");
    needsManualPlay = false;
    roundPlaybackActive = true;
    isPaused = false;
    positionMs = 0;
    durationMs = Number(track.duration_ms) || 0;
    stateUpdatedAt = Date.now();
    status = "Spotify afspiller rundens sang";
    renderControls();
  }
  async function play(song) {
    if (!getToken()) throw new Error("Forbind Spotify i spilmenuen først.");
    applyYearOverrides();
    const key = String(Number(song.cardNumber || 0)).padStart(5, "0");
    pendingSong = globalThis.HITSTER_DK_CARDS?.[key] || song;
    pendingTrack = null;
    needsManualPlay = false;
    roundPlaybackActive = false;
    if (player?.activateElement) { try { await player.activateElement(); } catch {} }
    await ensurePlayer();
    status = "Spotify: finder sangen…"; renderControls();
    pendingTrack = await findTrack(pendingSong);
    status = "Spotify: starter sangen…"; renderControls();
    try { await startExactTrack(pendingTrack, false); }
    catch (e) { needsManualPlay = true; status = `${e.message}. Tryk ▶ Afspil sang.`; renderControls(); throw e; }
  }
  async function manualPlay() {
    if (!pendingTrack && pendingSong) pendingTrack = await findTrack(pendingSong);
    if (!pendingTrack) throw new Error("Der er ingen sang klar til afspilning.");
    status = "Spotify: prøver igen efter dit tryk…"; renderControls();
    try { await startExactTrack(pendingTrack, true); }
    catch (e) { status = e.message; needsManualPlay = true; renderControls(); throw e; }
  }
  async function stopRoundPlayback() {
    if (!player || !roundPlaybackActive) return;
    try { await player.pause(); } catch {}
    roundPlaybackActive = false;
    isPaused = true;
    status = "Musikken er stoppet";
    renderControls();
  }
  async function togglePause() {
    if (!player || !roundPlaybackActive) return;
    if (isPaused) {
      if (player.activateElement) { try { await player.activateElement(); } catch {} }
      await player.resume();
      isPaused = false;
      stateUpdatedAt = Date.now();
      status = "Spotify afspiller rundens sang";
    } else {
      const elapsed = currentPosition();
      await player.pause();
      positionMs = elapsed;
      stateUpdatedAt = Date.now();
      isPaused = true;
      status = "Musikken er sat på pause";
    }
    renderControls();
  }

  function currentPosition() {
    if (isPaused) return positionMs;
    const elapsed = positionMs + (Date.now() - stateUpdatedAt);
    return durationMs ? Math.min(elapsed, durationMs) : elapsed;
  }
  function formatTime(ms) {
    const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function hostMenu() { return document.querySelector('button[data-action="restartGame"]')?.closest("section.game-actions") || null; }
  function renderControls() {
    const menu = hostMenu(); if (!menu) return;
    let box = menu.querySelector("[data-spotify-controls]");
    if (!box) { box = document.createElement("div"); box.dataset.spotifyControls = "1"; const h = menu.querySelector("h2"); h.insertAdjacentElement("afterend", box); }
    const playButton = needsManualPlay && pendingSong ? '<button type="button" class="primary" data-spotify-manual-play>▶ Afspil sang</button>' : "";
    const pauseButton = roundPlaybackActive ? `<button type="button" class="secondary" data-spotify-pause>${isPaused ? "▶ Fortsæt" : "⏸ Pause"}</button>` : "";
    const timer = roundPlaybackActive ? `<p class="hint">Afspillet: <strong>${formatTime(currentPosition())}</strong></p>` : "";
    const correctionButton = pendingSong?.cardNumber ? `<button type="button" class="secondary" data-spotify-correct-year>✏️ Ret årstal for kort ${Number(pendingSong.cardNumber)}</button>` : "";
    const html = `<button type="button" class="secondary" data-spotify-connect>${getToken() ? "🟢 Spotify tilsluttet" : "🎧 Forbind Spotify"}</button>${status ? `<p class="hint">${status}</p>` : ""}${timer}${pauseButton}${playButton}${correctionButton}`;
    if (box.innerHTML !== html) box.innerHTML = html;
  }
  function songForRoundButton(button) {
    applyYearOverrides();
    const dialog = button.closest(".qr-dialog"), cards = globalThis.HITSTER_DK_CARDS, text = dialog?.textContent || "", m = text.match(/Kort\s+(\d+)\s+fundet/i);
    return m && cards ? cards[String(Number(m[1])).padStart(5, "0")] : null;
  }
  function correctPendingYear() {
    if (!pendingSong?.cardNumber) return;
    const currentYear = Number(pendingSong.year) || "";
    const answer = prompt(`Nyt årstal for kort ${Number(pendingSong.cardNumber)}:`, String(currentYear));
    if (answer === null) return;
    const year = Number(answer);
    if (!Number.isInteger(year) || year < 1800 || year > 2100) { alert("Skriv et gyldigt årstal mellem 1800 og 2100."); return; }
    saveYearOverride(pendingSong.cardNumber, year);
    status = `Kort ${Number(pendingSong.cardNumber)} er rettet til ${year} på denne enhed. Rettelsen bruges næste gang kortet scannes.`;
    renderControls();
  }

  async function handleCallback() {
    const p = new URLSearchParams(location.search), code = p.get("code"); if (!code && !p.get("error")) return;
    try { if (p.get("error")) throw new Error("Spotify-login blev annulleret."); if (!sessionStorage.getItem(STATE_KEY) || p.get("state") !== sessionStorage.getItem(STATE_KEY)) throw new Error("Spotify-login kunne ikke valideres."); const body = new URLSearchParams({ client_id: CLIENT_ID, grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI, code_verifier: sessionStorage.getItem(VERIFIER_KEY) || "" }); const r = await fetch("https://accounts.spotify.com/api/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }); if (!r.ok) throw new Error("Spotify afviste login."); saveToken(await r.json()); status = "Spotify er forbundet"; } catch (e) { status = e.message; }
    sessionStorage.removeItem(VERIFIER_KEY); sessionStorage.removeItem(STATE_KEY); history.replaceState({}, "", sessionStorage.getItem(RETURN_KEY) || "/"); sessionStorage.removeItem(RETURN_KEY);
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-spotify-connect]")) { event.preventDefault(); if (!getToken()) login(); else { if (player?.activateElement) try { player.activateElement(); } catch {} ensurePlayer().then(() => { status = "Spotify er klar"; renderControls(); }).catch((e) => { status = e.message; renderControls(); }); } return; }
    if (event.target.closest("[data-spotify-manual-play]")) { event.preventDefault(); if (player?.activateElement) try { player.activateElement(); } catch {} manualPlay().catch((e) => alert(e.message)); return; }
    if (event.target.closest("[data-spotify-pause]")) { event.preventDefault(); togglePause().catch((e) => { status = e.message; renderControls(); }); return; }
    if (event.target.closest("[data-spotify-correct-year]")) { event.preventDefault(); correctPendingYear(); return; }

    const gameButton = event.target.closest("button[data-action]");
    if (gameButton && ["revealSong", "nextSong", "restartGame", "endGame"].includes(gameButton.dataset.action)) stopRoundPlayback();

    const start = event.target.closest('button[data-action="useQrSong"]');
    if (!start) return;
    const song = songForRoundButton(start); if (!song) return;
    if (player?.activateElement) try { player.activateElement(); } catch {}
    play(song).catch((e) => { status = `${e.message}. Tryk ▶ Afspil sang.`; needsManualPlay = true; renderControls(); });
  }, true);

  setInterval(() => { if (roundPlaybackActive && !isPaused) renderControls(); }, 1000);
  new MutationObserver(() => { if (hostMenu() && !document.querySelector("[data-spotify-controls]")) renderControls(); }).observe(document.documentElement, { childList: true, subtree: true });
  applyYearOverrides();
  handleCallback().finally(() => { renderControls(); if (getToken()) ensurePlayer().catch(() => {}); });
})();