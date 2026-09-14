(() => {
  "use strict";

  const URL = "https://timeline-party-music-sync-test.onrender.com";
  const GAME_CODE_KEY = "timeline-party-game-code";
  const PLAYER_ID_KEY = "timeline-party-player-id";
  const NAME_KEY = "timeline-party-name";
  let socket = null;
  let latency = null;
  let state = "forbinder";
  let timer = null;
  let participants = [];
  let joinedRoom = "";
  let providerSyncState = "idle";
  let providerDriftMs = null;

  const room = () => String(localStorage.getItem(GAME_CODE_KEY) || "").trim().toUpperCase();
  const playerId = () => localStorage.getItem(PLAYER_ID_KEY) || "";
  const playerName = () => localStorage.getItem(NAME_KEY) || "Spiller";
  const provider = () => globalThis.TimelinePartyMusicProviders?.selectedId?.() || "spotify";
  const isHostUi = () => Boolean(document.querySelector('button[data-action="restartGame"]'));

  function quality(ms) {
    if (!Number.isFinite(ms)) return "";
    if (ms < 120) return "god";
    if (ms < 250) return "ok";
    return "langsom";
  }

  function healthIcon(item) {
    if (item.connection === "offline") return "🔴";
    if (!item.ready) return "🟠";
    if (Number.isFinite(item.latencyMs) && item.latencyMs >= 400) return "🟠";
    if (item.syncState === "error") return "🔴";
    if (item.syncState === "warning") return "🟠";
    return "🟢";
  }

  function healthText(item) {
    const bits = [];
    if (Number.isFinite(item.latencyMs)) bits.push(`${item.latencyMs} ms`);
    if (item.syncState === "synced") bits.push("synkroniseret");
    else if (item.syncState === "syncing") bits.push("synkroniserer");
    else if (item.syncState === "error") bits.push("afspilningsfejl");
    else if (item.syncState === "warning") bits.push("tjek afspilning");
    if (Number.isFinite(item.driftMs) && Math.abs(item.driftMs) >= 250) bits.push(`afvigelse ${Math.abs(item.driftMs)} ms`);
    return bits.join(" · ");
  }

  function setHtml(node, html) {
    if (node.innerHTML !== html) node.innerHTML = html;
  }

  function setText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }

  function renderHostDetails(host) {
    let details = host.querySelector("[data-music-health-list]");
    if (!isHostUi()) {
      details?.remove();
      return;
    }
    if (!details) {
      details = document.createElement("div");
      details.dataset.musicHealthList = "1";
      details.className = "music-health-list";
      host.appendChild(details);
    }
    const others = participants.filter((item) => item.playerId !== playerId());
    if (!others.length) {
      setHtml(details, '<p class="hint"><strong>Forbindelsestjek</strong> · venter på deltagere…</p>');
      return;
    }
    const rows = others.map((item) => {
      const providerLabel = globalThis.TimelinePartyMusicProviders?.providers?.[item.provider]?.label || item.provider || "Ukendt";
      const extra = healthText(item);
      return `<div class="music-health-player">${healthIcon(item)} <strong>${escapeHtml(item.name || "Spiller")}</strong> · ${escapeHtml(providerLabel)}${extra ? ` · ${escapeHtml(extra)}` : ""}</div>`;
    }).join("");
    setHtml(details, `<p class="hint"><strong>Forbindelsestjek</strong></p>${rows}`);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
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
    let text;
    if (state === "online" && Number.isFinite(latency)) text = `Musiksync: online · ${latency} ms · ${quality(latency)}`;
    else if (state === "online") text = "Musiksync: online";
    else if (state === "offline") text = "Musiksync: forbindelsen er afbrudt og prøver igen…";
    else text = "Musiksync: forbinder…";
    setText(row, text);
    renderHostDetails(host);
  }

  function joinRoom() {
    const code = room();
    if (!socket?.connected || !code || !playerId()) return;
    socket.emit("music:join", {
      room: code,
      playerId: playerId(),
      name: playerName(),
      provider: provider(),
      ready: false,
      isHost: false,
      diagnosticsOnly: true
    }, (result) => {
      if (!result?.ok) return;
      joinedRoom = code;
      participants = Array.isArray(result.participants) ? result.participants : participants;
      render();
      reportHealth();
    });
  }

  function reportHealth(syncState = providerSyncState, driftMs = providerDriftMs) {
    if (!socket?.connected || !joinedRoom) return;
    socket.emit("music:health", {
      latencyMs: latency,
      connection: state === "online" ? "online" : state === "offline" ? "offline" : "reconnecting",
      syncState,
      driftMs
    });
  }

  function ping() {
    if (!socket?.connected) return;
    const sentAt = performance.now();
    socket.timeout(4000).emit("music:ping", { sentAt: Date.now() }, (error, result) => {
      if (error || !result?.ok) {
        latency = null;
        render();
        reportHealth();
        return;
      }
      latency = Math.max(0, Math.round(performance.now() - sentAt));
      render();
      reportHealth();
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
      joinedRoom = "";
      joinRoom();
      render();
      ping();
      clearInterval(timer);
      timer = setInterval(() => {
        if (joinedRoom !== room()) joinRoom();
        ping();
      }, 5000);
    });
    socket.on("music:presence", (payload) => {
      participants = Array.isArray(payload?.participants) ? payload.participants : [];
      render();
    });
    socket.on("disconnect", () => {
      state = "offline";
      latency = null;
      joinedRoom = "";
      clearInterval(timer);
      timer = null;
      render();
    });
    socket.io.on("reconnect_attempt", () => {
      state = "forbinder";
      render();
    });
  }

  document.addEventListener("timeline-party-music-provider-change", () => {
    providerSyncState = "idle";
    providerDriftMs = null;
    if (socket?.connected) joinRoom();
  });
  document.addEventListener("timeline-party-music-play", () => {
    providerSyncState = "syncing";
    providerDriftMs = null;
    reportHealth();
  });
  document.addEventListener("timeline-party-music-state", () => {
    providerSyncState = "syncing";
    providerDriftMs = null;
    reportHealth();
  });
  document.addEventListener("timeline-party-music-stop", () => {
    providerSyncState = "idle";
    providerDriftMs = null;
    reportHealth();
  });
  document.addEventListener("timeline-party-music-provider-health", (event) => {
    const detail = event.detail || {};
    providerSyncState = detail.state || "unknown";
    providerDriftMs = Number.isFinite(detail.driftMs) ? detail.driftMs : null;
    reportHealth();
  });

  new MutationObserver(() => {
    render();
    if (socket?.connected && !joinedRoom) joinRoom();
  }).observe(document.documentElement, { childList: true, subtree: true });
  ensure();
  render();
})();
