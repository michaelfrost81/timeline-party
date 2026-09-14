const http = require("http");
const { Server } = require("socket.io");

const PORT = process.env.PORT || 10000;
const roomPlayback = new Map();
const roomHosts = new Map();
const END_TOLERANCE_MS = 1500;

const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Timeline Party music sync is running\n");
});
const io = new Server(server, { cors: { origin: true, credentials: true } });

function normalizeRoom(value) { return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); }
function cleanProvider(value) { const id = String(value || "spotify").toLowerCase(); return ["spotify", "apple", "telmore", "youtube"].includes(id) ? id : "spotify"; }
function cleanTrack(track = {}, fallback = {}) {
  const providers = {};
  const sourceProviders = track.providers && typeof track.providers === "object" ? track.providers : {};
  if (sourceProviders.spotify) providers.spotify = { id: String(sourceProviders.spotify.id || "").slice(0, 160), uri: String(sourceProviders.spotify.uri || fallback.spotifyUri || fallback.uri || "").slice(0, 300) };
  else if (fallback.spotifyUri || fallback.uri) providers.spotify = { id: "", uri: String(fallback.spotifyUri || fallback.uri).slice(0, 300) };
  if (sourceProviders.apple) providers.apple = { id: String(sourceProviders.apple.id || "").slice(0, 160) };
  if (sourceProviders.youtube) providers.youtube = { id: String(sourceProviders.youtube.id || "").slice(0, 160) };
  if (sourceProviders.telmore) providers.telmore = { id: String(sourceProviders.telmore.id || "").slice(0, 160) };
  return { isrc: String(track.isrc || "").slice(0, 40), durationMs: Math.max(0, Number(track.durationMs || fallback.durationMs) || 0), providers };
}
function roomPlayerSockets(room) {
  const socketIds = io.sockets.adapter.rooms.get(room) || new Set(); const groups = new Map();
  for (const socketId of socketIds) { const peer = io.sockets.sockets.get(socketId); if (!peer?.data?.playerId) continue; const id = peer.data.playerId; if (!groups.has(id)) groups.set(id, []); groups.get(id).push(peer); }
  return groups;
}
function roomParticipants(room) {
  return [...roomPlayerSockets(room).entries()].map(([playerId, peers]) => {
    const primary = peers.find((peer) => !peer.data.diagnosticsOnly) || peers[0]; const healthPeer = peers.find((peer) => peer.data.health) || primary; const health = healthPeer?.data?.health || {};
    return { playerId, name: primary?.data?.name || "Spiller", provider: primary?.data?.provider || "spotify", ready: Boolean(primary?.data?.ready), host: roomHosts.get(room) === playerId, latencyMs: Number.isFinite(health.latencyMs) ? health.latencyMs : null, connection: health.connection || "unknown", syncState: health.syncState || "unknown", driftMs: Number.isFinite(health.driftMs) ? health.driftMs : null, lastHealthAt: Number(health.at) || 0 };
  });
}
function emitPresence(room) { io.to(room).emit("music:presence", { participants: roomParticipants(room), at: Date.now() }); }
function isRoomHost(socket) { return Boolean(socket.data.room && socket.data.playerId && roomHosts.get(socket.data.room) === socket.data.playerId && !socket.data.diagnosticsOnly); }
function claimHost(room, playerId, requested) { if (!requested) return false; const current = roomHosts.get(room); if (!current) { roomHosts.set(room, playerId); return true; } return current === playerId; }
function playbackSnapshot(room) {
  const current = roomPlayback.get(room); if (!current || current.stopped) return null;
  const elapsed = current.playing ? Math.max(0, Date.now() - current.changedAt) : 0;
  const rawPosition = Math.max(0, current.positionMs + elapsed); const duration = Math.max(0, Number(current.durationMs) || 0);
  if (current.playing && duration && rawPosition >= duration + END_TOLERANCE_MS) { roomPlayback.delete(room); return null; }
  const positionMs = duration ? Math.min(rawPosition, duration) : rawPosition;
  return { ...current, positionMs, changedAt: Date.now(), startedAt: Date.now() - positionMs, serverTime: Date.now() };
}
function setPlayingState(room, data) { roomPlayback.set(room, { track: data.track, uri: data.uri || "", spotifyUri: data.spotifyUri || data.uri || "", durationMs: Math.max(0, Number(data.durationMs) || Number(data.track?.durationMs) || 0), startedAt: Number(data.startedAt) || Date.now(), positionMs: Math.max(0, Number(data.positionMs) || 0), changedAt: Number(data.changedAt) || Date.now(), playing: Boolean(data.playing), roundNumber: Number(data.roundNumber) || 0, senderId: data.senderId || "", stopped: false }); }
function maybeCleanupRoom(room) { if (roomParticipants(room).length) return; roomPlayback.delete(room); roomHosts.delete(room); }

