const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname)));

const games = {};

function publicGame(game) {
  return {
    code: game.code,
    hostId: game.hostId,
    phase: game.phase,
    song: game.song,
    revealed: game.revealed,
    players: game.players.map(player => ({
      id: player.id,
      name: player.name,
      score: player.score
    }))
  };
}

function updateGame(code) {
  const game = games[code];

  if (game) {
    io.to(code).emit("game:update", publicGame(game));
  }
}

io.on("connection", (socket) => {

  socket.on("createGame", ({ name, code }) => {
    code = (code || "").toUpperCase().trim();

    if (!name || !code) return;

    games[code] = {
      code,
      hostId: socket.id,
      phase: "lobby",
      song: null,
      revealed: false,
      players: [
        {
          id: socket.id,
          name,
          score: 0
        }
      ]
    };

    socket.join(code);
    updateGame(code);
  });

  socket.on("joinGame", ({ name, code }) => {
    code = (code || "").toUpperCase().trim();

    const game = games[code];

    if (!game) {
      socket.emit("errorMessage", "Spillet findes ikke");
      return;
    }

    const alreadyJoined = game.players.find(
      player => player.id === socket.id
    );

    if (!alreadyJoined) {
      game.players.push({
        id: socket.id,
        name,
        score: 0
      });
    }

    socket.join(code);
    updateGame(code);
  });

  socket.on("startGame", ({ code }) => {
    const game = games[code];

    if (!game || game.hostId !== socket.id) return;

    game.phase = "song";
    game.song = null;
    game.revealed = false;

    updateGame(code);
  });

  socket.on("setSong", ({ code, title, artist, year }) => {
    const game = games[code];

    if (!game || game.hostId !== socket.id) return;

    game.song = {
      title,
      artist,
      year
    };

    game.revealed = false;
    updateGame(code);
  });

  socket.on("revealSong", ({ code }) => {
    const game = games[code];

    if (!game || game.hostId !== socket.id) return;

    game.revealed = true;
    updateGame(code);
  });

  socket.on("nextRound", ({ code }) => {
    const game = games[code];

    if (!game || game.hostId !== socket.id) return;

    game.song = null;
    game.revealed = false;
    game.phase = "song";

    updateGame(code);
  });

  socket.on("addPoint", ({ code, playerId }) => {
    const game = games[code];

    if (!game || game.hostId !== socket.id) return;

    const player = game.players.find(
      player => player.id === playerId
    );

    if (player) {
      player.score += 1;
      updateGame(code);
    }
  });

  socket.on("disconnect", () => {
    for (const code in games) {
      const game = games[code];

      if (!game) continue;

      game.players = game.players.filter(
        player => player.id !== socket.id
      );

      if (game.players.length === 0) {
        delete games[code];
        continue;
      }

      if (game.hostId === socket.id) {
        game.hostId = game.players[0].id;
      }

      updateGame(code);
    }
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Timeline Party kører på port ${PORT}`);
});
