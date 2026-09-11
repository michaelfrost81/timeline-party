(() => {
  "use strict";

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const isSpotifyPlay = url.includes("https://api.spotify.com/v1/me/player/play");

    if (!isSpotifyPlay) return originalFetch(input, init);

    let nextInit = init;
    try {
      const body = init.body ? JSON.parse(init.body) : {};
      body.position_ms = 0;
      nextInit = { ...init, body: JSON.stringify(body) };
    } catch {}

    const response = await originalFetch(input, nextInit);

    if (response.ok) {
      try {
        const deviceMatch = url.match(/[?&]device_id=([^&]+)/);
        const deviceId = deviceMatch ? decodeURIComponent(deviceMatch[1]) : "";
        const seekUrl = `https://api.spotify.com/v1/me/player/seek?position_ms=0${deviceId ? `&device_id=${encodeURIComponent(deviceId)}` : ""}`;
        await originalFetch(seekUrl, {
          method: "PUT",
          headers: { ...(init.headers || {}) }
        });
      } catch {}
    }

    return response;
  };
})();