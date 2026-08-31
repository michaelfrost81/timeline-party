const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 10000;
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 24 * 60 * 60 * 1000;
const games = new Map();
const cleanupTimers = new Map();

app.use(express.static(__dirname));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "index.html")));

function createCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function newPlayer(id, socketId, name) {
  return {
    id, socketId, connected: true, name: name || "Spiller", score: 0,
    timeline: [], turnsTaken: 0, challengesRemaining: 5, selectedSlot: null,
    selectedDecade: null, ready: false, lastGuessWasCorrect: null
  };
}

function publicGame(game) {
  return {
    code: game.code, hostId: game.hostId, currentSong: game.currentSong,
    showAnswer: game.showAnswer, activePlayerId: game.activePlayerId,
    roundPlayerId: game.roundPlayerId, phase: game.phase,
    challengeQueue: [...game.challengeQueue], challengeTurnIndex: game.challengeTurnIndex,
    players: game.players.map(({ socketId, ...player }) => player)
  };
}

function sendGame(game) { io.to(game.code).emit("game:update", publicGame(game)); }
function findPlayer(game, id) { return game.players.find((player) => player.id === id); }
function reply(done, result) { if (typeof done === "function") done(result); }

function placementIsCorrect(timeline, year, slot) {
  const left = slot === 0 ? -Infinity : timeline[slot - 1];
  const right = slot === timeline.length ? Infinity : timeline[slot];
  return left <= year && year <= right;
}

function cancelCleanup(code) {
  const timer = cleanupTimers.get(code);
  if (timer) clearTimeout(timer);
  cleanupTimers.delete(code);
}

function scheduleCleanup(game) {
  cancelCleanup(game.code);
  if (game.players.some((player) => player.connected)) return;
  const timer = setTimeout(() => {
    const current = games.get(game.code);
    if (current && current.players.every((player) => !player.connected)) games.delete(game.code);
    cleanupTimers.delete(game.code);
  }, SESSION_TTL_MS);
  timer.unref();
  cleanupTimers.set(game.code, timer);
}

function connectPlayer(socket, game, player) {
  player.socketId = socket.id;
  player.connected = true;
  socket.data.gameCode = game.code;
  socket.data.playerId = player.id;
  socket.join(game.code);
  cancelCleanup(game.code);
}

function currentPlayer(socket, game) {
  const player = game && findPlayer(game, socket.data.playerId);
  return player && player.socketId === socket.id ? player : null;
}

function expectedResponder(game) {
  if (game.phase === "active_guess") return game.roundPlayerId;
  if (game.phase === "challenge_guesses") return game.challengeQueue[game.challengeTurnIndex];
  return null;
}

function guessUsesDecade(game, player) {
  return player.id === game.roundPlayerId ? player.turnsTaken === 0 : player.timeline.length === 0;
}

function advanceGuessPhase(game) {
  if (game.phase === "active_guess") {
    game.phase = game.challengeQueue.length ? "challenge_guesses" : "awaiting_reveal";
    game.challengeTurnIndex = 0;
  } else if (game.phase === "challenge_guesses") {
    game.challengeTurnIndex += 1;
    if (game.challengeTurnIndex >= game.challengeQueue.length) game.phase = "awaiting_reveal";
  }
}

function lockGuess(socket, details, done, type) {
  const game = games.get(details.code);
  const player = currentPlayer(socket, game);
  if (!game || !player || !game.currentSong || game.showAnswer || expectedResponder(game) !== player.id || player.ready) {
    reply(done, { ok: false, message: "Det er ikke din tur til at låse et svar." });
    return;
  }

  if (guessUsesDecade(game, player)) {
    const decade = Number(details.decade);
    if (type !== "decade" || !Number.isInteger(decade) || decade % 10 !== 0) {
      reply(done, { ok: false, message: "Vælg et gyldigt årti." });
      return;
    }
    player.selectedDecade = decade;
  } else {
    const slot = Number(details.slot);
    if (type !== "place" || !Number.isInteger(slot) || slot < 0 || slot > player.timeline.length) {
      reply(done, { ok: false, message: "Vælg en gyldig plads på tidslinjen." });
      return;
    }
    player.selectedSlot = slot;
  }
  player.ready = true;
  advanceGuessPhase(game);
  reply(done, { ok: true, game: publicGame(game) });
  sendGame(game);
}

