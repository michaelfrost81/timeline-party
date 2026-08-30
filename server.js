const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Viser filer fra samme mappe som server.js
app.use(express.static(__dirname));

// Forside
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

const games = {};

function updateGame(code) {
  const game = games[code];

  if (!game) return;

  // The browser listens for `game:update`. Keeping the event name in one
  // place prevents a newly created game from leaving the creator on the
  // start screen.
  io.to(code).emit("game:update", game);
}

io.on("connection", (socket) => {
  console.log("En spiller forbundet:", socket.id);

  socket.on("createGame", ({ name, code } = {}) => {
    const gameCode = String(code || "").trim().toUpperCase();
    const playerName = String(name || "").trim();

    if (!gameCode || !playerName) {
      socket.emit("gameError", "Indtast dit navn, før du opretter et spil");
      return;
    }

    if (games[gameCode]) {
      socket.emit("gameError", "Spilkoden er optaget. Prøv igen.");
      return;
    }

    const game = {
      code: gameCode,
      hostId: socket.id,
      players: [],
      phase: "lobby",
      song: null,
      revealed: false,
      targetScore: 10
    };

    games[gameCode] = game;

    socket.join(gameCode);

    game.players.push({
      id: socket.id,
      name: playerName,
      score: 0,
      timeline: [],
      ready: false
    });

    console.log("Spil oprettet:", gameCode);

    updateGame(gameCode);
  });

  socket.on("joinGame", ({ name, code } = {}) => {
    const gameCode = String(code || "").trim().toUpperCase();
    const playerName = String(name || "").trim();
    const game = games[gameCode];

    if (!game) {
      socket.emit("gameError", "Spillet blev ikke fundet");
      return;
    }

    if (!playerName) {
      socket.emit("gameError", "Indtast dit navn, før du deltager");
      return;
    }

    socket.join(gameCode);

    const existingPlayer = game.players.find(
      (player) => player.id === socket.id
    );

    if (!existingPlayer) {
      game.players.push({
        id: socket.id,
        name: playerName,
        score: 0,
        timeline: [],
        ready: false
      });
    }

    updateGame(gameCode);
  });

  socket.on("startGame", ({ code }) => {
    console.log(
      "STARTGAME MODTAGET:",
      code,
      "fra:",
      socket.id
    );

    const game = games[code];

    if (!game) {
      console.log("Spillet findes ikke:", code);
      return;
    }

    if (game.hostId !== socket.id) {
      console.log("Kun værten må starte runden");
      return;
    }

    console.log("Starter runden!");

    game.phase = "song";
    game.song = null;
    game.revealed = false;

    updateGame(code);
  });

  socket.on("setSong", ({ code, title, artist, year }) => {
    const game = games[code];

    if (!game) return;

    if (game.hostId !== socket.id) return;

    game.song = {
      title,
      artist,
      year: Number(year)
    };

    game.revealed = false;

    updateGame(code);
  });

  socket.on("placeSong", ({ code, position }) => {
    const game = games[code];

    if (!game) return;

    const player = game.players.find(
      (p) => p.id === socket.id
    );

    if (!player) return;

    player.position = position;

    updateGame(code);
  });

  socket.on("revealSong", ({ code }) => {
    const game = games[code];

    if (!game) return;

    if (game.hostId !== socket.id) return;

    game.revealed = true;

    updateGame(code);
  });

  socket.on("nextRound", ({ code }) => {
    const game = games[code];

    if (!game) return;

    if (game.hostId !== socket.id) return;

    game.phase = "song";
    game.song = null;
    game.revealed = false;

    game.players.forEach((player) => {
      delete player.position;
    });

    updateGame(code);
  });

  socket.on("disconnect", () => {
    console.log("Spiller forlod spillet:", socket.id);

    Object.values(games).forEach((game) => {
      const player = game.players.find(
        (p) => p.id === socket.id
      );

      if (player) {
        player.id = null;
      }
    });
  });
});

const PORT = process.env.PORT || 10000;

server.listen(PORT, () => {
  console.log(`Timeline Party kører på port ${PORT}`);
});
