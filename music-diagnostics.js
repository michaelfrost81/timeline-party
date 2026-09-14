(() => {
  "use strict";

  const URL = "https://timeline-party-music-sync-test.onrender.com";
  let socket = null;
  let latency = null;
  let state = "forbinder";
  let timer = null;

  function quality(ms) {
    if (!Number.isFinite(ms)) return "";
    if (ms < 120) return "god";
    if (ms < 250) return "ok";
    return "langsom";
  }

  function render() {
    const host = document.querySelector("[data-participant-music-sync]");
    if (!host) return;
    let row = host.querySelector("[data-music-diagnostics]");
    if (!row) {
      row = document.createElement("p");
      row.className = "hint music-diagnostics";
      row.dataset.musicDiagnostics = "1";
      host.appendChild(row);
    }
    if (state === "online" && Number.isFinite(latency)) {
      row.textContent = `Musiksync: online · ${latency} ms · ${quality(latency)}`;
    } else if (state === "online") {
      row.textContent = "Musiksync: online";
    } else if (state === "offline") {
      row.textContent = "Musiksync: forbindelsen er afbrudt og prøver igen…";
    } else {
      row.textContent = "Musiksync: forbinder…";
    }
  }

  function ping() {
    if (!socket?.connected) return;
    const sentAt = performance.now();
    socket.timeout(4000).emit("music:ping", { sentAt: Date.now() }, (error, result) => {
      if (error || !result?.ok) {
        latency = null;
        render();
        return;
      }
      latency = Math.max(0, Math.round(performance.now() - sentAt));
      render();
    });
  }

  function ensure() {
    if (socket || !globalThis.io) return;
    socket = globalThis.io(URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000
    });
    socket.on("connect", () => {
      state = "online";
      render();
      ping();
      clearInterval(timer);
      timer = setInterval(ping, 5000);
    });
    socket.on("disconnect", () => {
      state = "offline";
      latency = null;
      clearInterval(timer);
      timer = null;
      render();
    });
    socket.io.on("reconnect_attempt", () => {
      state = "forbinder";
      render();
    });
  }

  new MutationObserver(render).observe(document.documentElement, { childList: true, subtree: true });
  ensure();
  render();
})();
