const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Timeline Party music sync is running\n");
});
const io = new Server(server, { cors: { origin: true, credentials: true } });

function normalizeRoom(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

io.on("connection", (socket) => {
  socket.on("music:join", ({ room, playerId, name } = {}, done) => {
    const nextRoom = normalizeRoom(room);
    if (!nextRoom || !playerId) return done?.({ ok: false });
    if (socket.data.room) socket.leave(socket.data.room);
    socket.data.room = nextRoom;
    socket.data.playerId = String(playerId);
    socket.data.name = String(name || "Spiller").slice(0, 80);
    socket.join(nextRoom);
    done?.({ ok: true });
  });

  socket.on("music:play", (payload = {}) => {
    const room = socket.data.room;
    if (!room || normalizeRoom(payload.room) !== room || !payload.uri) return;
    io.to(room).emit("music:play", {
      uri: String(payload.uri),
      durationMs: Math.max(0, Number(payload.durationMs) || 0),
      startedAt: Number(payload.startedAt) || Date.now(),
      roundNumber: Number(payload.roundNumber) || 0,
      senderId: socket.data.playerId
    });
  });

  socket.on("music:state", (payload = {}) => {
    const room = socket.data.room;
    if (!room || normalizeRoom(payload.room) !== room) return;
    io.to(room).emit("music:state", {
      playing: Boolean(payload.playing),
      positionMs: Math.max(0, Number(payload.positionMs) || 0),
      changedAt: Number(payload.changedAt) || Date.now(),
      uri: payload.uri ? String(payload.uri) : "",
      senderId: socket.data.playerId
    });
  });

  socket.on("music:stop", (payload = {}) => {
    const room = socket.data.room;
    if (!room || normalizeRoom(payload.room) !== room) return;
    io.to(room).emit("music:stop", { senderId: socket.data.playerId, at: Date.now() });
  });
});

server.listen(PORT, () => console.log(`Timeline Party music sync listening on ${PORT}`));
