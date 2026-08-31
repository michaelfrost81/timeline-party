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

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function createCode() {
  return Math.random().toString(36).slice(2, 7).toUpperCase();
}

function publicGame(game) {
  return {
    code: game.code,
    hostId: game.hostId,
    currentSong: game.currentSong,
    showAnswer: game.showAnswer,
    players: game.players.map(({ socketId, ...player }) => player)
  };
}

function sendGame(game) {
  io.to(game.code).emit("game:update", publicGame(game));
}

function findPlayer(game, playerId) {
  return game.players.find((player) => player.id === playerId);
}

function placementIsCorrect(timeline, year, slot) {
  const leftYear = slot === 0 ? -Infinity : timeline[slot - 1];
  const rightYear = slot === timeline.length ? Infinity : timeline[slot];

  return leftYear <= year && year <= rightYear;
}

function reply(done, result) {
  if (typeof done === "function") done(result);
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
    const currentGame = games.get(game.code);
    if (currentGame && currentGame.players.every((player) => !player.connected)) {
      games.delete(game.code);
    }
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

io.on("connection", (socket) => {
  socket.on("game:create", (details, done) => {
    const playerName = typeof details === "string" ? details : details && details.playerName;
    const playerId = details && details.playerId;

    if (!playerId) {
      reply(done, { ok: false, message: "Spillersessionen kunne ikke oprettes. Genindlæs siden." });
      return;
    }
    let code = createCode();

    while (games.has(code)) {
      code = createCode();
    }

    const game = {
      code,
      hostId: playerId,
      currentSong: null,
      showAnswer: false,
      players: [
        {
          id: playerId,
          socketId: socket.id,
          connected: true,
          name: playerName || "Vært",
          score: 0,
          timeline: [],
          selectedSlot: null,
          ready: false,
          lastGuessWasCorrect: null
        }
      ]
    };

    games.set(code, game);
    connectPlayer(socket, game, game.players[0]);
    reply(done, { ok: true, code: code, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("game:join", ({ code, playerName, playerId }, done) => {
    const game = games.get(String(code || "").toUpperCase());

    if (!game) {
      if (typeof done === "function") done({ ok: false, message: "Spillet findes ikke. Tjek koden og prøv igen." });
      return;
    }

    if (!playerId) {
      reply(done, { ok: false, message: "Spillersessionen kunne ikke oprettes. Genindlæs siden." });
      return;
    }

    const existingPlayer = findPlayer(game, playerId);
    if (existingPlayer) {
      connectPlayer(socket, game, existingPlayer);
      reply(done, { ok: true, code: game.code, game: publicGame(game) });
      sendGame(game);
      return;
    }

    const player = {
      id: playerId,
      socketId: socket.id,
      connected: true,
      name: playerName || "Spiller",
      score: 0,
      timeline: [],
      selectedSlot: null,
      ready: false,
      lastGuessWasCorrect: null
    };
    game.players.push(player);

    connectPlayer(socket, game, player);
    reply(done, { ok: true, code: game.code, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("game:resume", ({ code, playerId }, done) => {
    const game = games.get(String(code || "").toUpperCase());
    const player = game && findPlayer(game, playerId);

    if (!game || !player) {
      reply(done, { ok: false, message: "Den gemte spilsession findes ikke længere." });
      return;
    }

    connectPlayer(socket, game, player);
    reply(done, { ok: true, code: game.code, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("song:start", ({ code, title, artist, year, url }, done) => {
    const game = games.get(code);

    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game)) {
      reply(done, { ok: false, message: "Kun værten kan starte en runde." });
      return;
    }

    const songYear = Number(year);
    if (!title || !artist || !Number.isInteger(songYear)) {
      if (typeof done === "function") done({ ok: false, message: "Udfyld titel, kunstner og årstal." });
      return;
    }

    game.currentSong = {
      title,
      artist,
      year: songYear,
      url: url || `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`
    };
    game.showAnswer = false;

    game.players.forEach((player) => {
      player.selectedSlot = null;
      player.ready = false;
      player.lastGuessWasCorrect = null;
    });

    if (typeof done === "function") done({ ok: true });
    sendGame(game);
  });

  socket.on("song:place", ({ code, slot }, done) => {
    const game = games.get(code);
    const player = currentPlayer(socket, game);

    if (!game || !player || !game.currentSong || game.showAnswer) {
      reply(done, { ok: false, message: "Placeringen kunne ikke gemmes. Opdatér siden og prøv igen." });
      return;
    }
    if (!Number.isInteger(slot) || slot < 0 || slot > player.timeline.length) {
      reply(done, { ok: false, message: "Vælg en gyldig plads på tidslinjen." });
      return;
    }

    player.selectedSlot = slot;
    player.ready = true;
    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("song:reveal", (code, done) => {
    const game = games.get(code);

    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game) || !game.currentSong || game.showAnswer) {
      reply(done, { ok: false, message: "Svaret kan ikke afsløres lige nu." });
      return;
    }
    if (!game.players.filter((player) => player.connected).every((player) => player.ready)) {
      reply(done, { ok: false, message: "Vent til alle spillere er klar." });
      return;
    }

    game.showAnswer = true;

    game.players.forEach((player) => {
      const guessed = Number.isInteger(player.selectedSlot);
      player.lastGuessWasCorrect = guessed && placementIsCorrect(
        player.timeline,
        game.currentSong.year,
        player.selectedSlot
      );

      if (player.lastGuessWasCorrect) {
        player.score += 1;
        player.timeline.splice(player.selectedSlot, 0, game.currentSong.year);
      }
    });

    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("song:next", (code, done) => {
    const game = games.get(code);

    if (!game || game.hostId !== socket.data.playerId || !currentPlayer(socket, game) || !game.showAnswer) {
      reply(done, { ok: false, message: "Næste runde kan først startes, når svaret er afsløret." });
      return;
    }

    game.currentSong = null;
    game.showAnswer = false;
    game.players.forEach((player) => {
      player.selectedSlot = null;
      player.ready = false;
      player.lastGuessWasCorrect = null;
    });

    reply(done, { ok: true, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("disconnect", () => {
    const game = games.get(socket.data.gameCode);
    const player = game && findPlayer(game, socket.data.playerId);

    // En gammel socket kan lukke efter spilleren allerede har genoprettet forbindelsen.
    if (!game || !player || player.socketId !== socket.id) return;

    player.connected = false;
    player.socketId = null;
    sendGame(game);
    scheduleCleanup(game);
  });
});

server.listen(PORT, () => {
  console.log(`Timeline Party kører på http://localhost:${PORT}`);
});
