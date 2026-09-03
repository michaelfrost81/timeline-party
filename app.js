const socket = io();
const appRoot = document.querySelector("#app");

let game = null;
let myName = localStorage.getItem("timeline-party-name") || "";
let activeGameCode = localStorage.getItem("timeline-party-game-code") || "";
const myPlayerId = getOrCreatePlayerId();
let isResuming = Boolean(activeGameCode);
let nextSongPending = false;

socket.on("connect", () => {
  if (activeGameCode) {
    isResuming = true;
    render();
    socket.emit("game:resume", { code: activeGameCode, playerId: myPlayerId }, handleResume);
    return;
  }
  render();
});

socket.on("disconnect", () => render());

socket.on("game:update", (nextGame) => {
  game = nextGame;
  nextSongPending = false;
  saveActiveGame(nextGame.code);
  isResuming = false;
  render();
});

socket.on("game:ended", (details) => {
  clearActiveGame(); game = null; isResuming = false; render();
  alert((details && details.message) || "Spillet er afsluttet.");
});

appRoot.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");

  if (!button) return;

  const actions = {
    create: createGame,
    join: joinGame,
    startSong,
    placeSong: () => placeSong(Number(button.dataset.slot)),
    guessDecade: () => guessDecade(Number(button.dataset.decade)),
    lockAnswer,
    challengeSong,
    passChallenge,
    revealSong,
    nextSong,
    restartGame,
    leaveGame,
    endGame
  };

  const action = actions[button.dataset.action];

  if (action) {
    action();
  }
});

