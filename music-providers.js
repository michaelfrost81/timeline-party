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
      connected: () => Boolean(spotifyToken()),
      description: "Spotify Premium · direkte afspilning i Timeline Party"
    },
    apple: {
      id: "apple",
      label: "Apple Music",
      icon: "🍎",
      available: false,
      connected: () => false,
      description: "Apple Music · klargjort som næste musiktjeneste"
    },
    telmore: {
      id: "telmore",
      label: "Telmore Musik",
      icon: "🎵",
      available: false,
      connected: () => false,
      description: "Telmore Musik · med på listen, mens vi undersøger sikker integration og synkroniseret afspilning"
    },
    youtube: {
      id: "youtube",
      label: "YouTube",
      icon: "▶️",
      available: false,
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

  globalThis.TimelinePartyMusicProviders = { all, current, select, selectedId, providers };
})();
