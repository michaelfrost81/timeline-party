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
    roundNumber: game.roundNumber,
    challengeQueue: [...game.challengeQueue], challengeTurnIndex: game.challengeTurnIndex,
    challengeEligible: [...game.challengeEligible],
    challengeDecisions: { ...game.challengeDecisions },
    players: game.players.map(({ socketId, ...player }) => player)
  };
}

function sendGame(game) { io.to(game.code).emit("game:update", publicGame(game)); }
function findPlayer(game, id) { return game.players.find((player) => player.id === id); }
function reply(done, result) { if (typeof done === "function") done(result); }

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

function activeTimeline(game) {
  return findPlayer(game, game.roundPlayerId).timeline;
}

function guessUsesDecade(game) {
  return activeTimeline(game).length === 0;
}

function occupiedBy(game, type, value, excludedPlayerId) {
  const participants = new Set([game.roundPlayerId, ...game.challengeQueue]);
  return game.players.find((player) =>
    player.id !== excludedPlayerId && participants.has(player.id) &&
    (type === "decade" ? player.selectedDecade === value : player.selectedSlot === value)
  );
}

function correctSlot(timeline, year) {
  const slot = timeline.findIndex((existingYear) => existingYear > year);
  return slot === -1 ? timeline.length : slot;
}

function insertChronologically(timeline, year) {
  timeline.splice(correctSlot(timeline, year), 0, year);
}

function restartGame(game) {
  game.currentSong = null; game.showAnswer = false;
  game.activePlayerId = game.players[0].id; game.roundPlayerId = null;
  game.phase = "lobby"; game.roundNumber = 0; game.lastAdvancedRound = null;
  game.challengeQueue = []; game.challengeTurnIndex = 0;
  game.challengeEligible = []; game.challengeDecisions = {};
  game.players.forEach((player) => {
    player.score = 0; player.timeline = []; player.turnsTaken = 0;
    player.challengesRemaining = 5; player.selectedSlot = null;
    player.selectedDecade = null; player.ready = false; player.lastGuessWasCorrect = null;
  });
}

function clearRound(game) {
  game.currentSong = null; game.showAnswer = false; game.roundPlayerId = null;
  game.phase = "lobby"; game.challengeQueue = []; game.challengeTurnIndex = 0;
  game.challengeEligible = []; game.challengeDecisions = {};
  game.players.forEach((player) => {
    player.selectedSlot = null; player.selectedDecade = null;
    player.ready = false; player.lastGuessWasCorrect = null;
  });
}

function removePlayer(game, playerId) {
  const playerIndex = game.players.findIndex((player) => player.id === playerId);
  if (playerIndex < 0) return;
  const wasRoundPlayer = game.roundPlayerId === playerId;
  const nextPlayer = game.players[(playerIndex + 1) % game.players.length];
  const queueIndex = game.challengeQueue.indexOf(playerId);
  game.players.splice(playerIndex, 1);
  game.challengeEligible = game.challengeEligible.filter((id) => id !== playerId);
  delete game.challengeDecisions[playerId];
  if (queueIndex >= 0) {
    game.challengeQueue.splice(queueIndex, 1);
    if (queueIndex < game.challengeTurnIndex) game.challengeTurnIndex -= 1;
  }
  if (wasRoundPlayer) {
    game.activePlayerId = nextPlayer && nextPlayer.id;
    clearRound(game);
    return;
  }
  if (game.activePlayerId === playerId) game.activePlayerId = nextPlayer && nextPlayer.id;
  if (game.phase === "challenge_decisions") finishChallengeDecisions(game);
  if (game.phase === "challenge_guesses" && game.challengeTurnIndex >= game.challengeQueue.length) game.phase = "awaiting_reveal";
}

function advanceGuessPhase(game) {
  if (game.phase === "active_guess") {
    game.challengeEligible = game.players
      .filter((player) => player.id !== game.roundPlayerId && player.connected)
      .map((player) => player.id);
    game.challengeDecisions = {};
    game.phase = game.challengeEligible.length ? "challenge_decisions" : "awaiting_reveal";
    game.challengeTurnIndex = 0;
  } else if (game.phase === "challenge_guesses") {
    game.challengeTurnIndex += 1;
    if (game.challengeTurnIndex >= game.challengeQueue.length) game.phase = "awaiting_reveal";
  }
}

