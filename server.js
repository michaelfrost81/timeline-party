const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const games = new Map();

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}

function publicGame(game) {
  return {
    code: game.code,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score
    })),
    hostId: game.hostId,
    targetScore: game.targetScore
  };
}

function renderGame(socket, game) {
  socket.emit("game:update", publicGame(game));
}

io.on("connection", (socket) => {

  socket.on("createGame", (data) => {
    const name = (data?.name || "Spiller").trim().slice(0, 20);

    let code = makeCode();

    while (games.has(code)) {
      code = makeCode();
    }

    const game = {
      code,
      hostId: socket.id,
      targetScore: 10,
      players: [
        {
          id: socket.id,
          name,
          score: 0
        }
      ]
    };

    games.set(code, game);

    socket.join(code);

    socket.emit("game:created", publicGame(game));
    io.to(code).emit("game:update", publicGame(game));
  });


  socket.on("joinGame", (data) => {
    const code = (data?.code || "").trim().toUpperCase();
    const name = (data?.name || "Spiller").trim().slice(0, 20);

    const game = games.get(code);

    if (!game) {
      socket.emit("errorMessage", "Spillet blev ikke fundet.");
      return;
    }

    if (game.players.some((player) => player.id === socket.id)) {
      renderGame(socket, game);
      return;
    }

    game.players.push({
      id: socket.id,
      name,
      score: 0
    });

    socket.join(code);

    io.to(code).emit("game:update", publicGame(game));
  });


  socket.on("addScore", (data) => {
    const code = (data?.code || "").trim().toUpperCase();
    const playerId = data?.playerId;
    const points = Number(data?.points) || 0;

    const game = games.get(code);

    if (!game) return;

    if (socket.id !== game.hostId) return;

    const player = game.players.find(
      (player) => player.id === playerId
    );

    if (!player) return;

    player.score += points;

    io.to(code).emit("game:update", publicGame(game));
  });


  socket.on("setTargetScore", (data) => {
    const code = (data?.code || "").trim().toUpperCase();
    const targetScore = Number(data?.targetScore);

    const game = games.get(code);

    if (!game) return;

    if (socket.id !== game.hostId) return;

    if (!Number.isFinite(targetScore) || targetScore < 1) return;

    game.targetScore = Math.floor(targetScore);

    io.to(code).emit("game:update", publicGame(game));
  });


  socket.on("nextRound", (data) => {
    const code = (data?.code || "").trim().toUpperCase();

    const game = games.get(code);

    if (!game) return;

    if (socket.id !== game.hostId) return;

    io.to(code).emit("nextRound");
  });


  socket.on("disconnect", () => {
    for (const [code, game] of games.entries()) {
      const player = game.players.find(
        (player) => player.id === socket.id
      );

      if (!player) continue;

      game.players = game.players.filter(
        (player) => player.id !== socket.id
      );

      if (game.players.length === 0) {
        games.delete(code);
        continue;
      }

      if (game.hostId === socket.id) {
        game.hostId = game.players[0].id;
      }

      io.to(code).emit("game:update", publicGame(game));
    }
  });

});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Timeline Party kører på port ${PORT}`);
});
