(() => {
  "use strict";

  const TOKEN_KEY = "timeline-party-spotify-token";
  const CLIENT_ID = "412f73264b6b4c2c97ed07d67f64622b";
  let verificationId = 0;
  let activeCommand = null;
  let monitorTimer = null;

  const selectedSpotify = () => globalThis.TimelinePartyMusicProviders?.selectedId?.() === "spotify";
  const isHostUi = () => Boolean(document.querySelector('button[data-action="restartGame"]'));

  function emitHealth(state, driftMs = null) {
    document.dispatchEvent(new CustomEvent("timeline-party-music-provider-health", {
      detail: { provider: "spotify", state, driftMs }
    }));
  }

  function tokenData() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); }
    catch { return null; }
  }

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
    if (!current?.access_token) throw new Error("Spotify er ikke forbundet.");
    if (Number(current.expires_at) > Date.now()) return current.access_token;
    if (!current.refresh_token) throw new Error("Spotify-login er udløbet.");
    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: current.refresh_token
    });
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error("Spotify-login er udløbet.");
    return saveToken(await response.json(), current).access_token;
  }

  async function spotifyApi(path, options = {}) {
    const token = await accessToken();
    const response = await fetch(`https://api.spotify.com/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (response.status === 204) return null;
    if (!response.ok) throw new Error(`Spotify svarede ${response.status}`);
    return response.json();
  }

  function uriFrom(command = {}) {
    return command?.track?.providers?.spotify?.uri || command.spotifyUri || command.uri || "";
  }

  function expectedPosition(command = {}) {
    const base = Math.max(0, Number(command.positionMs) || 0);
    if (command.playing === false) return base;
    const receivedAt = Number(command.receivedAt) || Date.now();
    return base + Math.max(0, Date.now() - receivedAt);
  }

  async function readPlayback() {
    const state = await spotifyApi("/me/player");
    if (!state?.item?.uri || !Number.isFinite(Number(state.progress_ms))) return null;
    return state;
  }

  async function correctPlayback(command, playback) {
    if (isHostUi()) return false;
    const expectedUri = uriFrom(command);
    const expected = Math.max(0, Math.floor(expectedPosition(command)));
    const deviceId = playback?.device?.id || "";
    if (!deviceId) return false;

    if (expectedUri && playback?.item?.uri !== expectedUri) {
      await spotifyApi(`/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
        method: "PUT",
        body: JSON.stringify({ uris: [expectedUri], position_ms: expected })
      });
      return true;
    }

    await spotifyApi(`/me/player/seek?position_ms=${expected}&device_id=${encodeURIComponent(deviceId)}`, { method: "PUT" });
    return true;
  }

  async function verify(command, id, allowCorrection = true) {
    if (id !== verificationId || !selectedSpotify()) return;
    if (!tokenData()) { emitHealth("warning"); return; }

    try {
      const playback = await readPlayback();
      if (id !== verificationId) return;
      if (!playback) { emitHealth("error"); return; }

      const expectedUri = uriFrom(command);
      const wrongTrack = Boolean(expectedUri && playback.item?.uri !== expectedUri);
      const expected = expectedPosition(command);
      const actual = Math.max(0, Number(playback.progress_ms) || 0);
      const drift = Math.round(actual - expected);

      if (!wrongTrack && Math.abs(drift) <= 750) {
        emitHealth("synced", drift);
        return;
      }

      if (allowCorrection && (wrongTrack || Math.abs(drift) > 1200)) {
        emitHealth("syncing", drift);
        const corrected = await correctPlayback(command, playback);
        if (corrected) {
          await new Promise((resolve) => setTimeout(resolve, 650));
          return verify(command, id, false);
        }
      }

      emitHealth(wrongTrack ? "error" : "warning", drift);
    } catch (error) {
      console.warn("Spotify sync health check failed", error);
      if (id === verificationId) emitHealth("warning");
    }
  }

  function stopMonitor() {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }

  function startMonitor() {
    stopMonitor();
    if (!activeCommand || activeCommand.playing === false) return;
    monitorTimer = setInterval(() => {
      if (!selectedSpotify() || !activeCommand || document.hidden) return;
      verify(activeCommand, verificationId, true);
    }, 8000);
  }

  function schedule(command = {}) {
    if (!selectedSpotify()) return;
    activeCommand = { ...command };
    const id = ++verificationId;
    emitHealth("syncing");
    setTimeout(() => verify(activeCommand, id, true), 1000);
    startMonitor();
  }

  document.addEventListener("timeline-party-music-play", (event) => {
    schedule({ ...(event.detail || {}), playing: true });
  });
  document.addEventListener("timeline-party-music-state", (event) => {
    schedule(event.detail || {});
  });
  document.addEventListener("timeline-party-music-stop", () => {
    verificationId += 1;
    activeCommand = null;
    stopMonitor();
    if (selectedSpotify()) emitHealth("idle", 0);
  });
  document.addEventListener("timeline-party-music-provider-change", () => {
    verificationId += 1;
    activeCommand = null;
    stopMonitor();
    if (selectedSpotify()) emitHealth(tokenData() ? "idle" : "warning");
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && selectedSpotify() && activeCommand?.playing !== false) {
      verify(activeCommand, verificationId, true);
      startMonitor();
    }
  });
})();