io.on("connection", (socket) => {
  socket.on("music:ping", (payload = {}, done) => { if (typeof done === "function") done({ ok: true, echo: payload?.sentAt || null, serverTime: Date.now() }); });
  socket.on("music:join", ({ room, playerId, name, provider, ready, isHost, diagnosticsOnly } = {}, done) => {
    const nextRoom = normalizeRoom(room); if (!nextRoom || !playerId) return done?.({ ok: false }); const previousRoom = socket.data.room;
    if (previousRoom && previousRoom !== nextRoom) { socket.leave(previousRoom); setTimeout(() => emitPresence(previousRoom), 0); }
    socket.data.room = nextRoom; socket.data.playerId = String(playerId).slice(0, 160); socket.data.name = String(name || "Spiller").slice(0, 80); socket.data.provider = cleanProvider(provider); socket.data.ready = Boolean(ready); socket.data.diagnosticsOnly = Boolean(diagnosticsOnly); socket.join(nextRoom);
    const host = socket.data.diagnosticsOnly ? roomHosts.get(nextRoom) === socket.data.playerId : claimHost(nextRoom, socket.data.playerId, Boolean(isHost));
    done?.({ ok: true, host, participants: roomParticipants(nextRoom), playback: playbackSnapshot(nextRoom), serverTime: Date.now() }); emitPresence(nextRoom);
  });
  socket.on("music:ready", ({ provider, ready } = {}, done) => { if (!socket.data.room || !socket.data.playerId || socket.data.diagnosticsOnly) return done?.({ ok: false }); socket.data.provider = cleanProvider(provider || socket.data.provider); socket.data.ready = Boolean(ready); done?.({ ok: true }); emitPresence(socket.data.room); });
  socket.on("music:health", ({ latencyMs, connection, syncState, driftMs } = {}, done) => {
    if (!socket.data.room || !socket.data.playerId) return done?.({ ok: false });
    socket.data.health = { latencyMs: Number.isFinite(Number(latencyMs)) ? Math.max(0, Math.min(10000, Math.round(Number(latencyMs)))) : null, connection: ["online", "offline", "reconnecting"].includes(connection) ? connection : "unknown", syncState: ["idle", "syncing", "synced", "warning", "error", "unknown"].includes(syncState) ? syncState : "unknown", driftMs: Number.isFinite(Number(driftMs)) ? Math.max(-30000, Math.min(30000, Math.round(Number(driftMs)))) : null, at: Date.now() };
    done?.({ ok: true }); emitPresence(socket.data.room);
  });
  socket.on("music:play", (payload = {}) => {
    const room = socket.data.room; if (!room || normalizeRoom(payload.room) !== room || !isRoomHost(socket)) return; const track = cleanTrack(payload.track, payload); const spotifyUri = track.providers.spotify?.uri || "";
    if (!track.isrc && !spotifyUri && !track.providers.apple?.id && !track.providers.youtube?.id && !track.providers.telmore?.id) return;
    const duration = track.durationMs; const positionMs = Math.max(0, Math.min(duration || Infinity, Number(payload.positionMs) || 0)); if (duration && positionMs >= duration) return;
    const now = Date.now(); const event = { track, uri: spotifyUri, spotifyUri, durationMs: duration, positionMs, startedAt: now - positionMs, changedAt: now, serverTime: now, roundNumber: Number(payload.roundNumber) || 0, senderId: socket.data.playerId };
    setPlayingState(room, { ...event, playing: true }); io.to(room).emit("music:play", event);
  });
  socket.on("music:state", (payload = {}) => {
    const room = socket.data.room; if (!room || normalizeRoom(payload.room) !== room || !isRoomHost(socket)) return; const track = cleanTrack(payload.track, payload); const duration = track.durationMs; const positionMs = Math.max(0, Math.min(duration || Infinity, Number(payload.positionMs) || 0)); const now = Date.now();
    if (Boolean(payload.playing) && duration && positionMs >= duration) { roomPlayback.delete(room); io.to(room).emit("music:stop", { senderId: socket.data.playerId, at: now, serverTime: now }); return; }
    const event = { playing: Boolean(payload.playing), positionMs, changedAt: now, serverTime: now, track, uri: track.providers.spotify?.uri || "", spotifyUri: track.providers.spotify?.uri || "", senderId: socket.data.playerId };
    setPlayingState(room, { ...event, durationMs: duration, startedAt: now - positionMs }); io.to(room).emit("music:state", event);
  });
  socket.on("music:stop", (payload = {}) => { const room = socket.data.room; if (!room || normalizeRoom(payload.room) !== room || !isRoomHost(socket)) return; roomPlayback.delete(room); io.to(room).emit("music:stop", { senderId: socket.data.playerId, at: Date.now(), serverTime: Date.now() }); });
  socket.on("disconnect", () => { const room = socket.data.room; if (!room) return; setTimeout(() => { emitPresence(room); if (!roomParticipants(room).length) setTimeout(() => maybeCleanupRoom(room), 10 * 60 * 1000); }, 0); });
});

setInterval(() => {
  const now = Date.now();
  for (const [room, state] of roomPlayback.entries()) {
    const age = now - Number(state.changedAt || state.startedAt || 0); const duration = Math.max(0, Number(state.durationMs) || 0); const maxAge = duration ? Math.max(duration + 5 * 60 * 1000, 15 * 60 * 1000) : 6 * 60 * 60 * 1000;
    if (age > maxAge) roomPlayback.delete(room);
  }
}, 5 * 60 * 1000).unref?.();

server.listen(PORT, () => console.log(`Timeline Party music sync listening on ${PORT}`));