io.on("connection", (socket) => {
  socket.on("game:create", (details, done) => {
    const playerId = details && details.playerId;
    if (!playerId) return reply(done, { ok: false, message: "Spillersessionen kunne ikke oprettes. Genindlæs siden." });
    let code = createCode();
    while (games.has(code)) code = createCode();
    const player = newPlayer(playerId, socket.id, details.playerName || "Vært");
    const game = {
      code, hostId: playerId, currentSong: null, showAnswer: false,
      activePlayerId: playerId, roundPlayerId: null, phase: "lobby",
      challengeQueue: [], challengeTurnIndex: 0, players: [player]
    };
    games.set(code, game);
    connectPlayer(socket, game, player);
    reply(done, { ok: true, code, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("game:join", ({ code, playerName, playerId }, done) => {
    const game = games.get(String(code || "").toUpperCase());
    if (!game) return reply(done, { ok: false, message: "Spillet findes ikke. Tjek koden og prøv igen." });
    if (!playerId) return reply(done, { ok: false, message: "Spillersessionen kunne ikke oprettes. Genindlæs siden." });
    let player = findPlayer(game, playerId);
    if (!player) {
      player = newPlayer(playerId, socket.id, playerName);
      game.players.push(player);
    }
    connectPlayer(socket, game, player);
    reply(done, { ok: true, code: game.code, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("game:resume", ({ code, playerId }, done) => {
    const game = games.get(String(code || "").toUpperCase());
    const player = game && findPlayer(game, playerId);
    if (!game || !player) return reply(done, { ok: false, message: "Den gemte spilsession findes ikke længere." });
    connectPlayer(socket, game, player);
    reply(done, { ok: true, code: game.code, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("song:start", ({ code, title, artist, year, url }, done) => {
    const game = games.get(code);
    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game) || game.currentSong) {
      return reply(done, { ok: false, message: "Kun værten kan starte en ny runde." });
    }
    const songYear = Number(year);
    if (!title || !artist || !Number.isInteger(songYear)) return reply(done, { ok: false, message: "Udfyld titel, kunstner og årstal." });
    game.currentSong = { title, artist, year: songYear, url: url || `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}` };
    game.showAnswer = false;
    game.roundPlayerId = game.activePlayerId;
    game.phase = "active_guess";
    game.challengeQueue = [];
    game.challengeTurnIndex = 0;
    game.players.forEach((player) => {
      player.selectedSlot = null; player.selectedDecade = null;
      player.ready = false; player.lastGuessWasCorrect = null;
    });
    reply(done, { ok: true });
    sendGame(game);
  });

  socket.on("song:challenge", (code, done) => {
    const game = games.get(code);
    const player = currentPlayer(socket, game);
    const active = game && findPlayer(game, game.roundPlayerId);
    if (player && player.challengesRemaining <= 0) return reply(done, { ok: false, message: "Du har brugt alle 5 challenges." });
    if (!game || !player || game.phase !== "active_guess" || !active || active.ready || player.id === active.id) {
      return reply(done, { ok: false, message: "Der er lukket for challenges." });
    }
    if (game.challengeQueue.includes(player.id)) return reply(done, { ok: false, message: "Du har allerede challenged denne sang." });
    player.challengesRemaining -= 1;
    game.challengeQueue.push(player.id);
    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("song:place", (details, done) => lockGuess(socket, details, done, "place"));
  socket.on("song:decade", (details, done) => lockGuess(socket, details, done, "decade"));

  socket.on("song:reveal", (code, done) => {
    const game = games.get(code);
    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game) || game.phase !== "awaiting_reveal") {
      return reply(done, { ok: false, message: "Svaret kan ikke afsløres endnu." });
    }
    game.showAnswer = true;
    game.phase = "revealed";
    const participants = [game.roundPlayerId, ...game.challengeQueue];
    participants.forEach((id) => {
      const player = findPlayer(game, id);
      const usesDecade = guessUsesDecade(game, player);
      const correct = usesDecade
        ? player.selectedDecade === Math.floor(game.currentSong.year / 10) * 10
        : placementIsCorrect(player.timeline, game.currentSong.year, player.selectedSlot);
      player.lastGuessWasCorrect = correct;
      if (correct) {
        player.score += 1;
        const insertion = usesDecade ? 0 : player.selectedSlot;
        player.timeline.splice(insertion, 0, game.currentSong.year);
      }
    });
    findPlayer(game, game.roundPlayerId).turnsTaken += 1;
    const activeIndex = game.players.findIndex((player) => player.id === game.roundPlayerId);
    game.activePlayerId = game.players[(activeIndex + 1) % game.players.length].id;
    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("song:next", (code, done) => {
    const game = games.get(code);
    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game) || game.phase !== "revealed") {
      return reply(done, { ok: false, message: "Næste runde kan først startes, når svaret er afsløret." });
    }
    game.currentSong = null; game.showAnswer = false; game.roundPlayerId = null; game.phase = "lobby";
    game.challengeQueue = []; game.challengeTurnIndex = 0;
    game.players.forEach((player) => {
      player.selectedSlot = null; player.selectedDecade = null;
      player.ready = false; player.lastGuessWasCorrect = null;
    });
    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("disconnect", () => {
    const game = games.get(socket.data.gameCode);
    const player = game && findPlayer(game, socket.data.playerId);
    if (!game || !player || player.socketId !== socket.id) return;
    player.connected = false; player.socketId = null;
    sendGame(game); scheduleCleanup(game);
  });
});

server.listen(PORT, () => console.log(`Timeline Party kører på http://localhost:${PORT}`));
