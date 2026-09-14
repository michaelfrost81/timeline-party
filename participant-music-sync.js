(() => {
  "use strict";
  const stable = "https://raw.githubusercontent.com/michaelfrost81/timeline-party/b3c1976f923e60ac4b4bfeb637887a49e3bc8831/participant-music-sync.js";
  fetch(stable, { cache: "force-cache" })
    .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.text(); })
    .then((source) => { (0, eval)(`${source}\n//# sourceURL=participant-music-sync-stable.js`); })
    .catch((error) => console.error("Kunne ikke indlæse den stabile musik-synkronisering", error));
})();
