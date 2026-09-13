const fs = require("fs");
const path = require("path");

const sourcePath = path.join(__dirname, "server.js");
const runtimePath = path.join(__dirname, ".server-runtime.js");
let source = fs.readFileSync(sourcePath, "utf8");

const helpers = String.raw`
function cleanSavedPlayer(input, settings) {
  const id = typeof input?.id === "string" ? input.id.slice(0, 160) : "";
  const name = typeof input?.name === "string" && input.name.trim() ? input.name.trim().slice(0, 80) : "Spiller";
  const timeline = Array.isArray(input?.timeline)
    ? input.timeline.map(Number).filter(Number.isFinite).map((year) => Math.round(year)).filter((year) => year >= 1900 && year <= 2100).sort((a,b)=>a-b).slice(0,500)
    : [];
  return {
    id, socketId:null, connected:false, name,
    score:clampInteger(input?.score,0,0,10000), timeline,
    turnsTaken:clampInteger(input?.turnsTaken,0,0,10000),
    challengesRemaining:clampInteger(input?.challengesRemaining,settings.maxChallenges,0,settings.maxChallenges),
    selectedSlot:null, selectedDecade:null, ready:false, lastGuessWasCorrect:null
  };
}

function restoreSavedGame(socket, details) {
  const snapshot = details?.snapshot;
  const playerId = typeof details?.playerId === "string" ? details.playerId.slice(0,160) : "";
  if (!snapshot || !playerId) return {ok:false,message:"Det gemte spil er ugyldigt."};
  const settings = sanitizeSettings(snapshot.settings || {});
  const rawPlayers = Array.isArray(snapshot.players) ? snapshot.players.slice(0,30) : [];
  if (!rawPlayers.length) return {ok:false,message:"Det gemte spil indeholder ingen spillere."};
  const oldHostId = typeof snapshot.hostId === "string" ? snapshot.hostId : rawPlayers[0]?.id;
  const players = [];
  for (const raw of rawPlayers) {
    const cleaned = cleanSavedPlayer(raw, settings);
    if (!cleaned.id || players.some((p) => p.id === cleaned.id)) continue;
    players.push(cleaned);
  }
  if (!players.length) return {ok:false,message:"Det gemte spil indeholder ingen gyldige spillere."};
  let host = players.find((p) => p.id === oldHostId) || players[0];
  const oldHostPlayerId = host.id;
  if (playerId !== oldHostPlayerId) {
    players.forEach((p) => { if (p.id === playerId && p !== host) p.id = p.id + "-saved-" + Math.random().toString(36).slice(2,7); });
    host.id = playerId;
  }
  if (typeof details.playerName === "string" && details.playerName.trim()) host.name = details.playerName.trim().slice(0,80);
  let code = createCode(); while (games.has(code)) code = createCode();
  const requestedActive = snapshot.activePlayerId === oldHostPlayerId ? playerId : snapshot.activePlayerId;
  const activePlayerId = players.some((p) => p.id === requestedActive) ? requestedActive : playerId;
  const game = {
    code, hostId:playerId, currentSong:null, showAnswer:false, activePlayerId, roundPlayerId:null,
    phase:"lobby", roundNumber:clampInteger(snapshot.roundNumber,0,0,10000), lastAdvancedRound:null,
    settings, finished:false, winnerIds:[], challengeQueue:[], challengeTurnIndex:0,
    challengeEligible:[], challengeDecisions:{}, offlineActionDeadlines:{}, players
  };
  games.set(code, game);
  connectPlayer(socket, game, host);
  return {ok:true,code,game};
}
`;

const eventCode = String.raw`
  socket.on("game:restoreSaved", (details, done) => {
    const result = restoreSavedGame(socket, details);
    if (!result.ok) return reply(done, result);
    reply(done, {ok:true,code:result.code,game:publicGame(result.game)});
    sendGame(result.game);
  });

`;

const connectionMarker = 'io.on("connection", (socket) => {';
const settingsMarker = '  socket.on("game:settings", ({ code, settings }, done) => {';
if (!source.includes(connectionMarker) || !source.includes(settingsMarker)) {
  throw new Error("Saved-game patch markers were not found in server.js");
}
source = source.replace(connectionMarker, helpers + "\n" + connectionMarker);
source = source.replace(settingsMarker, eventCode + settingsMarker);
fs.writeFileSync(runtimePath, source, "utf8");
require(runtimePath);
