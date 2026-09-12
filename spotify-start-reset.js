(() => {
  "use strict";

  const originalFetch = globalThis.fetch.bind(globalThis);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function getPlayerState(headers) {
    try {
      const response = await originalFetch("https://api.spotify.com/v1/me/player", {
        headers: { ...(headers || {}) }
      });
      if (!response.ok || response.status === 204) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function seekToStart(deviceId, headers) {
    const seekUrl = `https://api.spotify.com/v1/me/player/seek?position_ms=0${deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ""}`;
    try {
      await originalFetch(seekUrl, {
        method: "PUT",
        headers: { ...(headers || {}) }
      });
    } catch {}
  }

  async function verifyStillNearStart(trackUri, deviceId, headers) {
    for (const delay of [500, 900, 1400]) {
      await sleep(delay);
      const state = await getPlayerState(headers);
      if (!state || state.item?.uri !== trackUri) continue;
      const progress = Number(state.progress_ms || 0);
      if (progress > 3500) {
        await seekToStart(deviceId, headers);
        await sleep(180);
      }
    }
  }

  async function forceTrackToStart(trackUri, deviceId, headers) {
    if (!trackUri) return;

    // Spotify can acknowledge play before the new track is actually active,
    // especially on iPhone. Wait for the requested track, then seek repeatedly
    // until the reported position is close to zero.
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const state = await getPlayerState(headers);
      if (state?.item?.uri === trackUri) {
        await seekToStart(deviceId, headers);
        await sleep(180);
        const verified = await getPlayerState(headers);
        if (verified?.item?.uri === trackUri && Number(verified.progress_ms || 0) < 2500) {
          // iOS can briefly report the correct position and then jump back to the
          // previous playback offset. Re-check a few times after the track switch.
          await verifyStillNearStart(trackUri, deviceId, headers);
          return;
        }
        await seekToStart(deviceId, headers);
      }
      await sleep(150);
    }
  }

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const isSpotifyPlay = url.includes("https://api.spotify.com/v1/me/player/play");

    if (!isSpotifyPlay) return originalFetch(input, init);

    let nextInit = init;
    let trackUri = "";
    try {
      const body = init.body ? JSON.parse(init.body) : {};
      body.position_ms = 0;
      trackUri = Array.isArray(body.uris) ? body.uris[0] || "" : "";
      nextInit = { ...init, body: JSON.stringify(body) };
    } catch {}

    const response = await originalFetch(input, nextInit);

    if (response.ok) {
      const deviceMatch = url.match(/[?&]device_id=([^&]+)/);
      const deviceId = deviceMatch ? decodeURIComponent(deviceMatch[1]) : "";
      await forceTrackToStart(trackUri, deviceId, init.headers);
    }

    return response;
  };
})();
