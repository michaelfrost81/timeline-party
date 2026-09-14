const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 10000;
const server = http.createServer((req, res) => {
  res.writeHead(200, {
    "content-type": "text/plain; charset=utf-8",
    "access-control-allow-origin": "*",
    "cache-control": "no-store"
  });
  res.end("Timeline Party video signaling is running.\n");
});

const io = new Server(server, {
  cors: {
    origin: true,
    methods: ["GET", "POST"]
  }
});

function cleanRoom(value) {
  return String(value || "").trim().toUpperCase().slice(0, 12);
}
function cleanId(value) {
  return String(value || "").trim().slice(0, 120);
}
function cleanName(value) {
  return String(value || "Player").trim().slice(0, 80) || "Player";
}

io.on("connection", socket => {
  socket.on("video:join", ({ room, playerId, name }, done) => {
    room = cleanRoom(room); playerId = cleanId(playerId); name = cleanName(name);
    if (!room || !playerId) return typeof done === "function" && done({ ok:false });

    // A browser can briefly create a second signaling socket while a sleeping
    // Render service wakes up. Keep only the newest socket for each player.
    for (const other of io.sockets.sockets.values()) {
      if (other.id === socket.id) continue;
      if (other.data.room === room && other.data.playerId === playerId) {
        other.to(room).emit("video:peer-left", { socketId:other.id, playerId });
        other.leave(room);
        delete other.data.room;
        other.disconnect(true);
      }
    }

    socket.data.room = room;
    socket.data.playerId = playerId;
    socket.data.name = name;
    socket.join(room);
    const peers = [...(io.sockets.adapter.rooms.get(room) || [])]
      .filter(id => id !== socket.id)
      .map(id => {
        const peer = io.sockets.sockets.get(id);
        return peer ? { socketId:id, playerId:peer.data.playerId || "", name:peer.data.name || "Player" } : null;
      }).filter(Boolean);
    socket.to(room).emit("video:peer-joined", { socketId:socket.id, playerId, name });
    if (typeof done === "function") done({ ok:true, socketId:socket.id, peers });
  });

  socket.on("video:signal", ({ target, data }) => {
    if (!target || !data || !socket.data.room) return;
    const peer = io.sockets.sockets.get(String(target));
    if (!peer || peer.data.room !== socket.data.room) return;
    io.to(peer.id).emit("video:signal", {
      from: socket.id,
      playerId: socket.data.playerId,
      name: socket.data.name,
      data
    });
  });

  socket.on("video:presence", payload => {
    if (!socket.data.room) return;
    socket.to(socket.data.room).emit("video:presence", {
      socketId: socket.id,
      playerId: socket.data.playerId,
      name: socket.data.name,
      camera: Boolean(payload?.camera),
      microphone: Boolean(payload?.microphone),
      sharing: Boolean(payload?.sharing)
    });
  });

  socket.on("video:leave", () => leaveRoom(socket));
  socket.on("disconnect", () => leaveRoom(socket));
});

function leaveRoom(socket) {
  const room = socket.data.room;
  if (!room) return;
  socket.to(room).emit("video:peer-left", { socketId:socket.id, playerId:socket.data.playerId });
  socket.leave(room);
  delete socket.data.room;
}

server.listen(PORT, () => console.log(`Timeline Party video signaling listening on ${PORT}`));