function escapeHtml(text) {
  return String(text || "").replace(/[&<>"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[character]));
}

function getOrCreatePlayerId() {
  const storageKey = "timeline-party-player-id";
  let playerId = localStorage.getItem(storageKey);

  if (!playerId) {
    playerId = globalThis.crypto && globalThis.crypto.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(storageKey, playerId);
  }

  return playerId;
}

function saveActiveGame(code) {
  activeGameCode = code;
  localStorage.setItem("timeline-party-game-code", code);
}

function clearActiveGame() {
  activeGameCode = "";
  localStorage.removeItem("timeline-party-game-code");
}

function handleResume(result) {
  isResuming = false;

  if (!result || !result.ok) {
    clearActiveGame();
    game = null;
    render();
    return;
  }

  showServerMessage(result);
}

function saveName() {
  const input = document.querySelector("#player-name");
  myName = input.value.trim();
  localStorage.setItem("timeline-party-name", myName);
  return myName;
}

function createGame() {
  const playerName = saveName();

  if (!playerName) {
    alert("Skriv dit navn først.");
    return;
  }

  if (!socket.connected) {
    alert("Der er ikke forbindelse til spilserveren endnu. Vent et øjeblik og prøv igen.");
    return;
  }

  socket.emit("game:create", { playerName, playerId: myPlayerId }, showServerMessage);
}

function joinGame() {
  const playerName = saveName();
  const code = document.querySelector("#game-code").value.trim().toUpperCase();

  if (!playerName || !code) {
    alert("Skriv både navn og spilkode.");
    return;
  }

  socket.emit("game:join", { code, playerName, playerId: myPlayerId }, showServerMessage);
}

function startSong() {
  socket.emit("song:start", {
    code: game.code,
    title: document.querySelector("#song-title").value.trim(),
    artist: document.querySelector("#song-artist").value.trim(),
    year: document.querySelector("#song-year").value,
    url: document.querySelector("#song-url").value.trim()
  }, showServerMessage);
}

function placeSong(slot) {
  socket.emit("song:place", { code: game.code, slot }, showServerMessage);
}

function guessDecade(decade) {
  socket.emit("song:decade", { code: game.code, decade }, showServerMessage);
}

function challengeSong() {
  socket.emit("song:challenge", game.code, showServerMessage);
}

function passChallenge() {
  socket.emit("song:pass", game.code, showServerMessage);
}

function lockAnswer() {
  socket.emit("song:lock", game.code, showServerMessage);
}

function revealSong() {
  socket.emit("song:reveal", game.code, showServerMessage);
}

function nextSong() {
  if (nextSongPending || !game.showAnswer) return;
  nextSongPending = true;
  render();
  socket.emit("song:next", { code: game.code, roundNumber: game.roundNumber }, (result) => {
    nextSongPending = false;
    showServerMessage(result);
    if (!result || !result.game) render();
  });
}

function restartGame() {
  if (!confirm("Er du sikker? Alle point og tidslinjer bliver nulstillet.")) return;
  socket.emit("game:restart", game.code, showServerMessage);
}

function leaveGame() {
  if (!confirm("Er du sikker på, at du vil forlade spillet?")) return;
  socket.emit("game:leave", game.code, (result) => {
    if (!result || !result.ok) return showServerMessage(result);
    clearActiveGame(); game = null; render();
  });
}

function endGame() {
  if (!confirm("Er du sikker på, at du vil afslutte spillet? Alle deltagere bliver sendt tilbage til startsiden.")) return;
  socket.emit("game:end", game.code, showServerMessage);
}

function showServerMessage(result) {
  if (!result) return;

  if (!result.ok) {
    alert(result.message);
    return;
  }

  if (result.game) {
    game = result.game;
    saveActiveGame(result.game.code);
    isResuming = false;
    render();
  }
}

function render() {
  if (!game) {
    if (isResuming) {
      appRoot.innerHTML = `
        <section class="card hero-card">
          <p class="eyebrow">Forbinder igen</p>
          <h1>Genoptager spil…</h1>
          <p>Vi finder din spiller og din tidslinje.</p>
        </section>
      `;
      return;
    }
    renderHome();
    return;
  }

  const me = game.players.find((player) => player.id === myPlayerId);
  const isHost = game.hostId === myPlayerId;

  if (!me) {
    clearActiveGame();
    game = null;
    renderHome();
    return;
  }

  appRoot.innerHTML = `
    <section class="card hero-card">
      <p class="eyebrow">Spilkode</p>
      <h1>${escapeHtml(game.code)}</h1>
      <p>Del koden med de andre spillere.</p>
      ${socket.connected ? "" : '<p class="connection-warning" role="status">Forbindelsen er midlertidigt afbrudt. Vi prøver automatisk igen…</p>'}
    </section>

    ${renderPlayers()}

    ${!game.currentSong ? renderHostForm(isHost) : renderRound(me, isHost)}

    ${renderGameActions(isHost)}
  `;
}

function renderGameActions(isHost) {
  return `<details class="game-actions"><summary>Spilstyring</summary><div class="game-actions-buttons">${isHost
    ? '<button type="button" class="secondary" data-action="restartGame">Start forfra</button><button type="button" class="danger" data-action="endGame">Afslut spil</button>'
    : '<button type="button" class="danger" data-action="leaveGame">Forlad spillet</button>'}</div></details>`;
}

function renderHome() {
  appRoot.innerHTML = `
    <section class="card hero-card">
      <p class="eyebrow">Online musikquiz</p>
      <h1>Timeline Party</h1>
      <p>Lyt til sangen, gæt på din tur, og brug dine challenges på de helt rigtige tidspunkter.</p>
    </section>

    <section class="card">
      <h2>Start her</h2>
      <label for="player-name">Dit navn</label>
      <input id="player-name" value="${escapeHtml(myName)}" placeholder="Fx Alma">

      <button type="button" data-action="create">Opret nyt spil</button>

      <div class="divider"><span>eller</span></div>

      <label for="game-code">Spilkode</label>
      <input id="game-code" placeholder="Fx A1B2C" maxlength="5">
      <button type="button" class="secondary" data-action="join">Deltag i spil</button>
    </section>

    <section class="card help-card">
      <h2>Sådan virker MVP'en</h2>
      <ol>
        <li>Én spiller opretter et spil og bliver vært.</li>
        <li>Værten indtaster titel, kunstner, årstal og evt. et musiklink.</li>
        <li>Den aktive spiller vælger årti eller placerer sangen og låser sit svar.</li>
        <li>Andre kan challenge, hvorefter challengers svarer én ad gangen.</li>
      </ol>
    </section>
  `;
}

function renderPlayers() {
  const roundIsActive = Boolean(game.currentSong && !game.showAnswer);
  const responderId = game.phase === "active_guess"
    ? game.roundPlayerId
    : game.phase === "challenge_guesses" ? game.challengeQueue[game.challengeTurnIndex] : null;
  const decisions = game.challengeDecisions || {};

  return `
    <section class="card">
      <h2>Spillere</h2>
      ${game.players.map((player) => `
        <div class="player-row">
          <span>${escapeHtml(player.name)} ${player.id === game.hostId ? '<b class="badge">vært</b>' : ""} ${roundIsActive && player.id === responderId ? '<b class="badge turn-badge">Har tur</b>' : ""} ${player.connected ? "" : '<b class="offline-state">offline</b>'}</span>
          <span>
            ${roundIsActive && player.id === responderId ? '<b class="ready-state">Vælger…</b>' : ""}
            ${roundIsActive && player.ready ? '<b class="ready-state is-ready">Låst</b>' : ""}
            ${game.phase === "challenge_decisions" && game.challengeEligible.includes(player.id) && !decisions[player.id] ? '<b class="ready-state">Vælger challenge…</b>' : ""}
            <span class="player-score">${player.score} point</span>
            <span class="challenge-count">${player.challengesRemaining}/5 challenges tilbage</span>
          </span>
        </div>
      `).join("")}
    </section>
  `;
}

function renderHostForm(isHost) {
  if (!isHost) {
    return `
      <section class="card">
        <h2>Venter på sang</h2>
        <p>Værten vælger den næste sang om lidt.</p>
      </section>
    `;
  }

  return `
    <section class="card">
      <h2>Vælg næste sang</h2>
      <label for="song-title">Titel</label>
      <input id="song-title" placeholder="Dancing Queen">

      <label for="song-artist">Kunstner</label>
      <input id="song-artist" placeholder="ABBA">

      <label for="song-year">Årstal</label>
      <input id="song-year" type="number" placeholder="1976">

      <label for="song-url">Musiklink (valgfrit)</label>
      <input id="song-url" placeholder="Spotify, YouTube eller Apple Music">

      <button type="button" data-action="startSong">Start runde</button>
    </section>
  `;
}

function renderRound(me, isHost) {
  if (game.showAnswer) {
    return renderAnswer(isHost);
  }

  const responderId = game.phase === "active_guess"
    ? game.roundPlayerId
    : game.phase === "challenge_guesses" ? game.challengeQueue[game.challengeTurnIndex] : null;
  const isResponder = responderId === me.id;
  const active = game.players.find((player) => player.id === game.roundPlayerId);
  const alreadyChallenged = game.challengeQueue.includes(me.id);
  const challengeDecision = (game.challengeDecisions || {})[me.id];
  const mustChooseChallenge = game.phase === "challenge_decisions" && game.challengeEligible.includes(me.id) && !challengeDecision;

  return `
    <section class="card song-card">
      <p class="eyebrow">${escapeHtml(active && active.name)} har tur</p>
      <h2>${escapeHtml(game.currentSong.title)}</h2>
      <p>${escapeHtml(game.currentSong.artist)}</p>
      <a class="button-link" href="${escapeHtml(game.currentSong.url)}" target="_blank" rel="noreferrer">Åbn musik</a>
    </section>

    <section class="card">
      <h2>${isResponder ? (me.id === game.roundPlayerId ? "DIN TUR" : "DIN CHALLENGE-TUR") : "Rundestatus"}</h2>
      ${isResponder ? renderGuess(me) : mustChooseChallenge ? renderChallengeChoice(me) : renderWaiting(me, responderId)}
      ${alreadyChallenged && !me.ready && !isResponder ? '<p class="hint">Du har challenged. Vent på din tur i køen.</p>' : ""}
      ${isHost ? `<button type="button" data-action="revealSong" ${game.phase === "awaiting_reveal" ? "" : "disabled"}>${game.phase === "awaiting_reveal" ? "Afslør svar" : "Venter på låste svar…"}</button>` : ""}
    </section>
  `;
}

function renderChallengeChoice(player) {
  const roundPlayer = game.players.find((item) => item.id === game.roundPlayerId);
  const answerCount = roundPlayer.timeline.length === 0 ? 8 : roundPlayer.timeline.length + 1;
  const hasAvailableAnswer = game.challengeQueue.length + 1 < answerCount;
  return `
    <div class="challenge-choice">
      <p><strong>${game.players.find((item) => item.id === game.roundPlayerId).name}</strong> har låst sit svar. Vil du challenge?</p>
      <p class="hint">Du har ${player.challengesRemaining}/5 challenges tilbage.</p>
      <div class="choice-actions">
        <button type="button" class="challenge-button" data-action="challengeSong" ${player.challengesRemaining > 0 && hasAvailableAnswer ? "" : "disabled"}>${hasAvailableAnswer ? "Challenge" : "Ingen ledige placeringer"}</button>
        <button type="button" class="secondary" data-action="passChallenge">Nej tak / Pas</button>
      </div>
    </div>
  `;
}

function renderGuess(player) {
  if (player.ready) return '<div class="ready-message" role="status"><strong>Svaret er låst!</strong></div>';
  const roundPlayer = game.players.find((item) => item.id === game.roundPlayerId);
  const referenceTimeline = roundPlayer.timeline;
  const usesDecade = referenceTimeline.length === 0;
  if (!usesDecade) {
    const context = player.id === game.roundPlayerId ? "din tidslinje" : `${escapeHtml(roundPlayer.name)}s tidslinje`;
    return `${renderTimeline(referenceTimeline, player)}<p class="hint">Placér sangen på ${context}. Optagede placeringer kan ikke vælges.</p><button type="button" data-action="lockAnswer" ${Number.isInteger(player.selectedSlot) ? "" : "disabled"}>Lås svar</button>`;
  }
  const decades = [];
  for (let decade = 1950; decade <= 2020; decade += 10) {
    const selected = player.selectedDecade === decade;
    const owner = occupiedAnswerOwner("decade", decade, player.id);
    decades.push(`<button type="button" class="decade ${selected ? "selected" : ""} ${owner ? "occupied" : ""}" data-action="guessDecade" data-decade="${decade}" ${owner ? "disabled" : ""}>${decade}'erne${selected ? " ✓" : owner ? ` · ${escapeHtml(owner.name)}` : ""}</button>`);
  }
  return `<p class="hint">Den aktive tidslinje er tom. Vælg et ledigt årti.</p><div class="decades">${decades.join("")}</div><button type="button" data-action="lockAnswer" ${Number.isInteger(player.selectedDecade) ? "" : "disabled"}>Lås svar</button>`;
}

function occupiedAnswerOwner(type, value, excludedPlayerId) {
  const participantIds = new Set([game.roundPlayerId, ...game.challengeQueue]);
  return game.players.find((player) => player.id !== excludedPlayerId && participantIds.has(player.id) &&
    (type === "decade" ? player.selectedDecade === value : player.selectedSlot === value));
}

function renderWaiting(me, responderId) {
  if (game.phase === "awaiting_reveal") return '<p class="ready-message">Alle svar er låst. Værten kan afsløre sangen.</p>';
  if (game.phase === "challenge_decisions") return '<p class="hint">Venter på de andre spilleres challenge-valg…</p>';
  const responder = game.players.find((player) => player.id === responderId);
  if (me.ready) return '<p class="ready-message">Dit svar er låst.</p>';
  return `<p class="hint">Venter på ${escapeHtml(responder ? responder.name : "næste spiller")}…</p>`;
}

function renderTimeline(timeline, player) {
  const slots = [];

  for (let index = 0; index <= timeline.length; index += 1) {
    const isSelected = player.selectedSlot === index;
    const owner = occupiedAnswerOwner("slot", index, player.id);
    slots.push(`<button type="button" class="slot ${isSelected ? "selected" : ""} ${owner ? "occupied" : ""}" data-action="placeSong" data-slot="${index}" ${player.ready || owner ? "disabled" : ""}>${isSelected ? "Valgt ✓" : owner ? `[${escapeHtml(owner.name)}]` : "Placér her"}</button>`);

    if (index < timeline.length) {
      slots.push(`<div class="year">${timeline[index]}</div>`);
    }
  }

  return `<div class="timeline">${slots.join("")}</div>`;
}

function renderAnswer(isHost) {
  const participants = new Set([game.roundPlayerId, ...game.challengeQueue]);
  return `
    <section class="card answer-card">
      <p class="eyebrow">Svar</p>
      <h2>${escapeHtml(game.currentSong.title)} er fra ${game.currentSong.year}</h2>
      <p>${escapeHtml(game.currentSong.artist)}</p>
      ${game.players.filter((player) => participants.has(player.id)).map((player) => `
        <div class="player-row">
          <span>${player.lastGuessWasCorrect ? "✅" : "❌"} ${escapeHtml(player.name)}</span>
          <span>${player.score} point</span>
        </div>
      `).join("")}
      ${isHost ? `<button type="button" data-action="nextSong" ${nextSongPending ? "disabled" : ""}>${nextSongPending ? "Går videre…" : "Næste sang"}</button>` : ""}
    </section>
  `;
}

render();
