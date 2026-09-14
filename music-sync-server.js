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

function cleanProvider(value) {
  const id = String(value || "spotify").toLowerCase();
  return ["spotify", "apple", "telmore", "youtube"].includes(id) ? id : "spotify";
}

function cleanTrack(track = {}, fallback = {}) {
  const providers = {};
  const sourceProviders = track.providers && typeof track.providers === "object" ? track.providers : {};

  if (sourceProviders.spotify) {
    providers.spotify = {
      id: String(sourceProviders.spotify.id || "").slice(0, 160),
      uri: String(sourceProviders.spotify.uri || fallback.spotifyUri || fallback.uri || "").slice(0, 300)
    };
  } else if (fallback.spotifyUri || fallback.uri) {
    providers.spotify = { id: "", uri: String(fallback.spotifyUri || fallback.uri).slice(0, 300) };
  }

  if (sourceProviders.apple) {
    providers.apple = { id: String(sourceProviders.apple.id || "").slice(0, 160) };
  }
  if (sourceProviders.youtube) {
    providers.youtube = { id: String(sourceProviders.youtube.id || "").slice(0, 160) };
  }
  if (sourceProviders.telmore) {
    providers.telmore = { id: String(sourceProviders.telmore.id || "").slice(0, 160) };
  }

  return {
    isrc: String(track.isrc || "").slice(0, 40),
    durationMs: Math.max(0, Number(track.durationMs || fallback.durationMs) || 0),
    providers
  };
}

function roomParticipants(room) {
  const sockets = io.sockets.adapter.rooms.get(room) || new Set();
  return [...sockets].map((socketId) => {
    const peer = io.sockets.sockets.get(socketId);
    return peer && peer.data.playerId ? {
      playerId: peer.data.playerId,
      name: peer.data.name || "Spiller",
      provider: peer.data.provider || "spotify",
      ready: Boolean(peer.data.ready),
      host: Boolean(peer.data.isHost)
    } : null;
  }).filter(Boolean);
}

function emitPresence(room) {
  io.to(room).emit("music:presence", { participants: roomParticipants(room), at: Date.now() });
}

function isRoomHost(socket) {
  if (!socket.data.room || !socket.data.playerId) return false;
  const participants = roomParticipants(socket.data.room);
  const declaredHost = participants.find((item) => item.host);
  return declaredHost ? declaredHost.playerId === socket.data.playerId : Boolean(socket.data.isHost);
}

io.on("connection", (socket) => {
  socket.on("music:join", ({ room, playerId, name, provider, ready, isHost } = {}, done) => {
    const nextRoom = normalizeRoom(room);
    if (!nextRoom || !playerId) return done?.({ ok: false });
    if (socket.data.room && socket.data.room !== nextRoom) socket.leave(socket.data.room);
    socket.data.room = nextRoom;
    socket.data.playerId = String(playerId).slice(0, 160);
    socket.data.name = String(name || "Spiller").slice(0, 80);
    socket.data.provider = cleanProvider(provider);
    socket.data.ready = Boolean(ready);
    socket.data.isHost = Boolean(isHost);
    socket.join(nextRoom);
    done?.({ ok: true, participants: roomParticipants(nextRoom) });
    emitPresence(nextRoom);
  });

  socket.on("music:ready", ({ provider, ready } = {}, done) => {
    if (!socket.data.room || !socket.data.playerId) return done?.({ ok: false });
    socket.data.provider = cleanProvider(provider || socket.data.provider);
    socket.data.ready = Boolean(ready);
    done?.({ ok: true });
    emitPresence(socket.data.room);
  });

  socket.on("music:play", (payload = {}) => {
    const room = socket.data.room;
    if (!room || normalizeRoom(payload.room) !== room || !isRoomHost(socket)) return;
    const track = cleanTrack(payload.track, payload);
    const spotifyUri = track.providers.spotify?.uri || "";
    if (!track.isrc && !spotifyUri && !track.providers.apple?.id && !track.providers.youtube?.id && !track.providers.telmore?.id) return;
    io.to(room).emit("music:play", {
      track,
      uri: spotifyUri,
      spotifyUri,
      durationMs: track.durationMs,
      startedAt: Number(payload.startedAt) || Date.now(),
      roundNumber: Number(payload.roundNumber) || 0,
      senderId: socket.data.playerId
    });
  });

  socket.on("music:state", (payload = {}) => {
    const room = socket.data.room;
    if (!room || normalizeRoom(payload.room) !== room || !isRoomHost(socket)) return;
    const track = cleanTrack(payload.track, payload);
    io.to(room).emit("music:state", {
      playing: Boolean(payload.playing),
      positionMs: Math.max(0, Number(payload.positionMs) || 0),
      changedAt: Number(payload.changedAt) || Date.now(),
      track,
      uri: track.providers.spotify?.uri || "",
      spotifyUri: track.providers.spotify?.uri || "",
      senderId: socket.data.playerId
    });
  });

  socket.on("music:stop", (payload = {}) => {
    const room = socket.data.room;
    if (!room || normalizeRoom(payload.room) !== room || !isRoomHost(socket)) return;
    io.to(room).emit("music:stop", { senderId: socket.data.playerId, at: Date.now() });
  });

  socket.on("disconnect", () => {
    const room = socket.data.room;
    if (room) setTimeout(() => emitPresence(room), 0);
  });
});

server.listen(PORT, () => console.log(`Timeline Party music sync listening on ${PORT}`));
