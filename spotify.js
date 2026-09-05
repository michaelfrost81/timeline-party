(() => {
  "use strict";

  const CLIENT_ID = "d350b7eda54a4ba4abc40f61d773608d";
  const REDIRECT_URI = "https://timeline-party.onrender.com/callback";
  const SCOPES = [
    "streaming",
    "user-read-email",
    "user-read-private",
    "user-read-playback-state",
    "user-modify-playback-state"
  ];

  const TOKEN_KEY = "timeline-party-spotify-token";
  const VERIFIER_KEY = "timeline-party-spotify-verifier";
  const STATE_KEY = "timeline-party-spotify-state";
  const RETURN_KEY = "timeline-party-spotify-return";

  let player = null;
  let deviceId = null;
  let sdkReady = false;
  let playerConnecting = null;
  let statusMessage = "";

  function tokenData() {
    try {
      return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null");
    } catch {
      return null;
    }
  }

  function saveToken(data, previous = null) {
    const expiresIn = Number(data.expires_in) || 3600;
    const next = {
      access_token: data.access_token,
      refresh_token: data.refresh_token || (previous && previous.refresh_token) || "",
      expires_at: Date.now() + Math.max(60, expiresIn - 60) * 1000
    };
    localStorage.setItem(TOKEN_KEY, JSON.stringify(next));
    return next;
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    deviceId = null;
    if (player) {
      try { player.disconnect(); } catch {}
    }
    player = null;
    playerConnecting = null;
  }

  function randomString(length = 64) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => (byte % 36).toString(36)).join("");
  }

  function base64Url(bytes) {
    let binary = "";
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  async function challenge(verifier) {
    const encoded = new TextEncoder().encode(verifier);
    return base64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoded)));
  }

  async function connectSpotify() {
    try {
      if (!crypto || !crypto.subtle) throw new Error("PKCE er ikke tilgængelig i denne browser.");
      const verifier = randomString(72);
      const state = randomString(28);
      sessionStorage.setItem(VERIFIER_KEY, verifier);
      sessionStorage.setItem(STATE_KEY, state);
      sessionStorage.setItem(RETURN_KEY, location.pathname === "/callback" || location.pathname === "/callback/" ? "/" : location.pathname + location.search);

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: SCOPES.join(" "),
        code_challenge_method: "S256",
        code_challenge: await challenge(verifier),
        state
      });
      location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
    } catch (error) {
      alert(`Spotify-login kunne ikke startes. ${error.message || "Prøv igen."}`);
    }
  }

  async function exchangeCode(code) {
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!verifier) throw new Error("Login-sessionen er udløbet. Forbind Spotify igen.");

    const body = new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier
    });
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    });
    if (!response.ok) throw new Error("Spotify afviste login-koden.");
    saveToken(await response.json());
  }

  async function refreshToken(current) {
    if (!current || !current.refresh_token) throw new Error("Spotify-login er udløbet.");
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
    if (!response.ok) {
      clearToken();
      throw new Error("Spotify-login er udløbet. Forbind Spotify igen.");
    }
    return saveToken(await response.json(), current).access_token;
  }

  async function accessToken() {
    const current = tokenData();
    if (!current || !current.access_token) throw new Error("Spotify er ikke forbundet.");
    if (current.expires_at > Date.now()) return current.access_token;
    return refreshToken(current);
  }

  async function spotifyFetch(path, options = {}) {
    let token = await accessToken();
    let response = await fetch(`https://api.spotify.com/v1${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });
    if (response.status === 401) {
      token = await refreshToken(tokenData());
      response = await fetch(`https://api.spotify.com/v1${path}`, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          ...(options.headers || {})
        }
      });
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      const error = new Error(`Spotify svarede ${response.status}.`);
      error.status = response.status;
      error.details = text;
      throw error;
    }
    return response;
  }

  function loadSdk() {
    if (globalThis.Spotify) {
      sdkReady = true;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-timeline-spotify-sdk]');
      const previousReady = globalThis.onSpotifyWebPlaybackSDKReady;
      globalThis.onSpotifyWebPlaybackSDKReady = () => {
        sdkReady = true;
        if (typeof previousReady === "function") previousReady();
        resolve();
      };
      if (existing) {
        if (globalThis.Spotify) resolve();
        return;
      }
      const script = document.createElement("script");
      script.src = "https://sdk.scdn.co/spotify-player.js";
      script.async = true;
      script.dataset.timelineSpotifySdk = "true";
      script.onerror = () => reject(new Error("Spotify-afspilleren kunne ikke indlæses."));
      document.head.appendChild(script);
    });
  }

  async function ensurePlayer() {
    if (!tokenData()) throw new Error("Spotify er ikke forbundet.");
    if (player && deviceId) return deviceId;
    if (playerConnecting) return playerConnecting;

    playerConnecting = (async () => {
      await loadSdk();
      if (!sdkReady && !globalThis.Spotify) throw new Error("Spotify-afspilleren er ikke klar endnu.");
      if (!player) {
        player = new Spotify.Player({
          name: "Timeline Party",
          getOAuthToken: async (callback) => {
            try { callback(await accessToken()); } catch { callback(""); }
          },
          volume: 0.8
        });

        player.addListener("ready", ({ device_id }) => {
          deviceId = device_id;
          statusMessage = "Spotify er klar";
          refreshSpotifyUi();
        });
        player.addListener("not_ready", () => {
          deviceId = null;
          statusMessage = "Spotify-afspilleren er midlertidigt offline";
          refreshSpotifyUi();
        });
        player.addListener("authentication_error", () => {
          statusMessage = "Spotify-login skal fornyes";
          clearToken();
          refreshSpotifyUi();
        });
        player.addListener("account_error", () => {
          statusMessage = "Spotify Premium er påkrævet";
          refreshSpotifyUi();
        });
        player.addListener("initialization_error", ({ message }) => {
          statusMessage = message || "Spotify-afspilleren kunne ikke startes";
          refreshSpotifyUi();
        });
        player.addListener("playback_error", () => {
          statusMessage = "Spotify kunne ikke afspille sangen";
          refreshSpotifyUi();
        });

        const connected = await player.connect();
        if (!connected) throw new Error("Spotify-afspilleren kunne ikke forbindes.");
      }

      const started = Date.now();
      while (!deviceId && Date.now() - started < 8000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!deviceId) throw new Error("Spotify-afspilleren blev ikke klar i tide.");
      return deviceId;
    })();

    try {
      return await playerConnecting;
    } finally {
      playerConnecting = null;
    }
  }

  function normalize(text) {
    return String(text || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function scoreTrack(track, song) {
    const wantedTitle = normalize(song.title);
    const wantedArtist = normalize(song.artist);
    const title = normalize(track.name);
    const artists = normalize((track.artists || []).map((artist) => artist.name).join(" "));
    let score = 0;
    if (title === wantedTitle) score += 8;
    else if (title.includes(wantedTitle) || wantedTitle.includes(title)) score += 5;
    if (artists === wantedArtist) score += 8;
    else if (artists.includes(wantedArtist) || wantedArtist.includes(artists)) score += 5;
    return score;
  }

  async function findTrack(song) {
    const precise = `track:${song.title} artist:${song.artist}`;
    let response = await spotifyFetch(`/search?type=track&limit=10&q=${encodeURIComponent(precise)}`);
    let data = await response.json();
    let items = data.tracks && data.tracks.items ? data.tracks.items : [];

    if (!items.length) {
      response = await spotifyFetch(`/search?type=track&limit=10&q=${encodeURIComponent(`${song.title} ${song.artist}`)}`);
      data = await response.json();
      items = data.tracks && data.tracks.items ? data.tracks.items : [];
    }
    if (!items.length) throw new Error("Sangen blev ikke fundet på Spotify.");
    return items.sort((a, b) => scoreTrack(b, song) - scoreTrack(a, song))[0];
  }

  async function playSong(song) {
    if (!tokenData()) throw new Error("Forbind Spotify i spilmenuen først.");
    if (player && typeof player.activateElement === "function") {
      try { await player.activateElement(); } catch {}
    }
    const id = await ensurePlayer();
    const track = await findTrack(song);

    await spotifyFetch("/me/player", {
      method: "PUT",
      body: JSON.stringify({ device_ids: [id], play: false })
    });
    await spotifyFetch(`/me/player/play?device_id=${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify({ uris: [track.uri] })
    });
    statusMessage = "Spotify afspiller rundens sang";
    refreshSpotifyUi();
  }

  function isHostView() {
    return Boolean(document.querySelector('button[data-action="restartGame"]'));
  }

  function spotifyButtonHtml() {
    const connected = Boolean(tokenData());
    const label = connected ? "🟢 Spotify tilsluttet" : "🎧 Forbind Spotify";
    return `<button type="button" class="secondary" data-spotify-action="connect">${label}</button>${statusMessage ? `<p class="hint spotify-status">${statusMessage}</p>` : ""}`;
  }

  function refreshSpotifyUi() {
    document.querySelectorAll("[data-spotify-controls]").forEach((node) => node.remove());
    if (!isHostView()) return;
    const menu = document.querySelector("section.game-actions");
    if (!menu) return;
    const wrapper = document.createElement("div");
    wrapper.dataset.spotifyControls = "true";
    wrapper.innerHTML = spotifyButtonHtml();
    const heading = menu.querySelector("h2");
    if (heading && heading.nextSibling) menu.insertBefore(wrapper, heading.nextSibling);
    else menu.appendChild(wrapper);
  }

  function cardFromQrDialog(button) {
    const dialog = button.closest(".qr-dialog");
    if (!dialog || !globalThis.HITSTER_DK_CARDS) return null;
    const strong = Array.from(dialog.querySelectorAll("strong")).find((node) => /^Kort\s+\d+\s+fundet/i.test(node.textContent.trim()));
    if (!strong) return null;
    const match = strong.textContent.match(/Kort\s+(\d+)/i);
    if (!match) return null;
    return globalThis.HITSTER_DK_CARDS[String(Number(match[1])).padStart(5, "0")] || null;
  }

  async function handleCallback() {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const error = params.get("error");
    if (!code && !error) return;

    const expectedState = sessionStorage.getItem(STATE_KEY);
    if (error) {
      statusMessage = "Spotify-login blev annulleret";
    } else if (!expectedState || params.get("state") !== expectedState) {
      statusMessage = "Spotify-login kunne ikke valideres";
    } else {
      try {
        await exchangeCode(code);
        statusMessage = "Spotify er forbundet";
      } catch (exchangeError) {
        statusMessage = exchangeError.message || "Spotify-login mislykkedes";
      }
    }

    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
    const returnTo = sessionStorage.getItem(RETURN_KEY) || "/";
    sessionStorage.removeItem(RETURN_KEY);
    history.replaceState({}, "", returnTo);
    refreshSpotifyUi();
    if (tokenData()) ensurePlayer().catch(() => {});
  }

  document.addEventListener("click", (event) => {
    const spotifyButton = event.target.closest('[data-spotify-action="connect"]');
    if (spotifyButton) {
      event.preventDefault();
      if (tokenData()) {
        if (player && typeof player.activateElement === "function") {
          try { player.activateElement(); } catch {}
        }
        statusMessage = "Spotify er allerede forbundet";
        ensurePlayer().then(refreshSpotifyUi).catch((error) => {
          statusMessage = error.message;
          refreshSpotifyUi();
        });
      } else {
        connectSpotify();
      }
      return;
    }

    const roundButton = event.target.closest('button[data-action="useQrSong"]');
    if (!roundButton) return;
    const song = cardFromQrDialog(roundButton);
    if (!song) return;

    if (player && typeof player.activateElement === "function") {
      try { player.activateElement(); } catch {}
    }
    playSong(song).catch((error) => {
      statusMessage = error.message || "Spotify kunne ikke starte sangen.";
      refreshSpotifyUi();
      alert(`${statusMessage}\n\nRunden er stadig startet, så du kan fortsætte spillet eller prøve Spotify igen.`);
    });
  }, true);

  const observer = new MutationObserver(() => refreshSpotifyUi());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  handleCallback().finally(() => {
    refreshSpotifyUi();
    if (tokenData()) ensurePlayer().catch(() => {});
  });
})();