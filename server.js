const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 10000;
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 24 * 60 * 60 * 1000;
const OFFLINE_ACTION_TIMEOUT_MS = Number(process.env.OFFLINE_ACTION_TIMEOUT_MS) || 60 * 1000;
const DECADE_OPTIONS = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];
const games = new Map();
const cleanupTimers = new Map();
const actionTimers = new Map();

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
    offlineActionDeadlines: { ...game.offlineActionDeadlines },
    players: game.players.map(({ socketId, ...player }) => player)
  };
}

function sendGame(game) {
  syncOfflineActionTimers(game);
  io.to(game.code).emit("game:update", publicGame(game));
}
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

function clearGameActionTimers(game) {
  for (const [key, timer] of actionTimers) {
    if (key.startsWith(`${game.code}:`)) {
      clearTimeout(timer);
      actionTimers.delete(key);
    }
  }
  game.offlineActionDeadlines = {};
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

function actionTimerKey(game, playerId) {
  return `${game.code}:${game.roundNumber}:${playerId}`;
}

function playersAwaitingAction(game) {
  if (game.phase === "challenge_decisions") {
    return game.challengeEligible.filter((id) => !game.challengeDecisions[id]);
  }
  const responder = expectedResponder(game);
  return responder ? [responder] : [];
}

function clearActionTimer(game, playerId) {
  const key = actionTimerKey(game, playerId);
  const timer = actionTimers.get(key);
  if (timer) clearTimeout(timer);
  actionTimers.delete(key);
  delete game.offlineActionDeadlines[playerId];
}

function handleOfflineActionTimeout(game, playerId) {
  actionTimers.delete(actionTimerKey(game, playerId));
  delete game.offlineActionDeadlines[playerId];
  const player = findPlayer(game, playerId);
  if (!games.has(game.code) || !player || !playersAwaitingAction(game).includes(playerId)) return;

  if (game.phase === "challenge_decisions") {
    game.challengeDecisions[playerId] = "pass";
    finishChallengeDecisions(game);
  } else {
    player.ready = true;
    player.lastGuessWasCorrect = false;
    advanceGuessPhase(game);
  }
  sendGame(game);
}

function syncOfflineActionTimers(game) {
  const awaiting = new Set(playersAwaitingAction(game));
  Object.keys(game.offlineActionDeadlines).forEach((id) => {
    if (!awaiting.has(id)) clearActionTimer(game, id);
  });
  awaiting.forEach((id) => {
    const player = findPlayer(game, id);
    if (!player || player.connected || game.offlineActionDeadlines[id]) return;
    const deadline = Date.now() + OFFLINE_ACTION_TIMEOUT_MS;
    game.offlineActionDeadlines[id] = deadline;
    const timer = setTimeout(() => handleOfflineActionTimeout(game, id), OFFLINE_ACTION_TIMEOUT_MS);
    timer.unref();
    actionTimers.set(actionTimerKey(game, id), timer);
  });
}

function answerIsOccupied(game, player, type, value) {
  return game.players.some((other) => other.id !== player.id && other.ready && (
    type === "decade" ? other.selectedDecade === value : other.selectedSlot === value
  ));
}

function availableChallengeAnswerCount(game) {
  const usesDecade = guessUsesDecade(game);
  const occupied = new Set(game.players
    .filter((player) => player.ready)
    .map((player) => usesDecade ? player.selectedDecade : player.selectedSlot)
    .filter(Number.isInteger));
  const reserved = game.challengeQueue.filter((id) => {
    const player = findPlayer(game, id);
    return player && !player.ready;
  }).length;
  const optionCount = usesDecade ? DECADE_OPTIONS.length : roundTimeline(game).length + 1;
  return Math.max(0, optionCount - occupied.size - reserved);
}

function passPlayersWhenNoChallengeAnswerRemains(game) {
  if (game.phase !== "challenge_decisions" || availableChallengeAnswerCount(game) > 0) return;
  game.challengeEligible.forEach((id) => {
    if (!game.challengeDecisions[id]) game.challengeDecisions[id] = "pass";
  });
}

function roundTimeline(game) {
  const roundPlayer = findPlayer(game, game.roundPlayerId);
  return roundPlayer ? roundPlayer.timeline : [];
}

function guessUsesDecade(game) {
  return roundTimeline(game).length === 0;
}

function insertChronologically(timeline, year) {
  const insertion = timeline.findIndex((existingYear) => existingYear > year);
  timeline.splice(insertion === -1 ? timeline.length : insertion, 0, year);
}

function advanceGuessPhase(game) {
  if (game.phase === "active_guess") {
    game.challengeEligible = game.players
      .filter((player) => player.id !== game.roundPlayerId)
      .map((player) => player.id);
    game.challengeDecisions = {};
    game.phase = game.challengeEligible.length ? "challenge_decisions" : "awaiting_reveal";
    game.challengeTurnIndex = 0;
    passPlayersWhenNoChallengeAnswerRemains(game);
    finishChallengeDecisions(game);
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
    if (type !== "decade" || !DECADE_OPTIONS.includes(decade)) {
      reply(done, { ok: false, message: "Vælg et gyldigt årti." });
      return;
    }
    if (answerIsOccupied(game, player, type, decade)) {
      reply(done, { ok: false, message: "Det årti er allerede optaget." });
      return;
    }
    player.selectedDecade = decade;
  } else {
    const slot = Number(details.slot);
    if (type !== "place" || !Number.isInteger(slot) || slot < 0 || slot > roundTimeline(game).length) {
      reply(done, { ok: false, message: "Vælg en gyldig plads på tidslinjen." });
      return;
    }
    if (answerIsOccupied(game, player, type, slot)) {
      reply(done, { ok: false, message: "Den placering er allerede optaget." });
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
  const hasAnswer = guessUsesDecade(game)
    ? Number.isInteger(player.selectedDecade)
    : Number.isInteger(player.selectedSlot);
  if (!hasAnswer) return reply(done, { ok: false, message: "Vælg et svar, før du låser." });
  player.ready = true;
  advanceGuessPhase(game);
  reply(done, { ok: true, game: publicGame(game) });
  sendGame(game);
}

function resetGame(game) {
  clearGameActionTimers(game);
  game.currentSong = null;
  game.showAnswer = false;
  game.activePlayerId = game.hostId;
  game.roundPlayerId = null;
  game.phase = "lobby";
  game.roundNumber = 0;
  game.lastAdvancedRound = null;
  game.challengeQueue = [];
  game.challengeTurnIndex = 0;
  game.challengeEligible = [];
  game.challengeDecisions = {};
  game.offlineActionDeadlines = {};
  game.players.forEach((player) => {
    player.score = 0;
    player.timeline = [];
    player.turnsTaken = 0;
    player.challengesRemaining = 5;
    player.selectedSlot = null;
    player.selectedDecade = null;
    player.ready = false;
    player.lastGuessWasCorrect = null;
  });
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
      challengeEligible: [], challengeDecisions: {}, offlineActionDeadlines: {},
      players: [player]
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

  socket.on("game:restart", (code, done) => {
    const game = games.get(code);
    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game)) {
      return reply(done, { ok: false, message: "Kun værten kan starte spillet forfra." });
    }
    resetGame(game);
    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("game:leave", (code, done) => {
    const game = games.get(code);
    const player = currentPlayer(socket, game);
    if (!game || !player) return reply(done, { ok: false, message: "Du er ikke med i dette spil." });
    if (player.id === game.hostId) {
      return reply(done, { ok: false, message: "Værten skal afslutte spillet for alle." });
    }
    const leavingIndex = game.players.findIndex((item) => item.id === player.id);
    const nextPlayer = game.players[(leavingIndex + 1) % game.players.length];
    clearActionTimer(game, player.id);
    if (game.phase === "active_guess" && game.roundPlayerId === player.id) {
      game.activePlayerId = nextPlayer.id;
      game.phase = "awaiting_reveal";
    } else if (game.phase === "challenge_decisions") {
      game.challengeEligible = game.challengeEligible.filter((id) => id !== player.id);
      delete game.challengeDecisions[player.id];
      finishChallengeDecisions(game);
    } else if (game.phase === "challenge_guesses") {
      const queueIndex = game.challengeQueue.indexOf(player.id);
      if (queueIndex >= 0) {
        game.challengeQueue.splice(queueIndex, 1);
        if (queueIndex < game.challengeTurnIndex) game.challengeTurnIndex -= 1;
        if (game.challengeTurnIndex >= game.challengeQueue.length) game.phase = "awaiting_reveal";
      }
    }
    game.players = game.players.filter((item) => item.id !== player.id);
    socket.leave(game.code);
    delete socket.data.gameCode;
    delete socket.data.playerId;
    reply(done, { ok: true });
    sendGame(game);
  });

  socket.on("game:end", (code, done) => {
    const game = games.get(code);
    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game)) {
      return reply(done, { ok: false, message: "Kun værten kan afslutte spillet." });
    }
    io.to(game.code).emit("game:ended");
    clearGameActionTimers(game);
    games.delete(game.code);
    cancelCleanup(game.code);
    reply(done, { ok: true });
  });

  socket.on("song:start", ({ code, title, artist, year, url, source }, done) => {
    const game = games.get(code);
    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game) || game.currentSong) {
      return reply(done, { ok: false, message: "Kun værten kan starte en ny runde." });
    }
    const songYear = Number(year);
    if (!title || !artist || !Number.isInteger(songYear)) return reply(done, { ok: false, message: "Udfyld titel, kunstner og årstal." });
    const isHitster = source === "hitster";
    game.currentSong = {
      title,
      artist,
      year: songYear,
      source: isHitster ? "hitster" : "manual",
      url: isHitster ? "" : (url || `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`)
    };
    game.roundNumber += 1;
    game.showAnswer = false;
    game.roundPlayerId = game.activePlayerId;
    game.phase = "active_guess";
    game.challengeQueue = [];
    game.challengeTurnIndex = 0;
    game.challengeEligible = [];
    game.challengeDecisions = {};
    game.offlineActionDeadlines = {};
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
    if (availableChallengeAnswerCount(game) <= 0) {
      game.challengeDecisions[player.id] = "pass";
      passPlayersWhenNoChallengeAnswerRemains(game);
      finishChallengeDecisions(game);
      reply(done, { ok: false, message: "Der er ingen ledige svarmuligheder. Du er automatisk registreret som Pas." });
      sendGame(game);
      return;
    }
    player.challengesRemaining -= 1;
    game.challengeQueue.push(player.id);
    game.challengeDecisions[player.id] = "challenge";
    passPlayersWhenNoChallengeAnswerRemains(game);
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
    // Every answer in the round is judged against the active player's timeline
    // as it looked before any winner receives the song.
    const referenceTimeline = [...roundTimeline(game)];
    const usesDecade = referenceTimeline.length === 0;
    participants.forEach((id) => {
      const player = findPlayer(game, id);
      if (!player) return;
      const correct = usesDecade
        ? player.selectedDecade === Math.floor(game.currentSong.year / 10) * 10
        : placementIsCorrect(referenceTimeline, game.currentSong.year, player.selectedSlot);
      player.lastGuessWasCorrect = correct;
      if (correct) {
        player.score += 1;
        insertChronologically(player.timeline, game.currentSong.year);
      }
    });
    const roundPlayer = findPlayer(game, game.roundPlayerId);
    if (roundPlayer) roundPlayer.turnsTaken += 1;
    const activeIndex = game.players.findIndex((player) => player.id === game.roundPlayerId);
    if (activeIndex >= 0) game.activePlayerId = game.players[(activeIndex + 1) % game.players.length].id;
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
    game.offlineActionDeadlines = {};
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
