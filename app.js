const socket = io();
const appRoot = document.querySelector("#app");

let game = null;
let myName = localStorage.getItem("timeline-party-name") || "";
let activeGameCode = localStorage.getItem("timeline-party-game-code") || "";
const myPlayerId = getOrCreatePlayerId();
let isResuming = Boolean(activeGameCode);
let nextSongPending = false;
let viewedTimelinePlayerId = null;

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

socket.on("game:ended", () => leaveGameView("Værten har afsluttet spillet."));

socket.on("game:update", (nextGame) => {
  game = nextGame;
  nextSongPending = false;
  saveActiveGame(nextGame.code);
  isResuming = false;
  render();
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
    endGame,
    viewTimeline: () => viewTimeline(button.dataset.playerId),
    closeTimeline
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
  if (!confirm("Vil du starte spillet forfra? Point, tidslinjer og challenges nulstilles.")) return;
  socket.emit("game:restart", game.code, showServerMessage);
}

function leaveGame() {
  if (!confirm("Vil du forlade spillet?")) return;
  socket.emit("game:leave", game.code, (result) => {
    if (result && result.ok) leaveGameView();
    else showServerMessage(result);
  });
}

function endGame() {
  if (!confirm("Vil du afslutte spillet for alle spillere?")) return;
  socket.emit("game:end", game.code, (result) => {
    if (result && result.ok) leaveGameView();
    else showServerMessage(result);
  });
}

function viewTimeline(playerId) {
  viewedTimelinePlayerId = playerId;
  render();
}

function closeTimeline() {
  viewedTimelinePlayerId = null;
  render();
}

function leaveGameView(message) {
  clearActiveGame();
  game = null;
  isResuming = false;
  if (message) alert(message);
  render();
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
  return `
    <section class="card game-actions">
      <h2>Spilmenu</h2>
      ${isHost ? '<button type="button" class="secondary" data-action="restartGame">Start forfra</button>' : ""}
      ${isHost
        ? '<button type="button" class="danger" data-action="endGame">Afslut spil</button>'
        : '<button type="button" class="danger" data-action="leaveGame">Forlad spillet</button>'}
    </section>
  `;
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
      ${isResponder ? renderGuess(me, active) : mustChooseChallenge ? renderChallengeChoice(me) : renderWaiting(me, responderId)}
      ${alreadyChallenged && !me.ready && !isResponder ? '<p class="hint">Du har challenged. Vent på din tur i køen.</p>' : ""}
      ${isHost ? `<button type="button" data-action="revealSong" ${game.phase === "awaiting_reveal" ? "" : "disabled"}>${game.phase === "awaiting_reveal" ? "Afslør svar" : "Venter på låste svar…"}</button>` : ""}
    </section>
  `;
}

function renderChallengeChoice(player) {
  return `
    <div class="challenge-choice">
      <p><strong>${game.players.find((item) => item.id === game.roundPlayerId).name}</strong> har låst sit svar. Vil du challenge?</p>
      <p class="hint">Du har ${player.challengesRemaining}/5 challenges tilbage.</p>
      <div class="choice-actions">
        <button type="button" class="challenge-button" data-action="challengeSong" ${player.challengesRemaining > 0 ? "" : "disabled"}>Challenge</button>
        <button type="button" class="secondary" data-action="passChallenge">Nej tak / Pas</button>
      </div>
    </div>
  `;
}

function renderGuess(player, activePlayer) {
  if (player.ready) return '<div class="ready-message" role="status"><strong>Svaret er låst!</strong></div>';
  const referenceTimeline = activePlayer.timeline;
  const usesDecade = referenceTimeline.length === 0;
  const occupiedAnswers = new Set(game.players
    .filter((other) => other.id !== player.id && other.ready)
    .map((other) => usesDecade ? other.selectedDecade : other.selectedSlot));
  if (!usesDecade) {
    return `${renderTimeline(referenceTimeline, player, occupiedAnswers)}<p class="hint">Placér sangen ud fra ${escapeHtml(activePlayer.name)}s tidslinje. Grå placeringer er optaget.</p><button type="button" data-action="lockAnswer" ${Number.isInteger(player.selectedSlot) ? "" : "disabled"}>Lås svar</button>`;
  }
  const decades = [];
  for (let decade = 1950; decade <= 2020; decade += 10) {
    const selected = player.selectedDecade === decade;
    const occupied = occupiedAnswers.has(decade);
    decades.push(`<button type="button" class="decade ${selected ? "selected" : ""} ${occupied ? "occupied" : ""}" data-action="guessDecade" data-decade="${decade}" ${occupied ? "disabled" : ""}>${decade}'erne${selected ? " ✓" : occupied ? " · Optaget" : ""}</button>`);
  }
  return `<p class="hint">Den aktive spillers tidslinje er tom. Vælg hvilket årti sangen er fra.</p><div class="decades">${decades.join("")}</div><button type="button" data-action="lockAnswer" ${Number.isInteger(player.selectedDecade) ? "" : "disabled"}>Lås svar</button>`;
}

