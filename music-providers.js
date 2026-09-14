(() => {
  "use strict";

  const PROVIDER_KEY = "timeline-party-music-provider";
  const spotifyToken = () => { try { return JSON.parse(localStorage.getItem("timeline-party-spotify-token") || "null"); } catch { return null; } };

  const providers = {
    spotify: {
      id: "spotify",
      label: "Spotify",
      icon: "🎧",
      available: true,
      mode: "embedded",
      connected: () => Boolean(spotifyToken()),
      description: "Spotify Premium · direkte afspilning i Timeline Party"
    },
    apple: {
      id: "apple",
      label: "Apple Music",
      icon: "🍎",
      available: false,
      mode: "embedded",
      connected: () => Boolean(globalThis.TimelinePartyAppleMusic?.connected?.()),
      description: "Apple Music · MusicKit-integration er klargjort og aktiveres, når udviklertoken er konfigureret"
    },
    telmore: {
      id: "telmore",
      label: "Telmore Musik",
      icon: "🎵",
      available: true,
      beta: true,
      mode: "external",
      externalUrl: "https://musik.telmore.dk",
      connected: () => false,
      description: "Telmore Musik · beta via Telmores webafspiller. Automatisk styring kræver en officiel afspilningsintegration fra Telmore."
    },
    youtube: {
      id: "youtube",
      label: "YouTube",
      icon: "▶️",
      available: false,
      mode: "planned",
      connected: () => false,
      description: "YouTube · kan tilføjes som alternativ senere"
    }
  };

  function selectedId() {
    const saved = localStorage.getItem(PROVIDER_KEY);
    return providers[saved] ? saved : "spotify";
  }

  function select(id) {
    if (!providers[id]) return false;
    localStorage.setItem(PROVIDER_KEY, id);
    document.dispatchEvent(new CustomEvent("timeline-party-music-provider-change", { detail: { provider: id } }));
    return true;
  }

  function current() { return providers[selectedId()]; }
  function all() { return Object.values(providers); }
  function openExternal(id = selectedId()) {
    const provider = providers[id];
    if (!provider?.externalUrl) return false;
    window.open(provider.externalUrl, "_blank", "noopener,noreferrer");
    return true;
  }

  globalThis.TimelinePartyMusicProviders = { all, current, select, selectedId, openExternal, providers };
})();
