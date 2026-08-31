const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

const port = 12000 + Math.floor(Math.random() * 1000);
let serverProcess;

class GameClient {
  constructor() {
    this.nextAckId = 1;
    this.messages = [];
    this.waiters = [];
  }

  async connect() {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
    this.socket.addEventListener("message", (event) => this.receive(String(event.data)));
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    await this.waitFor((message) => message.startsWith("0"));
    this.socket.send("40");
    await this.waitFor((message) => message.startsWith("40"));
  }

  receive(message) {
    if (message === "2") {
      this.socket.send("3");
      return;
    }

    const waiterIndex = this.waiters.findIndex(({ predicate }) => predicate(message));
    if (waiterIndex >= 0) {
      const [{ resolve, timer }] = this.waiters.splice(waiterIndex, 1);
      clearTimeout(timer);
      resolve(message);
      return;
    }
    this.messages.push(message);
  }

  waitFor(predicate) {
    const messageIndex = this.messages.findIndex(predicate);
    if (messageIndex >= 0) return Promise.resolve(this.messages.splice(messageIndex, 1)[0]);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Socket-besked blev ikke modtaget inden timeout")), 3000);
      this.waiters.push({ predicate, resolve, timer });
    });
  }

  async emitWithAck(event, ...arguments_) {
    const ackId = this.nextAckId++;
    this.socket.send(`42${ackId}${JSON.stringify([event, ...arguments_])}`);
    const packet = await this.waitFor((message) => message.startsWith(`43${ackId}`));
    return JSON.parse(packet.slice(String(ackId).length + 2))[0];
  }

  async nextGame() {
    const packet = await this.waitFor((message) => message.startsWith('42["game:update"'));
    return JSON.parse(packet.slice(2))[1];
  }

  close() {
    this.socket.close();
  }

  async disconnect() {
    const closed = new Promise((resolve) => this.socket.addEventListener("close", resolve, { once: true }));
    this.socket.close();
    await closed;
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}`);
      if (response.ok) return;
    } catch {
      // Serveren er stadig ved at starte.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Testserveren startede ikke");
}

before(async () => {
  serverProcess = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: "ignore"
  });
  await waitForServer();
});

after(() => serverProcess.kill());

async function setupPlayers(ids) {
  const clients = ids.map(() => new GameClient());
  await Promise.all(clients.map((client) => client.connect()));
  const created = await clients[0].emitWithAck("game:create", { playerName: ids[0], playerId: ids[0] });
  const code = created.code;
  await clients[0].nextGame();
  for (let index = 1; index < clients.length; index += 1) {
    await clients[index].emitWithAck("game:join", { code, playerName: ids[index], playerId: ids[index] });
    await Promise.all(clients.slice(0, index + 1).map((client) => client.nextGame()));
  }
  return { clients, code };
}

async function event(clients, actor, name, payload) {
  const result = await clients[actor].emitWithAck(name, payload);
  if (result.ok) await Promise.all(clients.map((client) => client.nextGame()));
  return result;
}

async function start(clients, code, year, title = "Testsang") {
  return event(clients, 0, "song:start", { code, title, artist: "Test", year, url: "https://example.com" });
}

async function selectAndLock(clients, actor, eventName, details) {
  await event(clients, actor, eventName, details);
  return event(clients, actor, "song:lock", details.code);
}

async function finishAndNext(clients, code) {
  const revealed = await event(clients, 0, "song:reveal", code);
  await event(clients, 0, "song:next", code);
  return revealed;
}

function renderClient(game, playerId) {
  const root = { innerHTML: "", addEventListener() {} };
  const handlers = {};
  const socket = {
    connected: true,
    on(name, handler) { handlers[name] = handler; },
    emit() {}
  };
  const storage = new Map([
    ["timeline-party-player-id", playerId],
    ["timeline-party-game-code", game.code]
  ]);
  const context = {
    io: () => socket,
    document: { querySelector: (selector) => selector === "#app" ? root : null },
    localStorage: {
      getItem: (key) => storage.get(key) || null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    globalThis: { crypto: { randomUUID: () => playerId } },
    alert() {},
    Set,
    Number
  };
  vm.runInNewContext(readFileSync("app.js", "utf8"), context);
  handlers["game:update"](game);
  return root.innerHTML;
}

test("tom aktiv tidslinje viser kun årtier, og challenge-valget vises først efter lås", () => {
  const game = {
    code: "ABCDE", hostId: "michael", activePlayerId: "michael", roundPlayerId: "michael",
    phase: "active_guess", challengeQueue: [], challengeTurnIndex: 0, showAnswer: false,
    currentSong: { title: "Dancing Queen", artist: "ABBA", year: 1976, url: "https://example.com" },
    players: [
      { id: "michael", name: "Michael", connected: true, score: 0, timeline: [], challengesRemaining: 5, selectedSlot: null, selectedDecade: null, ready: false },
      { id: "frost", name: "Michael Frost", connected: true, score: 0, timeline: [], challengesRemaining: 5, selectedSlot: null, selectedDecade: null, ready: false }
    ]
  };
  const activeHtml = renderClient(game, "michael");
  assert.match(activeHtml, /DIN TUR/);
  assert.match(activeHtml, /1950'erne/);
  assert.match(activeHtml, /2020'erne/);
  assert.doesNotMatch(activeHtml, /Placér her/);
  assert.equal((activeHtml.match(/Vælger…/g) || []).length, 1);

  const waitingHtml = renderClient(game, "frost");
  assert.doesNotMatch(waitingHtml, /data-action="challengeSong"/);
  assert.doesNotMatch(waitingHtml, /data-action="guessDecade"/);
  assert.doesNotMatch(waitingHtml, /Placér her/);

  game.players[0].ready = true;
  game.phase = "challenge_decisions";
  game.challengeEligible = ["frost"];
  game.challengeDecisions = {};
  const choiceHtml = renderClient(game, "frost");
  assert.match(choiceHtml, /data-action="challengeSong"/);
  assert.match(choiceHtml, /data-action="passChallenge"/);
  assert.doesNotMatch(choiceHtml, /Placér her/);

  game.phase = "challenge_guesses";
  game.challengeQueue = ["frost"];
  game.challengeDecisions = { frost: "challenge" };
  const challengerHtml = renderClient(game, "frost");
  assert.match(challengerHtml, /DIN CHALLENGE-TUR/);
  assert.match(challengerHtml, /data-action="guessDecade"/);
  assert.doesNotMatch(challengerHtml, /Placér her/);
});

test("første sang bruger årti og turen roterer automatisk", async () => {
  const { clients, code } = await setupPlayers(["host-a", "guest-a"]);
  await start(clients, code, 1976);
  const locked = await selectAndLock(clients, 0, "song:decade", { code, decade: 1970 });
  assert.equal(locked.game.phase, "challenge_decisions");
  const passed = await event(clients, 1, "song:pass", code);
  assert.equal(passed.game.challengeDecisions["guest-a"], "pass");
  assert.equal(passed.game.phase, "awaiting_reveal");
  const revealed = await event(clients, 0, "song:reveal", code);
  const host = revealed.game.players.find((player) => player.id === "host-a");
  assert.equal(host.lastGuessWasCorrect, true);
  assert.deepEqual(host.timeline, [1976]);
  assert.equal(revealed.game.activePlayerId, "guest-a");
  clients.forEach((client) => client.close());
});

test("flere challengers svarer i trykrækkefølge og får individuelle tidslinjer", async () => {
  const { clients, code } = await setupPlayers(["host-b", "second-b", "third-b"]);
  await start(clients, code, 1984);
  await selectAndLock(clients, 0, "song:decade", { code, decade: 1980 });
  await event(clients, 2, "song:challenge", code);
  const challenged = await event(clients, 1, "song:challenge", code);
  assert.deepEqual(challenged.game.challengeQueue, ["third-b", "second-b"]);
  assert.equal(challenged.game.players.find((p) => p.id === "third-b").challengesRemaining, 4);

  const lateChallenge = await clients[1].emitWithAck("song:challenge", code);
  assert.equal(lateChallenge.ok, false);
  const outOfTurn = await clients[1].emitWithAck("song:decade", { code, decade: 1980 });
  assert.equal(outOfTurn.ok, false);
  await selectAndLock(clients, 2, "song:decade", { code, decade: 1980 });
  await selectAndLock(clients, 1, "song:decade", { code, decade: 1970 });
  const revealed = await event(clients, 0, "song:reveal", code);
  assert.deepEqual(revealed.game.players.find((p) => p.id === "host-b").timeline, [1984]);
  assert.deepEqual(revealed.game.players.find((p) => p.id === "third-b").timeline, [1984]);
  assert.deepEqual(revealed.game.players.find((p) => p.id === "second-b").timeline, []);
  const advanced = await event(clients, 0, "song:next", { code, roundNumber: revealed.game.roundNumber });
  assert.equal(advanced.game.currentSong, null);
  assert.equal(advanced.game.activePlayerId, "second-b");
  const repeatedAdvance = await clients[0].emitWithAck("song:next", {
    code,
    roundNumber: revealed.game.roundNumber
  });
  assert.equal(repeatedAdvance.ok, true, "gentaget Næste sang er idempotent");
  assert.equal(repeatedAdvance.game.currentSong, null);
  clients.forEach((client) => client.close());
});

test("challenge-beholdning har maksimum fem", async () => {
  const { clients, code } = await setupPlayers(["host-c", "challenger-c"]);
  for (let round = 0; round < 5; round += 1) {
    await start(clients, code, 2000 + round, `Sang ${round}`);
    await selectAndLock(clients, 0, round === 0 ? "song:decade" : "song:place", round === 0 ? { code, decade: 2000 } : { code, slot: 1 });
    await event(clients, 1, "song:challenge", code);
    await selectAndLock(clients, 1, round === 0 ? "song:decade" : "song:place", round === 0 ? { code, decade: 2000 } : { code, slot: 1 });
    await finishAndNext(clients, code);
    // To keep host active for this inventory-focused test, play the guest's turn without a challenge.
    await start(clients, code, 2010 + round, `Mellemsang ${round}`);
    await selectAndLock(clients, 1, "song:place", { code, slot: 1 });
    await event(clients, 0, "song:pass", code);
    await finishAndNext(clients, code);
  }
  await start(clients, code, 2020, "Sjette challenge");
  await selectAndLock(clients, 0, "song:place", { code, slot: 1 });
  const rejected = await clients[1].emitWithAck("song:challenge", code);
  assert.equal(rejected.ok, false);
  assert.match(rejected.message, /alle 5/);
  clients.forEach((client) => client.close());
});

test("reconnect bevarer challenge-kø og låste svar midt i flowet", async () => {
  const { clients, code } = await setupPlayers(["host-d", "first-d", "reload-d"]);
  await start(clients, code, 1991);
  await selectAndLock(clients, 0, "song:decade", { code, decade: 1990 });
  await event(clients, 1, "song:challenge", code);
  await event(clients, 2, "song:challenge", code);
  await selectAndLock(clients, 1, "song:decade", { code, decade: 1990 });
  await clients[1].disconnect();
  await Promise.all([clients[0].nextGame(), clients[2].nextGame()]);

  const reloaded = new GameClient();
  await reloaded.connect();
  const resumed = await reloaded.emitWithAck("game:resume", { code, playerId: "first-d" });
  assert.deepEqual(resumed.game.challengeQueue, ["first-d", "reload-d"]);
  assert.equal(resumed.game.activePlayerId, "host-d");
  assert.equal(resumed.game.roundPlayerId, "host-d");
  assert.equal(resumed.game.phase, "challenge_guesses");
  assert.equal(resumed.game.challengeTurnIndex, 1);
  const player = resumed.game.players.find((item) => item.id === "first-d");
  assert.equal(player.ready, true);
  assert.equal(player.selectedDecade, 1990);
  assert.equal(player.challengesRemaining, 4);
  await Promise.all([clients[0].nextGame(), reloaded.nextGame(), clients[2].nextGame()]);

  await selectAndLock([clients[0], reloaded, clients[2]], 2, "song:decade", { code, decade: 1990 });
  const revealed = await event([clients[0], reloaded, clients[2]], 0, "song:reveal", code);
  assert.deepEqual(revealed.game.players.find((item) => item.id === "first-d").timeline, [1991]);
  clients[0].close(); reloaded.close(); clients[2].close();
});

test("forkert kronologisk placering tilføjer ikke sangen", async () => {
  const { clients, code } = await setupPlayers(["host-e"]);
  await start(clients, code, 2000);
  await selectAndLock(clients, 0, "song:decade", { code, decade: 2000 });
  await finishAndNext(clients, code);
  await start(clients, code, 1990);
  await selectAndLock(clients, 0, "song:place", { code, slot: 1 });
  const revealed = await event(clients, 0, "song:reveal", code);
  const host = revealed.game.players[0];
  assert.equal(host.lastGuessWasCorrect, false);
  assert.deepEqual(host.timeline, [2000]);
  clients[0].close();
});
