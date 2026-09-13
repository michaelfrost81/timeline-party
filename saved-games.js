(() => {
  "use strict";
  const KEY = "timeline-party-saved-games-v1";
  const AUTO_KEY = "timeline-party-autosave-v1";
  const GAME_CODE_KEY = "timeline-party-game-code";
  const PLAYER_ID_KEY = "timeline-party-player-id";
  const NAME_KEY = "timeline-party-name";
  let socket = null;
  let game = null;
  let panelOpen = false;
  let lastAutoRound = null;

  const en = () => localStorage.getItem("timeline-party-language") === "en-US";
  const t = (da, us) => en() ? us : da;
  const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const read = () => { try { const value = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(value) ? value : []; } catch { return []; } };
  const write = (rows) => localStorage.setItem(KEY, JSON.stringify(rows.slice(0, 12)));
  const readAuto = () => { try { return JSON.parse(localStorage.getItem(AUTO_KEY)) || null; } catch { return null; } };
  const writeAuto = (row) => row ? localStorage.setItem(AUTO_KEY, JSON.stringify(row)) : localStorage.removeItem(AUTO_KEY);
  const myId = () => localStorage.getItem(PLAYER_ID_KEY) || "";
  const myName = () => localStorage.getItem(NAME_KEY) || t("Spiller", "Player");

  const originalIo = globalThis.io;
  if (typeof originalIo === "function") {
    globalThis.io = function(...args) {
      const created = originalIo(...args);
      socket = created;
      created.on("game:update", next => {
        game = next;
        maybeAutosave(next);
        requestAnimationFrame(decorate);
      });
      created.on("game:ended", () => {
        game = null;
        writeAuto(null);
        requestAnimationFrame(decorate);
      });
      return created;
    };
    Object.assign(globalThis.io, originalIo);
  }

  function snapshotOf(current) {
    const unfinishedRound = Boolean(current.currentSong && !current.showAnswer);
    return {
      version: 1,
      savedAt: Date.now(),
      hostId: current.hostId,
      activePlayerId: current.activePlayerId,
      roundNumber: Math.max(0, Number(current.roundNumber || 0) - (unfinishedRound ? 1 : 0)),
      settings: { ...(current.settings || {}) },
      players: (current.players || []).map(p => ({
        id: p.id,
        name: p.name,
        score: Number(p.score) || 0,
        timeline: Array.isArray(p.timeline) ? p.timeline.filter(Number.isFinite).map(Number) : [],
        turnsTaken: Number(p.turnsTaken) || 0,
        challengesRemaining: Number.isFinite(Number(p.challengesRemaining)) ? Number(p.challengesRemaining) : 0
      }))
    };
  }

  function defaultTitle(current) {
    const names = (current?.players || []).slice(0, 3).map(p => p.name).filter(Boolean).join(", ");
    return names ? `${t("Spil med", "Game with")} ${names}` : t("Gemt spil", "Saved game");
  }

  function maybeAutosave(current) {
    if (!current || current.finished || current.hostId !== myId()) return;
    const safePoint = !current.currentSong || current.showAnswer || current.phase === "lobby";
    if (!safePoint) return;
    const round = Number(current.roundNumber) || 0;
    const key = `${current.code}:${round}:${current.phase}`;
    if (lastAutoRound === key) return;
    lastAutoRound = key;
    writeAuto({
      id: "autosave",
      at: Date.now(),
      title: t("Automatisk sikkerhedskopi", "Automatic checkpoint"),
      snapshot: snapshotOf(current)
    });
  }

  function saveCurrent() {
    if (!game || game.hostId !== myId() || game.finished) return;
    const now = Date.now();
    const proposed = defaultTitle(game);
    const entered = prompt(t("Giv det gemte spil et navn (valgfrit):", "Name this saved game (optional):"), proposed);
    if (entered === null) return;
    const title = String(entered || proposed).trim().slice(0, 60) || proposed;
    const rows = read();
    const saved = {
      id: globalThis.crypto?.randomUUID?.() || `${now}-${Math.random().toString(36).slice(2)}`,
      at: now,
      title,
      snapshot: snapshotOf(game)
    };
    rows.unshift(saved);
    write(rows);
    writeAuto(null);
    localStorage.removeItem(GAME_CODE_KEY);
    alert(t("Spillet er gemt på denne enhed. Når I genoptager det, får spillet en ny spilkode.", "The game is saved on this device. When you resume it, the game will receive a new game code."));
    location.href = `${location.origin}${location.pathname}`;
  }

  function removeSaved(id) {
    if (id === "autosave") writeAuto(null);
    else write(read().filter(row => row.id !== id));
    renderPanel();
    decorate();
  }

  function restoreRow(row, removeAfter = true) {
    if (!row || !socket) return;
    const payload = { snapshot: row.snapshot, playerId: myId(), playerName: myName() };
    socket.emit("game:restoreSaved", payload, result => {
      if (!result?.ok) {
        alert(result?.message || t("Det gemte spil kunne ikke genoptages.", "The saved game could not be resumed."));
        return;
      }
      localStorage.setItem(GAME_CODE_KEY, result.code);
      if (row.id === "autosave") writeAuto(null);
      else if (removeAfter) write(read().filter(item => item.id !== row.id));
      panelOpen = false;
      document.querySelector(".saved-games-panel")?.remove();
    });
  }

  function restoreSaved(id) {
    const row = id === "autosave" ? readAuto() : read().find(item => item.id === id);
    restoreRow(row, true);
  }

  function formatSaved(row, auto = false) {
    const snap = row.snapshot || {};
    const date = new Date(row.at || snap.savedAt || Date.now());
    const players = Array.isArray(snap.players) ? snap.players : [];
    const score = [...players].sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0))[0]?.score || 0;
    return `<div class="saved-game-row ${auto ? "saved-game-auto" : ""}">
      <div><strong>${auto ? "🛟 " : ""}${esc(row.title || t("Gemt spil","Saved game"))}</strong><small>${date.toLocaleDateString(en()?"en-US":"da-DK")} · ${date.toLocaleTimeString(en()?"en-US":"da-DK",{hour:"2-digit",minute:"2-digit"})}</small><small>${players.length} ${players.length===1?t("spiller","player"):t("spillere","players")} · ${Number(snap.roundNumber)||0} ${Number(snap.roundNumber)===1?t("runde","round"):t("runder","rounds")} · ${t("fører","top score")}: ${score}</small></div>
      <div class="saved-game-actions"><button type="button" data-saved-action="restore" data-id="${esc(row.id)}">▶️ ${t("Genoptag","Resume")}</button><button type="button" class="secondary" data-saved-action="delete" data-id="${esc(row.id)}">🗑️ ${t("Slet","Delete")}</button></div>
    </div>`;
  }

  function allRows() {
    const auto = readAuto();
    return { auto, manual: read() };
  }

  function renderPanel() {
    document.querySelector(".saved-games-panel")?.remove();
    if (!panelOpen) return;
    const root = document.querySelector("#app");
    if (!root) return;
    const {auto, manual} = allRows();
    const panel = document.createElement("section");
    panel.className = "card saved-games-panel";
    panel.innerHTML = `<h2>💾 ${t("Gemte spil","Saved games")}</h2><p class="hint">${t("Spil gemmes lokalt på denne enhed. Der laves også automatisk en sikkerhedskopi mellem runderne, så et spil lettere kan gendannes efter et uventet afbrud.", "Games are stored locally on this device. An automatic checkpoint is also made between rounds, making it easier to recover after an unexpected interruption.")}</p>${auto ? `<h3>🛟 ${t("Seneste sikkerhedskopi","Latest checkpoint")}</h3>${formatSaved(auto,true)}` : ""}${manual.length ? `<h3>💾 ${t("Manuelt gemte spil","Manually saved games")}</h3><div class="saved-games-list">${manual.map(row=>formatSaved(row,false)).join("")}</div>` : (!auto ? `<p>${t("Der er ingen gemte spil endnu.", "There are no saved games yet.")}</p>` : "")}<button type="button" data-saved-action="close">${t("Luk","Close")}</button>`;
    root.appendChild(panel);
    panel.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function addSaveButton() {
    if (!game || game.finished || game.hostId !== myId()) return;
    const tools = document.querySelector(".enhance-tools");
    if (!tools || tools.querySelector("[data-saved-action='save']")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.savedAction = "save";
    button.textContent = `💾 ${t("Gem spil til senere", "Save game for later")}`;
    tools.appendChild(button);
  }

  function addHomeButton() {
    if (game) return;
    const {auto,manual} = allRows();
    const count = manual.length + (auto ? 1 : 0);
    if (!count || document.querySelector("[data-saved-action='open']")) return;
    const root = document.querySelector("#app");
    if (!root) return;
    const section = document.createElement("section");
    section.className = "card saved-games-home";
    section.innerHTML = `<h2>💾 ${t("Gemte spil","Saved games")}</h2><p>${count} ${count===1?t("gemt spil","saved game"):t("gemte spil","saved games")}${auto ? ` · 🛟 ${t("sikkerhedskopi klar","checkpoint available")}` : ""}</p><button type="button" data-saved-action="open">${t("Vis gemte spil","Show saved games")}</button>`;
    root.appendChild(section);
  }

  function decorate() {
    addSaveButton();
    addHomeButton();
    if (panelOpen && !document.querySelector(".saved-games-panel")) renderPanel();
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-saved-action]");
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.savedAction;
    if (action === "save") saveCurrent();
    if (action === "open") { panelOpen = true; renderPanel(); }
    if (action === "close") { panelOpen = false; renderPanel(); }
    if (action === "restore") restoreSaved(button.dataset.id);
    if (action === "delete" && confirm(t("Slet dette gemte spil?", "Delete this saved game?"))) removeSaved(button.dataset.id);
  }, true);

  document.addEventListener("timeline-party-language-change", () => {
    document.querySelector(".saved-games-home")?.remove();
    if (panelOpen) renderPanel();
    requestAnimationFrame(decorate);
  });
  new MutationObserver(() => requestAnimationFrame(decorate)).observe(document.querySelector("#app") || document.documentElement, {childList:true,subtree:true});
  decorate();
})();