function finishChallengeDecisions(game) {
  const allDecided = game.challengeEligible.every((id) => game.challengeDecisions[id]);
  if (!allDecided) return;
  game.challengeTurnIndex = 0;
  game.phase = game.challengeQueue.length ? "challenge_guesses" : "awaiting_reveal";
}

function selectGuess(socket, details, done, type) {
  const game = games.get(details.code);
  const player = currentPlayer(socket, game);
  if (!game || !player || !game.currentSong || game.showAnswer || expectedResponder(game) !== player.id || player.ready) {
    reply(done, { ok: false, message: "Det er ikke din tur til at vælge et svar." });
    return;
  }

  if (guessUsesDecade(game)) {
    const decade = Number(details.decade);
    if (type !== "decade" || !Number.isInteger(decade) || decade % 10 !== 0) {
      reply(done, { ok: false, message: "Vælg et gyldigt årti." });
      return;
    }
    const owner = occupiedBy(game, "decade", decade, player.id);
    if (owner) {
      reply(done, { ok: false, message: `${owner.name} har allerede valgt dette årti.` });
      return;
    }
    player.selectedDecade = decade;
  } else {
    const slot = Number(details.slot);
    if (type !== "place" || !Number.isInteger(slot) || slot < 0 || slot > activeTimeline(game).length) {
      reply(done, { ok: false, message: "Vælg en gyldig plads på tidslinjen." });
      return;
    }
    const owner = occupiedBy(game, "slot", slot, player.id);
    if (owner) {
      reply(done, { ok: false, message: `${owner.name} har allerede valgt denne placering.` });
      return;
    }
    player.selectedSlot = slot;
  }
  reply(done, { ok: true, game: publicGame(game) });
  sendGame(game);
}

