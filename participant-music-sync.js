(() => {
  "use strict";
  // Restored loader after an interrupted maintenance update. Load the known-good implementation.
  const script = document.createElement("script");
  script.src = "/participant-music-sync-core.js?v=1";
  script.async = false;
  document.head.appendChild(script);
})();
