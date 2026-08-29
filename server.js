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

  io.to(code).emit("gameUpdate", game);
}

io.on("connection", (socket) => {
  console.log("En spiller forbundet:", socket.id);

  socket.on("createGame", ({ name, code }) => {
    if (!code) return;

    const game = {
      code,
      hostId: socket.id,
      players: [],
      phase: "song",
      song: null,
      revealed: false
    };

    games[code] = game;

    socket.join(code);

    game.players.push({
      id: socket.id,
      name: name || "Vært",
      score: 0
    });

    console.log("Spil oprettet:", code);

    updateGame(code);
  });

  socket.on("joinGame", ({ name, code }) => {
    const game = games[code];

    if (!game) {
      socket.emit("gameError", "Spillet blev ikke fundet");
      return;
    }

    socket.join(code);

    const existingPlayer = game.players.find(
      (player) => player.id === socket.id
    );

    if (!existingPlayer) {
      game.players.push({
        id: socket.id,
        name: name || "Spiller",
        score: 0
      });
    }

    updateGame(code);
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