function lockGuess(socket, code, done) {
  const game = games.get(code);
  const player = currentPlayer(socket, game);
  if (!game || !player || !game.currentSong || game.showAnswer || expectedResponder(game) !== player.id || player.ready) {
    return reply(done, { ok: false, message: "Det er ikke din tur til at låse et svar." });
  }
  const usesDecade = guessUsesDecade(game);
  const hasAnswer = usesDecade
    ? Number.isInteger(player.selectedDecade)
    : Number.isInteger(player.selectedSlot);
  if (!hasAnswer) return reply(done, { ok: false, message: "Vælg et svar, før du låser." });
  const value = usesDecade ? player.selectedDecade : player.selectedSlot;
  if (occupiedBy(game, usesDecade ? "decade" : "slot", value, player.id)) {
    return reply(done, { ok: false, message: "Placeringen er allerede optaget. Vælg en anden." });
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
      roundNumber: 0, lastAdvancedRound: null,
      challengeQueue: [], challengeTurnIndex: 0,
      challengeEligible: [], challengeDecisions: {}, players: [player]
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
    game.roundNumber += 1;
    game.showAnswer = false;
    game.roundPlayerId = game.activePlayerId;
    game.phase = "active_guess";
    game.challengeQueue = [];
    game.challengeTurnIndex = 0;
    game.challengeEligible = [];
    game.challengeDecisions = {};
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
    if (player && player.challengesRemaining <= 0) return reply(done, { ok: false, message: "Du har brugt alle 5 challenges." });
    if (!game || !player || game.phase !== "challenge_decisions" || !game.challengeEligible.includes(player.id)) {
      return reply(done, { ok: false, message: "Der er lukket for challenges." });
    }
    if (game.challengeDecisions[player.id]) return reply(done, { ok: false, message: "Du har allerede valgt i denne runde." });
    const answerCount = guessUsesDecade(game) ? 8 : activeTimeline(game).length + 1;
    if (game.challengeQueue.length + 1 >= answerCount) {
      return reply(done, { ok: false, message: "Alle mulige placeringer er allerede reserveret." });
    }
    player.challengesRemaining -= 1;
    game.challengeQueue.push(player.id);
    game.challengeDecisions[player.id] = "challenge";
    finishChallengeDecisions(game);
    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("song:pass", (code, done) => {
    const game = games.get(code);
    const player = currentPlayer(socket, game);
    if (!game || !player || game.phase !== "challenge_decisions" ||
        !game.challengeEligible.includes(player.id) || game.challengeDecisions[player.id]) {
      return reply(done, { ok: false, message: "Du kan ikke passe lige nu." });
    }
    game.challengeDecisions[player.id] = "pass";
    finishChallengeDecisions(game);
    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("song:place", (details, done) => selectGuess(socket, details, done, "place"));
  socket.on("song:decade", (details, done) => selectGuess(socket, details, done, "decade"));
  socket.on("song:lock", (code, done) => lockGuess(socket, code, done));

  socket.on("song:reveal", (code, done) => {
    const game = games.get(code);
    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game) || game.phase !== "awaiting_reveal") {
      return reply(done, { ok: false, message: "Svaret kan ikke afsløres endnu." });
    }
    game.showAnswer = true;
    game.phase = "revealed";
    const participants = [game.roundPlayerId, ...game.challengeQueue];
    const referenceTimeline = [...activeTimeline(game)];
    const usesDecade = referenceTimeline.length === 0;
    participants.forEach((id) => {
      const player = findPlayer(game, id);
      const correct = usesDecade
        ? player.selectedDecade === Math.floor(game.currentSong.year / 10) * 10
        : player.selectedSlot === correctSlot(referenceTimeline, game.currentSong.year);
      player.lastGuessWasCorrect = correct;
      if (correct) {
        player.score += 1;
        insertChronologically(player.timeline, game.currentSong.year);
      }
    });
    findPlayer(game, game.roundPlayerId).turnsTaken += 1;
    const activeIndex = game.players.findIndex((player) => player.id === game.roundPlayerId);
    game.activePlayerId = game.players[(activeIndex + 1) % game.players.length].id;
    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("song:next", (details, done) => {
    const code = typeof details === "string" ? details : details && details.code;
    const requestedRound = details && typeof details === "object" ? details.roundNumber : null;
    const game = games.get(code);
    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game)) {
      return reply(done, { ok: false, message: "Kun værten kan gå videre til næste sang." });
    }
    // A double tap or a delayed acknowledgement may repeat the same command.
    // Treat it as successful instead of showing an incorrect not-revealed error.
    if (!game.currentSong && requestedRound === game.lastAdvancedRound) {
      return reply(done, { ok: true, game: publicGame(game) });
    }
    if (!game.showAnswer && game.phase !== "revealed") {
      return reply(done, { ok: false, message: "Næste runde kan først startes, når svaret er afsløret." });
    }
    game.lastAdvancedRound = game.roundNumber;
    game.currentSong = null; game.showAnswer = false; game.roundPlayerId = null; game.phase = "lobby";
    game.challengeQueue = []; game.challengeTurnIndex = 0;
    game.challengeEligible = []; game.challengeDecisions = {};
    game.players.forEach((player) => {
      player.selectedSlot = null; player.selectedDecade = null;
      player.ready = false; player.lastGuessWasCorrect = null;
    });
    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("game:restart", (code, done) => {
    const game = games.get(code);
    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game)) {
      return reply(done, { ok: false, message: "Kun værten kan starte spillet forfra." });
    }
    restartGame(game);
    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("game:leave", (code, done) => {
    const game = games.get(code);
    const player = currentPlayer(socket, game);
    if (!game || !player || player.id === game.hostId) return reply(done, { ok: false, message: "Kun deltagere kan forlade spillet. Værten kan afslutte det." });
    removePlayer(game, player.id);
    socket.leave(game.code); socket.data.gameCode = null; socket.data.playerId = null;
    reply(done, { ok: true });
    sendGame(game);
  });

  socket.on("game:end", (code, done) => {
    const game = games.get(code);
    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game)) return reply(done, { ok: false, message: "Kun værten kan afslutte spillet." });
    const roomSockets = io.sockets.adapter.rooms.get(game.code);
    io.to(game.code).emit("game:ended", { message: "Værten har afsluttet spillet." });
    if (roomSockets) for (const socketId of [...roomSockets]) {
      const participantSocket = io.sockets.sockets.get(socketId);
      if (participantSocket) {
        participantSocket.leave(game.code); participantSocket.data.gameCode = null; participantSocket.data.playerId = null;
      }
    }
    cancelCleanup(game.code); games.delete(game.code);
    reply(done, { ok: true });
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
