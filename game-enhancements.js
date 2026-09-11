(() => {
  "use strict";

  const SETTINGS_KEY = "timeline-party-settings-v2";
  const HISTORY_KEY = "timeline-party-history-v2";
  const YEAR_OVERRIDES_KEY = "timeline-party-hitster-year-overrides";
  const defaults = { winMode: "firstTo", targetScore: 10, roundLimit: 15, maxChallenges: 5, challengesEnabled: true, answerTimer: 0 };
  let settings = { ...defaults, ...read(SETTINGS_KEY, {}) };
  let gameState = null;
  let socketRef = null;
  let settingsOpen = false;
  let statsOpen = false;
  let correctionsOpen = false;
  let renderQueued = false;
  let clock = null;
  let recordedRounds = new Set();
  let recordedFinishedGames = new Set();

  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function esc(value) { return String(value ?? "").replace(/[&<>\"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c])); }
  function myPlayerId() { return localStorage.getItem("timeline-party-player-id") || ""; }
  function isHost() { return Boolean(gameState && gameState.hostId === myPlayerId()); }
  function history() { return read(HISTORY_KEY, { rounds: [], games: [] }); }
  function overrides() { return read(YEAR_OVERRIDES_KEY, {}); }

  function settingsPayload(source = settings) {
    return {
      winMode: source.winMode,
      targetScore: Number(source.targetScore),
      roundLimit: Number(source.roundLimit),
      maxChallenges: Number(source.maxChallenges),
      challengesEnabled: Boolean(source.challengesEnabled),
      answerTimer: Number(source.answerTimer)
    };
  }

  function recordGame(next) {
    if (!next) return;
    const data = history();
    if (next.showAnswer) {
      const roundKey = `${next.code}:${next.roundNumber}`;
      if (!recordedRounds.has(roundKey) && !data.rounds.some((row) => row.key === roundKey)) {
        recordedRounds.add(roundKey);
        data.rounds.unshift({
          key: roundKey,
          at: Date.now(),
          round: next.roundNumber,
          year: next.currentSong?.year ?? null,
          players: next.players.map((player) => ({ name: player.name, correct: player.lastGuessWasCorrect === true, score: player.score }))
        });
        data.rounds = data.rounds.slice(0, 500);
        save(HISTORY_KEY, data);
      }
    }
    if (next.finished) {
      const gameKey = `${next.code}:finished:${next.roundNumber}`;
      if (!recordedFinishedGames.has(gameKey) && !data.games.some((row) => row.key === gameKey)) {
        recordedFinishedGames.add(gameKey);
        const winnerIds = new Set(next.winnerIds || []);
        data.games.unshift({
          key: gameKey,
          at: Date.now(),
          rounds: next.roundNumber,
          players: next.players.map((player) => ({ name: player.name, score: player.score, winner: winnerIds.has(player.id) }))
        });
        data.games = data.games.slice(0, 100);
        save(HISTORY_KEY, data);
      }
    }
  }

  const originalIo = globalThis.io;
  if (typeof originalIo === "function") {
    globalThis.io = function (...args) {
      const socket = originalIo(...args);
      socketRef = socket;
      socket.on("game:update", (next) => {
        gameState = next;
        if (next?.settings) {
          settings = { ...settings, ...next.settings };
          save(SETTINGS_KEY, settings);
        }
        recordGame(next);
        queueDecorate();
      });
      socket.on("game:ended", () => { gameState = null; queueDecorate(); });
      const originalEmit = socket.emit.bind(socket);
      socket.emit = function (event, ...emitArgs) {
        if (event === "game:create" && emitArgs[0] && typeof emitArgs[0] === "object") {
          emitArgs[0] = { ...emitArgs[0], settings: settingsPayload() };
        }
        return originalEmit(event, ...emitArgs);
      };
      return socket;
    };
    Object.assign(globalThis.io, originalIo);
  }

  function queueDecorate() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; decorate(); });
  }

  function winnerNames() {
    if (!gameState) return [];
    const ids = new Set(gameState.winnerIds || []);
    return gameState.players.filter((player) => ids.has(player.id)).map((player) => player.name);
  }

  function phaseText() {
    if (!gameState) return "";
    if (gameState.finished) return "🏆 Spillet er afsluttet";
    if (!gameState.currentSong) {
      const max = Math.max(0, ...gameState.players.map((player) => player.score));
      const leaders = gameState.players.filter((player) => player.score === max).map((player) => player.name);
      return leaders.length ? `🎮 ${leaders.join(" & ")} fører med ${max} point` : "🎮 Klar til næste runde";
    }
    const active = gameState.players.find((player) => player.id === (gameState.roundPlayerId || gameState.activePlayerId));
    if (gameState.phase === "challenge_decisions") return `⚡ Challenge-valg · Runde ${gameState.roundNumber}`;
    if (gameState.phase === "challenge_guesses") return `⚡ Challenge-svar · Runde ${gameState.roundNumber}`;
    if (gameState.phase === "awaiting_reveal") return `👀 Klar til at afsløre svaret · Runde ${gameState.roundNumber}`;
    if (gameState.showAnswer) return `🎵 Svaret er afsløret · Runde ${gameState.roundNumber}`;
    return `🎯 Runde ${gameState.roundNumber}${active ? ` · ${active.name}s tur` : ""}`;
  }

  function addStatus() {
    const hero = document.querySelector(".hero-card");
    if (!hero || !gameState) return;
    let status = hero.querySelector(".enhance-status");
    if (!status) { status = document.createElement("p"); status.className = "enhance-status"; hero.appendChild(status); }
    status.textContent = phaseText();
  }

  function addRevealCelebration() {
    document.querySelectorAll(".round-celebration").forEach((node) => node.remove());
    if (!gameState?.showAnswer || gameState.finished) return;
    const target = document.querySelector(".round-card") || document.querySelector(".hero-card");
    if (!target) return;
    const names = gameState.players.filter((player) => player.lastGuessWasCorrect).map((player) => player.name);
    const box = document.createElement("div"); box.className = "round-celebration";
    box.innerHTML = names.length
      ? `<strong>🎉 Korrekt svar!</strong><span>${esc(names.join(", "))}</span>`
      : `<strong>🎵 Svaret er afsløret</strong><span>Ingen ramte denne gang.</span>`;
    target.prepend(box);
  }

  function addFinishBanner() {
    document.querySelectorAll(".game-finish-banner").forEach((node) => node.remove());
    if (!gameState?.finished) return;
    const hero = document.querySelector(".hero-card"); if (!hero) return;
    const max = Math.max(0, ...gameState.players.map((player) => player.score));
    const banner = document.createElement("section"); banner.className = "card game-finish-banner";
    banner.innerHTML = `<p class="eyebrow">Spillet er slut</p><h2>🏆 ${esc(winnerNames().join(" & ") || "Vinder")}</h2><p>${max} point · ${gameState.roundNumber} runder</p>`;
    hero.after(banner);
  }

  function addTools() {
    if (!isHost()) return;
    const actions = document.querySelector(".game-actions") || [...document.querySelectorAll("#app > section")].at(-1);
    if (!actions || actions.querySelector(".enhance-tools")) return;
    const wrap = document.createElement("div"); wrap.className = "enhance-tools";
    wrap.innerHTML = `<button type="button" data-enhance="settings">⚙️ Spilindstillinger</button><button type="button" data-enhance="corrections">🃏 Kortrettelser</button><button type="button" data-enhance="stats">📊 Statistik</button>${gameState && !gameState.finished ? '<button type="button" data-enhance="finish">🏁 Afslut spil og vis vinder</button>' : ""}`;
    actions.appendChild(wrap);
  }

  function renderPanels() {
    document.querySelectorAll(".enhance-panel").forEach((node) => node.remove());
    const root = document.querySelector("#app"); if (!root || !gameState) return;
    if (settingsOpen) {
      const locked = Boolean(gameState.currentSong);
      root.insertAdjacentHTML("beforeend", `<section class="card enhance-panel"><h2>⚙️ Spilindstillinger</h2>${locked ? '<p class="connection-warning">Indstillinger kan ændres mellem runderne.</p>' : ""}<label>Spiltype<select id="enh-win" ${locked?'disabled':''}><option value="firstTo" ${settings.winMode==='firstTo'?'selected':''}>Først til point</option><option value="rounds" ${settings.winMode==='rounds'?'selected':''}>Fast antal runder</option><option value="host" ${settings.winMode==='host'?'selected':''}>Værten afslutter</option></select></label><label>Point for sejr<input id="enh-score" type="number" min="1" max="50" value="${settings.targetScore}" ${locked?'disabled':''}></label><label>Antal runder<input id="enh-rounds" type="number" min="1" max="100" value="${settings.roundLimit}" ${locked?'disabled':''}></label><label>Challenges pr. spiller<input id="enh-challenges" type="number" min="0" max="20" value="${settings.maxChallenges}" ${locked?'disabled':''}></label><label><input id="enh-challenges-on" type="checkbox" ${settings.challengesEnabled?'checked':''} ${locked?'disabled':''}> Challenges slået til</label><label>Svar-timer i sekunder (0 = fra)<input id="enh-timer" type="number" min="0" max="120" value="${settings.answerTimer}" ${locked?'disabled':''}></label>${locked?'':'<button data-enhance="save-settings">Gem indstillinger</button>'}<button data-enhance="close">Luk</button></section>`);
    }
    if (statsOpen) {
      const data = history(); const totals = {};
      data.rounds.forEach((round) => round.players.forEach((player) => { totals[player.name] ??= { rounds:0, correct:0, wins:0 }; totals[player.name].rounds += 1; if (player.correct) totals[player.name].correct += 1; }));
      data.games.forEach((savedGame) => savedGame.players.forEach((player) => { totals[player.name] ??= { rounds:0, correct:0, wins:0 }; if (player.winner) totals[player.name].wins += 1; }));
      root.insertAdjacentHTML("beforeend", `<section class="card enhance-panel"><h2>📊 Spilhistorik og statistik</h2>${Object.keys(totals).length ? Object.entries(totals).map(([name, row]) => `<div class="stat-row"><strong>${esc(name)}</strong><span>${row.correct}/${row.rounds} korrekte${row.rounds ? ` · ${Math.round(row.correct/row.rounds*100)}%` : ""} · ${row.wins} sejre</span></div>`).join("") : '<p>Ingen afsluttede runder gemt endnu.</p>'}<p>${data.games.length} afsluttede spil · ${data.rounds.length} gemte runder</p><button data-enhance="clear-stats">Nulstil statistik</button><button data-enhance="close">Luk</button></section>`);
    }
    if (correctionsOpen) {
      const rows = Object.entries(overrides()).sort((a,b) => Number(a[0]) - Number(b[0]));
      root.insertAdjacentHTML("beforeend", `<section class="card enhance-panel"><h2>🃏 Rettede Hitster-kort</h2>${rows.length ? rows.map(([id, year]) => `<div class="stat-row"><span>Kort ${Number(id)} → <strong>${year}</strong></span><button data-enhance="delete-correction" data-card="${id}">Slet</button></div>`).join("") : '<p>Ingen lokale rettelser endnu.</p>'}<p class="hint">Her vises de årstal, du har rettet via Spotify-funktionen “Ret årstal”.</p><button data-enhance="close">Luk</button></section>`);
    }
  }

  function updateCountdown() {
    document.querySelectorAll(".answer-countdown").forEach((node) => node.remove());
    if (!gameState?.currentSong || gameState.showAnswer || gameState.finished) return;
    const me = myPlayerId();
    const deadline = Number(gameState.offlineActionDeadlines?.[me]);
    if (!deadline) return;
    const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const target = document.querySelector(".round-card") || document.querySelector(".hero-card");
    if (!target) return;
    const el = document.createElement("p"); el.className = "answer-countdown"; el.textContent = `⏱ ${left} sek. tilbage`;
    target.prepend(el);
  }

  function decorate() {
    if (!gameState) return;
    addStatus(); addRevealCelebration(); addFinishBanner(); addTools(); renderPanels(); updateCountdown();
    if (!clock) clock = setInterval(updateCountdown, 500);
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-enhance]"); if (!button) return;
    event.preventDefault(); event.stopPropagation();
    const action = button.dataset.enhance;
    if (action === "settings") settingsOpen = !settingsOpen;
    if (action === "stats") statsOpen = !statsOpen;
    if (action === "corrections") correctionsOpen = !correctionsOpen;
    if (action === "close") settingsOpen = statsOpen = correctionsOpen = false;
    if (action === "finish") {
      if (confirm("Afslut spillet og vis vinderen?")) socketRef?.emit("game:finish", gameState.code, (result) => { if (!result?.ok) alert(result?.message || "Spillet kunne ikke afsluttes."); });
    }
    if (action === "save-settings") {
      const next = {
        winMode: document.querySelector("#enh-win").value,
        targetScore: Number(document.querySelector("#enh-score").value),
        roundLimit: Number(document.querySelector("#enh-rounds").value),
        maxChallenges: Number(document.querySelector("#enh-challenges").value),
        challengesEnabled: document.querySelector("#enh-challenges-on").checked,
        answerTimer: Number(document.querySelector("#enh-timer").value)
      };
      socketRef?.emit("game:settings", { code: gameState.code, settings: next }, (result) => {
        if (!result?.ok) return alert(result?.message || "Indstillingerne kunne ikke gemmes.");
        settings = { ...settings, ...(result.game?.settings || next) }; save(SETTINGS_KEY, settings); settingsOpen = false; queueDecorate();
      });
    }
    if (action === "clear-stats" && confirm("Nulstil gemt statistik på denne enhed?")) save(HISTORY_KEY, { rounds: [], games: [] });
    if (action === "delete-correction") {
      const data = overrides(); delete data[button.dataset.card]; save(YEAR_OVERRIDES_KEY, data); location.reload(); return;
    }
    queueDecorate();
  }, true);

  new MutationObserver(queueDecorate).observe(document.documentElement, { childList: true, subtree: true });
})();