function renderWaiting(me, responderId) {
  if (game.phase === "awaiting_reveal") return '<p class="ready-message">Alle svar er låst. Værten kan afsløre sangen.</p>';
  if (game.phase === "challenge_decisions") return '<p class="hint">Venter på de andre spilleres challenge-valg…</p>';
  const responder = game.players.find((player) => player.id === responderId);
  if (me.ready) return '<p class="ready-message">Dit svar er låst.</p>';
  const offlineWait = responder && !responder.connected && game.offlineActionDeadlines && game.offlineActionDeadlines[responder.id];
  return `<p class="hint">Venter på ${escapeHtml(responder ? responder.name : "næste spiller")}…${offlineWait ? " Spilleren er offline og har op til 60 sekunder til at vende tilbage." : ""}</p>`;
}

function renderTimeline(timeline, player, occupiedAnswers) {
  const slots = [];

  for (let index = 0; index <= timeline.length; index += 1) {
    const isSelected = player.selectedSlot === index;
    const occupied = occupiedAnswers.has(index);
    slots.push(`<button type="button" class="slot ${isSelected ? "selected" : ""} ${occupied ? "occupied" : ""}" data-action="placeSong" data-slot="${index}" ${player.ready || occupied ? "disabled" : ""}>${isSelected ? "Valgt ✓" : occupied ? "Optaget" : "Placér her"}</button>`);

    if (index < timeline.length) {
      slots.push(`<div class="year">${timeline[index]}</div>`);
    }
  }

  return `<div class="timeline">${slots.join("")}</div>`;
}

function renderAnswer(isHost) {
  const participants = new Set([game.roundPlayerId, ...game.challengeQueue]);
  const viewedPlayer = game.players.find((player) => player.id === viewedTimelinePlayerId);
  return `
    <section class="card answer-card">
      <p class="eyebrow">Svar</p>
      <h2>${escapeHtml(game.currentSong.title)} er fra ${game.currentSong.year}</h2>
      <p>${escapeHtml(game.currentSong.artist)}</p>
      ${game.players.filter((player) => participants.has(player.id)).map((player) => `
        <div class="player-row">
          <button type="button" class="player-timeline-button" data-action="viewTimeline" data-player-id="${escapeHtml(player.id)}">${player.lastGuessWasCorrect ? "✅" : "❌"} ${escapeHtml(player.name)} · Se tidslinje</button>
          <span>${player.score} point</span>
        </div>
      `).join("")}
      ${isHost ? `<button type="button" data-action="nextSong" ${nextSongPending ? "disabled" : ""}>${nextSongPending ? "Går videre…" : "Næste sang"}</button>` : ""}
    </section>
    ${viewedPlayer ? renderTimelineDialog(viewedPlayer) : ""}
  `;
}

function renderTimelineDialog(player) {
  return `
    <div class="modal-backdrop" role="presentation">
      <section class="timeline-dialog" role="dialog" aria-modal="true" aria-labelledby="timeline-dialog-title">
        <h2 id="timeline-dialog-title">${escapeHtml(player.name)}s tidslinje</h2>
        ${player.timeline.length
          ? `<ol class="timeline-years">${player.timeline.map((year) => `<li>${year}</li>`).join("")}</ol>`
          : '<p class="hint">Ingen sange endnu</p>'}
        <button type="button" class="secondary" data-action="closeTimeline">Luk</button>
      </section>
    </div>
  `;
}

render();
