const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

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

test("hele runden gemmer placeringer, scorer og nulstiller til næste runde", async () => {
  const host = new GameClient();
  const guest = new GameClient();
  await Promise.all([host.connect(), guest.connect()]);

  const created = await host.emitWithAck("game:create", { playerName: "Vært", playerId: "round-host" });
  assert.equal(created.ok, true);
  const code = created.code;
  await host.nextGame();

  const joined = await guest.emitWithAck("game:join", { code, playerName: "Gæst", playerId: "round-guest" });
  assert.equal(joined.ok, true);
  await Promise.all([host.nextGame(), guest.nextGame()]);

  const started = await host.emitWithAck("song:start", {
    code,
    title: "Test Song",
    artist: "Test Artist",
    year: 2001,
    url: "https://example.com/song"
  });
  assert.equal(started.ok, true);
  await Promise.all([host.nextGame(), guest.nextGame()]);

  const hostPlacement = await host.emitWithAck("song:place", { code, slot: 0 });
  assert.equal(hostPlacement.game.players.find((player) => player.name === "Vært").ready, true);
  await Promise.all([host.nextGame(), guest.nextGame()]);

  const tooEarly = await host.emitWithAck("song:reveal", code);
  assert.deepEqual(tooEarly, { ok: false, message: "Vent til alle spillere er klar." });

  const guestPlacement = await guest.emitWithAck("song:place", { code, slot: 0 });
  assert.equal(guestPlacement.game.players.find((player) => player.name === "Gæst").ready, true);
  await Promise.all([host.nextGame(), guest.nextGame()]);

  const revealed = await host.emitWithAck("song:reveal", code);
  assert.equal(revealed.ok, true);
  for (const player of revealed.game.players) {
    assert.equal(player.lastGuessWasCorrect, true);
    assert.equal(player.score, 1);
    assert.deepEqual(player.timeline, [2001]);
  }
  await Promise.all([host.nextGame(), guest.nextGame()]);

  const advanced = await host.emitWithAck("song:next", code);
  assert.equal(advanced.ok, true);
  assert.equal(advanced.game.currentSong, null);
  for (const player of advanced.game.players) {
    assert.equal(player.ready, false);
    assert.equal(player.selectedSlot, null);
    assert.equal(player.lastGuessWasCorrect, null);
  }
  await Promise.all([host.nextGame(), guest.nextGame()]);

  const secondRound = await host.emitWithAck("song:start", {
    code,
    title: "Older Song",
    artist: "Test Artist",
    year: 1990,
    url: "https://example.com/older-song"
  });
  assert.equal(secondRound.ok, true);
  await Promise.all([host.nextGame(), guest.nextGame()]);

  await host.emitWithAck("song:place", { code, slot: 0 });
  await Promise.all([host.nextGame(), guest.nextGame()]);
  await guest.emitWithAck("song:place", { code, slot: 1 });
  await Promise.all([host.nextGame(), guest.nextGame()]);

  const secondReveal = await host.emitWithAck("song:reveal", code);
  const hostResult = secondReveal.game.players.find((player) => player.name === "Vært");
  const guestResult = secondReveal.game.players.find((player) => player.name === "Gæst");
  assert.equal(hostResult.lastGuessWasCorrect, true);
  assert.equal(hostResult.score, 2);
  assert.deepEqual(hostResult.timeline, [1990, 2001]);
  assert.equal(guestResult.lastGuessWasCorrect, false);
  assert.equal(guestResult.score, 1);
  assert.deepEqual(guestResult.timeline, [2001]);

  host.close();
  guest.close();
});

test("reconnect og reload bevarer session, spillerdata og værtsrolle", async () => {
  const host = new GameClient();
  const guest = new GameClient();
  await Promise.all([host.connect(), guest.connect()]);

  const created = await host.emitWithAck("game:create", {
    playerName: "Mobilvært",
    playerId: "stable-host-id"
  });
  const code = created.code;
  await host.nextGame();

  await guest.emitWithAck("game:join", {
    code,
    playerName: "Safari-spiller",
    playerId: "stable-guest-id"
  });
  await Promise.all([host.nextGame(), guest.nextGame()]);

  await host.emitWithAck("song:start", {
    code,
    title: "Reconnect Song",
    artist: "Test Artist",
    year: 2005,
    url: "https://example.com/reconnect"
  });
  await Promise.all([host.nextGame(), guest.nextGame()]);
  await host.emitWithAck("song:place", { code, slot: 0 });
  await Promise.all([host.nextGame(), guest.nextGame()]);
  await guest.emitWithAck("song:place", { code, slot: 0 });
  await Promise.all([host.nextGame(), guest.nextGame()]);
  await host.emitWithAck("song:reveal", code);
  await Promise.all([host.nextGame(), guest.nextGame()]);

  await host.disconnect();
  const hostOfflineGame = await guest.nextGame();
  const offlineHost = hostOfflineGame.players.find((player) => player.id === "stable-host-id");
  assert.equal(hostOfflineGame.hostId, "stable-host-id");
  assert.equal(offlineHost.connected, false);
  assert.equal(offlineHost.score, 1);
  assert.deepEqual(offlineHost.timeline, [2005]);

  const reconnectedHost = new GameClient();
  await reconnectedHost.connect();
  const resumedHost = await reconnectedHost.emitWithAck("game:resume", {
    code,
    playerId: "stable-host-id"
  });
  assert.equal(resumedHost.ok, true);
  assert.equal(resumedHost.game.hostId, "stable-host-id");
  const hostAfterReconnect = resumedHost.game.players.find((player) => player.id === "stable-host-id");
  assert.equal(hostAfterReconnect.connected, true);
  assert.equal(hostAfterReconnect.name, "Mobilvært");
  assert.equal(hostAfterReconnect.score, 1);
  assert.deepEqual(hostAfterReconnect.timeline, [2005]);
  assert.equal(hostAfterReconnect.ready, true);
  assert.equal(hostAfterReconnect.lastGuessWasCorrect, true);
  await Promise.all([reconnectedHost.nextGame(), guest.nextGame()]);

  const nextRound = await reconnectedHost.emitWithAck("song:next", code);
  assert.equal(nextRound.ok, true, "den genforbundne vært beholder værtsrettigheder");
  await Promise.all([reconnectedHost.nextGame(), guest.nextGame()]);

  await guest.disconnect();
  await reconnectedHost.nextGame();
  const reloadedGuest = new GameClient();
  await reloadedGuest.connect();
  const resumedGuest = await reloadedGuest.emitWithAck("game:resume", {
    code,
    playerId: "stable-guest-id"
  });
  const guestAfterReload = resumedGuest.game.players.find((player) => player.id === "stable-guest-id");
  assert.equal(guestAfterReload.connected, true);
  assert.equal(guestAfterReload.name, "Safari-spiller");
  assert.equal(guestAfterReload.score, 1);
  assert.deepEqual(guestAfterReload.timeline, [2005]);
  assert.equal(guestAfterReload.ready, false);
  assert.equal(guestAfterReload.selectedSlot, null);

  reconnectedHost.close();
  reloadedGuest.close();
});
