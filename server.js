const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const games = new Map();

function code() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length: 6}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
}
function publicGame(g) {
  return {
    code: g.code,
    hostId: g.hostId,
    targetScore: g.targetScore,
    phase: g.phase,
    song: g.song,
    players: [...g.players.values()].map(p => ({
      id:p.id, name:p.name, score:p.score, ready:p.ready,
      timeline:p.timeline
    }))
  };
}
function emitGame(g) { io.to(g.code).emit("game:update", publicGame(g)); }

io.on("connection", socket => {
  socket.on("createGame", ({name, targetScore=10}, reply) => {
    let c; do { c = code(); } while (games.has(c));
    const game = {
      code:c, hostId:socket.id, targetScore:Number(targetScore)||10,
      phase:"lobby", song:null, players:new Map()
    };
    game.players.set(socket.id, {id:socket.id, name:name||"Vært", score:0, ready:false, timeline:[]});
    games.set(c, game);
    socket.join(c);
    reply({ok:true, code:c});
    emitGame(game);
  });

  socket.on("joinGame", ({code:room, name}, reply) => {
    const g = games.get((room||"").toUpperCase());
    if (!g) return reply({ok:false, error:"Spillet findes ikke"});
    if (g.phase !== "lobby") return reply({ok:false, error:"Spillet er allerede startet"});
    g.players.set(socket.id, {id:socket.id, name:name||"Spiller", score:0, ready:false, timeline:[]});
    socket.join(g.code);
    reply({ok:true, code:g.code});
    emitGame(g);
  });

  socket.on("setReady", ({code:room, ready}) => {
    const g=games.get(room); const p=g?.players.get(socket.id);
    if (!p) return; p.ready=!!ready; emitGame(g);
  });

  socket.on("startGame", ({code:room}) => {
    const g=games.get(room); if (!g || g.hostId!==socket.id) return;
    g.phase="playing"; g.song=null; emitGame(g);
  });

  socket.on("setSong", ({code:room, title, artist, year}) => {
    const g=games.get(room); if (!g || g.hostId!==socket.id) return;
    g.song={title:title||"", artist:artist||"", year:Number(year), revealed:false, placements:{}};
    for (const p of g.players.values()) p.ready=false;
    emitGame(g);
  });

  socket.on("placeSong", ({code:room, position}) => {
    const g=games.get(room); const p=g?.players.get(socket.id);
    if (!g || !p || !g.song || g.song.revealed) return;
    g.song.placements[socket.id]=Number(position);
    p.ready=true; emitGame(g);
  });

  socket.on("revealSong", ({code:room}) => {
    const g=games.get(room); if (!g || g.hostId!==socket.id || !g.song) return;
    g.song.revealed=true;
    for (const p of g.players.values()) {
      const pos=g.song.placements[p.id];
      const before=p.timeline[pos-1], after=p.timeline[pos];
      const y=g.song.year;
      const correct=(before===undefined || before<=y) && (after===undefined || y<=after);
      if (correct) { p.score += 1; p.timeline.splice(Math.max(0, Math.min(pos, p.timeline.length)), 0, y); }
      p.ready=false;
    }
    emitGame(g);
  });

  socket.on("nextRound", ({code:room}) => {
    const g=games.get(room); if (!g || g.hostId!==socket.id) return;
    g.song=null; for (const p of g.players.values()) p.ready=false; emitGame(g);
  });

  socket.on("disconnect", () => {
    for (const [c,g] of games) {
      if (!g.players.has(socket.id)) continue;
      g.players.delete(socket.id);
      if (!g.players.size) games.delete(c);
      else {
        if (g.hostId===socket.id) g.hostId=[...g.players.keys()][0];
        emitGame(g);
      }
    }
  });
});

server.listen(process.env.PORT || 3000, () => console.log("Timeline Party running"));
