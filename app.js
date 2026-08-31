const socket = io();
const appRoot = document.querySelector("#app");

let game = null;
let myName = localStorage.getItem("timeline-party-name") || "";
let activeGameCode = localStorage.getItem("timeline-party-game-code") || "";
const myPlayerId = getOrCreatePlayerId();
let isResuming = Boolean(activeGameCode);

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
    revealSong,
    nextSong
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

function revealSong() {
  socket.emit("song:reveal", game.code, showServerMessage);
}

function nextSong() {
  socket.emit("song:next", game.code, showServerMessage);
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
  `;
}

function renderHome() {
  appRoot.innerHTML = `
    <section class="card hero-card">
      <p class="eyebrow">Online musikquiz</p>
      <h1>Timeline Party</h1>
      <p>En helt simpel første version: lyt til en sang, gæt hvor den passer på din tidslinje, og se hvem der får flest point.</p>
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
        <li>Alle placerer sangen på deres egen tidslinje.</li>
        <li>Værten afslører svaret, og korrekte gæt giver 1 point.</li>
      </ol>
    </section>
  `;
}

function renderPlayers() {
  const roundIsActive = Boolean(game.currentSong && !game.showAnswer);

  return `
    <section class="card">
      <h2>Spillere</h2>
      ${game.players.map((player) => `
        <div class="player-row">
          <span>${escapeHtml(player.name)} ${player.id === game.hostId ? '<b class="badge">vært</b>' : ""} ${player.connected ? "" : '<b class="offline-state">offline</b>'}</span>
          <span>
            ${roundIsActive ? `<b class="ready-state ${player.ready ? "is-ready" : ""}">${player.ready ? "Klar" : "Vælger…"}</b>` : ""}
            ${player.score} point
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

  const allPlayersReady = game.players.every((player) => player.ready);

  return `
    <section class="card song-card">
      <p class="eyebrow">Aktuel sang</p>
      <h2>${escapeHtml(game.currentSong.title)}</h2>
      <p>${escapeHtml(game.currentSong.artist)}</p>
      <a class="button-link" href="${escapeHtml(game.currentSong.url)}" target="_blank" rel="noreferrer">Åbn musik</a>
    </section>

    <section class="card">
      <h2>Din tidslinje</h2>
      ${renderTimeline(me)}
      ${me.ready
        ? '<div class="ready-message" role="status"><strong>Du er klar!</strong> Venter på de andre…</div>'
        : '<p class="hint">Vælg hvor sangens årstal passer ind.</p>'}
      ${isHost ? `<button type="button" data-action="revealSong" ${allPlayersReady ? "" : "disabled"}>${allPlayersReady ? "Afslør svar" : "Venter på alle spillere…"}</button>` : ""}
    </section>
  `;
}

function renderTimeline(player) {
  const timeline = player.timeline;
  const slots = [];

  for (let index = 0; index <= timeline.length; index += 1) {
    const isSelected = player.selectedSlot === index;
    slots.push(`<button type="button" class="slot ${isSelected ? "selected" : ""}" data-action="placeSong" data-slot="${index}" ${player.ready ? "disabled" : ""}>${isSelected ? "Valgt ✓" : "Placér her"}</button>`);

    if (index < timeline.length) {
      slots.push(`<div class="year">${timeline[index]}</div>`);
    }
  }

  return `<div class="timeline">${slots.join("")}</div>`;
}

function renderAnswer(isHost) {
  return `
    <section class="card answer-card">
      <p class="eyebrow">Svar</p>
      <h2>${escapeHtml(game.currentSong.title)} er fra ${game.currentSong.year}</h2>
      <p>${escapeHtml(game.currentSong.artist)}</p>
      ${game.players.map((player) => `
        <div class="player-row">
          <span>${player.lastGuessWasCorrect ? "✅" : "❌"} ${escapeHtml(player.name)}</span>
          <span>${player.score} point</span>
        </div>
      `).join("")}
      ${isHost ? '<button type="button" data-action="nextSong">Næste sang</button>' : ""}
    </section>
  `;
}

render();
