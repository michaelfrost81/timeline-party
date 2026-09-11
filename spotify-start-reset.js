(() => {
  "use strict";

  const originalFetch = globalThis.fetch.bind(globalThis);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function seekWhenTrackIsActive(trackUri, deviceId, headers) {
    if (!trackUri) return;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const stateResponse = await originalFetch("https://api.spotify.com/v1/me/player", {
          headers: { ...(headers || {}) }
        });

        if (stateResponse.ok && stateResponse.status !== 204) {
          const state = await stateResponse.json();
          if (state?.item?.uri === trackUri) {
            const seekUrl = `https://api.spotify.com/v1/me/player/seek?position_ms=0${deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ""}`;
            await originalFetch(seekUrl, {
              method: "PUT",
              headers: { ...(headers || {}) }
            });
            return;
          }
        }
      } catch {}

      await sleep(125);
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
      try {
        const deviceMatch = url.match(/[?&]device_id=([^&]+)/);
        const deviceId = deviceMatch ? decodeURIComponent(deviceMatch[1]) : "";
        await seekWhenTrackIsActive(trackUri, deviceId, init.headers);
      } catch {}
    }

    return response;
  };
})();