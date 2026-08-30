const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 10000;
const games = new Map();

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
    players: game.players
  };
}

function sendGame(game) {
  io.to(game.code).emit("game:update", publicGame(game));
}

function findPlayer(game, socketId) {
  return game.players.find((player) => player.id === socketId);
}

function placementIsCorrect(timeline, year, slot) {
  const leftYear = slot === 0 ? -Infinity : timeline[slot - 1];
  const rightYear = slot === timeline.length ? Infinity : timeline[slot];

  return leftYear <= year && year <= rightYear;
}

function reply(done, result) {
  if (typeof done === "function") done(result);
}

io.on("connection", (socket) => {
  socket.on("game:create", (playerName, done) => {
    let code = createCode();

    while (games.has(code)) {
      code = createCode();
    }

    const game = {
      code: gameCode,
      hostId: socket.id,
      currentSong: null,
      showAnswer: false,
      players: [
        {
          id: socket.id,
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
    socket.join(code);
    if (typeof done === "function") done({ ok: true, code, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("game:join", ({ code, playerName }, done) => {
    const game = games.get(String(code || "").toUpperCase());

    if (!game) {
      if (typeof done === "function") done({ ok: false, message: "Spillet findes ikke. Tjek koden og prøv igen." });
      return;
    }

    game.players.push({
      id: socket.id,
      name: playerName || "Spiller",
      score: 0,
      timeline: [],
      selectedSlot: null,
      ready: false,
      lastGuessWasCorrect: null
    });

    socket.join(game.code);
    if (typeof done === "function") done({ ok: true, code: game.code, game: publicGame(game) });
    sendGame(game);
  });

  socket.on("song:start", ({ code, title, artist, year, url }, done) => {
    const game = games.get(code);

    if (!game || game.hostId !== socket.id) {
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
    const player = game && findPlayer(game, socket.id);

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

    if (!game || game.hostId !== socket.id || !game.currentSong || game.showAnswer) {
      reply(done, { ok: false, message: "Svaret kan ikke afsløres lige nu." });
      return;
    }
    if (!game.players.every((player) => player.ready)) {
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

    if (!game || game.hostId !== socket.id || !game.showAnswer) {
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
    for (const game of games.values()) {
      game.players = game.players.filter((player) => player.id !== socket.id);

      if (game.players.length === 0) {
        games.delete(game.code);
        continue;
      }

      if (game.hostId === socket.id) {
        game.hostId = game.players[0].id;
      }

      sendGame(game);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Timeline Party kører på http://localhost:${PORT}`);
});
