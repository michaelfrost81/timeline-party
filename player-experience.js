(() => {
  "use strict";

  const HISTORY_KEY = "timeline-party-history-v2";
  const PROFILE_KEY = "timeline-party-profile-v1";

  const read = (key, fallback) => {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  };

  const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;"
  }[character]));

  const initials = (name) => String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

  const locale = () => localStorage.getItem("timeline-party-language") === "en-US" ? "en-US" : "da-DK";
  const isEnglish = () => locale() === "en-US";
  const t = (danish, english) => isEnglish() ? english : danish;

  let game = null;
  let historyOpen = false;
  let profileOpen = false;
  let historyDetail = null;

  const originalIo = globalThis.io;
  if (typeof originalIo === "function") {
    globalThis.io = function (...args) {
      const socket = originalIo(...args);
      socket.on("game:update", (nextGame) => {
        game = nextGame;
        setTimeout(decorate, 0);
      });
      return socket;
    };
    Object.assign(globalThis.io, originalIo);
  }

  function history() {
    const data = read(HISTORY_KEY, { rounds: [], games: [] });
    return {
      rounds: Array.isArray(data.rounds) ? data.rounds : [],
      games: Array.isArray(data.games) ? data.games : []
    };
  }

  function profile() {
    return { avatar: "🎵", ...read(PROFILE_KEY, {}) };
  }

  const playerKey = (player) => player.id ? `id:${player.id}` : `name:${player.name}`;

  function aggregate() {
    const data = history();
    const output = {};

    data.rounds.forEach((round) => round.players?.forEach((player) => {
      const key = playerKey(player);
      output[key] ??= {
        id: player.id,
        name: player.name,
        rounds: 0,
        correct: 0,
        wins: 0,
        games: 0,
        points: 0,
        bestScore: 0,
        recent: []
      };
      output[key].rounds++;
      if (player.correct) output[key].correct++;
    }));

    data.games.forEach((savedGame) => savedGame.players?.forEach((player) => {
      const key = playerKey(player);
      output[key] ??= {
        id: player.id,
        name: player.name,
        rounds: 0,
        correct: 0,
        wins: 0,
        games: 0,
        points: 0,
        bestScore: 0,
        recent: []
      };
      const stats = output[key];
      const score = Number(player.score) || 0;
      stats.games++;
      stats.points += score;
      stats.bestScore = Math.max(stats.bestScore, score);
      if (player.winner) stats.wins++;
      stats.recent.push({ at: savedGame.at, winner: Boolean(player.winner), score });
    }));

    Object.values(output).forEach((stats) => stats.recent.sort((a, b) => b.at - a.at));
    return output;
  }

  function myStats() {
    const all = aggregate();
    const id = localStorage.getItem("timeline-party-player-id");
    const name = localStorage.getItem("timeline-party-name") || t("Spiller", "Player");
    return all[`id:${id}`]
      || Object.values(all).find((stats) => stats.name === name)
      || { name, rounds: 0, correct: 0, wins: 0, games: 0, points: 0, bestScore: 0, recent: [] };
  }

  function addLobby() {
    if (!game || game.currentSong || game.finished) return;
    const hero = document.querySelector(".hero-card");
    if (!hero || document.querySelector(".experience-lobby")) return;

    const section = document.createElement("section");
    section.className = "card experience-lobby";
    section.innerHTML = `
      <h2>👥 ${t("Spillere i lobbyen", "Players in the lobby")}</h2>
      <div class="lobby-grid">
        ${game.players.map((player) => `
          <div class="lobby-player">
            <span class="avatar">${esc(initials(player.name))}</span>
            <strong>${esc(player.name)}</strong>
            <small>${player.connected === false ? `🔴 ${t("Offline", "Offline")}` : `🟢 ${t("Klar", "Ready")}`}</small>
          </div>
        `).join("")}
      </div>
      <div class="invite-box">
        <strong>${t("Invitér spillere", "Invite players")}</strong>
        <span>${t("Spilkode", "Game code")}: <b>${esc(game.code)}</b></span>
        <button type="button" data-xp="copy-code">📋 ${t("Kopiér spilkode", "Copy game code")}</button>
      </div>`;
    hero.after(section);
  }

  function addProfileButton() {
    const tools = document.querySelector(".enhance-tools");
    if (!tools || tools.querySelector('[data-xp="profile"]')) return;

    const currentProfile = profile();
    const profileButton = document.createElement("button");
    profileButton.type = "button";
    profileButton.dataset.xp = "profile";
    profileButton.textContent = `${currentProfile.avatar} ${t("Min profil", "My profile")}`;
    tools.appendChild(profileButton);

    const historyButton = document.createElement("button");
    historyButton.type = "button";
    historyButton.dataset.xp = "history";
    historyButton.textContent = `🕘 ${t("Spilhistorik", "Game history")}`;
    tools.appendChild(historyButton);
  }

  function addFinish() {
    if (!game?.finished) return;
    const banner = document.querySelector(".game-finish-banner");
    if (!banner || banner.querySelector(".final-standings")) return;

    const sorted = [...game.players].sort((a, b) => b.score - a.score);
    banner.insertAdjacentHTML("beforeend", `
      <div class="final-standings">
        <h3>${t("Slutstilling", "Final standings")}</h3>
        ${sorted.map((player, index) => `
          <div><b>${index + 1}. ${esc(player.name)}</b><span>${player.score} ${t("point", "points")}</span></div>
        `).join("")}
      </div>
      <button type="button" data-action="restartGame">🔄 ${t("Spil revanche", "Play again")}</button>`);
  }

  function statCards(stats) {
    const accuracy = stats.rounds ? Math.round(stats.correct / stats.rounds * 100) : 0;
    const winRate = stats.games ? Math.round(stats.wins / stats.games * 100) : 0;
    const average = stats.games ? (stats.points / stats.games).toFixed(1) : "0.0";
    return `
      <div class="xp-stat-grid">
        <div><strong>${accuracy}%</strong><span>${t("Træfsikkerhed", "Accuracy")}</span></div>
        <div><strong>${winRate}%</strong><span>${t("Sejrsrate", "Win rate")}</span></div>
        <div><strong>${average}</strong><span>${t("Point pr. spil", "Points per game")}</span></div>
        <div><strong>${stats.bestScore || 0}</strong><span>${t("Bedste score", "Best score")}</span></div>
      </div>`;
  }

  function gameSummary(savedGame, index) {
    const players = [...(savedGame.players || [])].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
    const winners = players.filter((player) => player.winner).map((player) => player.name).join(" & ") || "–";
    const date = new Date(savedGame.at);
    const loc = locale();
    const playerText = players.length === 1 ? t("spiller", "player") : t("spillere", "players");
    const roundText = Number(savedGame.rounds) === 1 ? t("runde", "round") : t("runder", "rounds");
    return `
      <button class="history-game history-game-button" data-xp="history-detail" data-index="${index}">
        <span><strong>${date.toLocaleDateString(loc)}</strong><small>${date.toLocaleTimeString(loc, { hour: "2-digit", minute: "2-digit" })}</small></span>
        <span>🏆 ${esc(winners)}<br><small>${players.length} ${playerText} · ${Number(savedGame.rounds) || 0} ${roundText}</small></span>
      </button>`;
  }

  function historyPanel() {
    const data = history();

    if (historyDetail !== null) {
      const savedGame = data.games[historyDetail];
      if (!savedGame) {
        historyDetail = null;
        return historyPanel();
      }

      const players = [...(savedGame.players || [])].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0));
      const relatedRounds = data.rounds
        .filter((round) => String(round.key || "").startsWith(String(savedGame.key || "").split(":finished")[0]))
        .sort((a, b) => (a.round || 0) - (b.round || 0));
      const roundCount = Number(savedGame.rounds) || 0;

      return `
        <section class="card xp-panel">
          <h2>🎮 ${t("Spildetaljer", "Game details")}</h2>
          <p><strong>${new Date(savedGame.at).toLocaleString(locale())}</strong><br>${roundCount} ${roundCount === 1 ? t("runde", "round") : t("runder", "rounds")}</p>
          <div class="history-standing">
            ${players.map((player, index) => `
              <div><b>${index + 1}. ${esc(player.name)}${player.winner ? " 🏆" : ""}</b><span>${Number(player.score) || 0} ${t("point", "points")}</span></div>
            `).join("")}
          </div>
          ${relatedRounds.length ? `
            <h3>${t("Runder", "Rounds")}</h3>
            <div class="round-history">
              ${relatedRounds.map((round) => `
                <div>
                  <b>${t("Runde", "Round")} ${round.round}</b>
                  <span>${round.year || "?"}</span>
                  <small>${(round.players || []).filter((player) => player.correct).map((player) => esc(player.name)).join(", ") || t("Ingen korrekte", "No correct answers")}</small>
                </div>
              `).join("")}
            </div>` : ""}
          <button data-xp="history-back">← ${t("Tilbage", "Back")}</button>
          <button data-xp="close">${t("Luk", "Close")}</button>
        </section>`;
    }

    return `
      <section class="card xp-panel">
        <h2>🕘 ${t("Spilhistorik", "Game history")}</h2>
        <p>${data.games.length} ${t("afsluttede spil gemt på denne enhed.", "completed games saved on this device.")}</p>
        ${data.games.length
          ? data.games.slice(0, 30).map((savedGame, index) => gameSummary(savedGame, index)).join("")
          : `<p>${t("Ingen tidligere spil endnu.", "No previous games yet.")}</p>`}
        <button data-xp="close">${t("Luk", "Close")}</button>
      </section>`;
  }

  function profilePanel() {
    const currentProfile = profile();
    const name = localStorage.getItem("timeline-party-name") || t("Spiller", "Player");
    const stats = myStats();
    const recent = (stats.recent || []).slice(0, 5);
    const gameWord = stats.games === 1 ? t("spil", "game") : t("spil", "games");
    const winWord = stats.wins === 1 ? t("sejr", "win") : t("sejre", "wins");

    return `
      <section class="card xp-panel">
        <h2>${esc(currentProfile.avatar)} ${t("Min profil", "My profile")}</h2>
        <div class="profile-hero">
          <span class="profile-avatar">${esc(currentProfile.avatar)}</span>
          <div><strong>${esc(name)}</strong><small>${stats.games} ${gameWord} · ${stats.wins} ${winWord}</small></div>
        </div>
        <label>${t("Vælg avatar", "Choose avatar")}
          <select id="xp-avatar"><option>🎵</option><option>🎧</option><option>🎸</option><option>🪩</option><option>🐰</option><option>⭐</option><option>🔥</option><option>🏆</option></select>
        </label>
        ${statCards(stats)}
        <div class="xp-stats-detail">
          <p><b>${stats.correct}/${stats.rounds}</b> ${t("korrekte svar", "correct answers")}</p>
          <p><b>${stats.points}</b> ${t("point i alt", "total points")}</p>
        </div>
        ${recent.length ? `
          <h3>${t("Seneste spil", "Recent games")}</h3>
          <div class="recent-form">${recent.map((item) => `<span title="${new Date(item.at).toLocaleDateString(locale())}">${item.winner ? "🏆" : "•"} ${item.score}p</span>`).join("")}</div>` : ""}
        <button data-xp="save-profile">${t("Gem profil", "Save profile")}</button>
        <button data-xp="close">${t("Luk", "Close")}</button>
      </section>`;
  }

  function closeXpPanels() {
    historyOpen = false;
    profileOpen = false;
    historyDetail = null;
    document.querySelectorAll(".xp-panel").forEach((node) => node.remove());
  }

  function panels() {
    document.querySelectorAll(".xp-panel").forEach((node) => node.remove());
    const root = document.querySelector("#app");
    if (!root) return;

    if (historyOpen) root.insertAdjacentHTML("beforeend", historyPanel());
    if (profileOpen) {
      root.insertAdjacentHTML("beforeend", profilePanel());
      const select = document.querySelector("#xp-avatar");
      if (select) select.value = profile().avatar;
    }
  }

  function decorate() {
    addLobby();
    addProfileButton();
    addFinish();
    if ((historyOpen || profileOpen) && !document.querySelector(".xp-panel")) panels();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-xp]");
    if (!button) return;

    event.preventDefault();
    const action = button.dataset.xp;

    if (action === "copy-code" && game?.code) {
      navigator.clipboard?.writeText(game.code);
      button.textContent = `✅ ${t("Kopieret", "Copied")}`;
    }

    if (action === "history") {
      document.dispatchEvent(new CustomEvent("timeline-party-xp-panel-open"));
      historyOpen = true;
      profileOpen = false;
      historyDetail = null;
      panels();
    }

    if (action === "history-detail") {
      historyDetail = Number(button.dataset.index);
      panels();
    }

    if (action === "history-back") {
      historyDetail = null;
      panels();
    }

    if (action === "profile") {
      document.dispatchEvent(new CustomEvent("timeline-party-xp-panel-open"));
      profileOpen = true;
      historyOpen = false;
      historyDetail = null;
      panels();
    }

    if (action === "close") closeXpPanels();

    if (action === "save-profile") {
      localStorage.setItem(PROFILE_KEY, JSON.stringify({ avatar: document.querySelector("#xp-avatar")?.value || "🎵" }));
      closeXpPanels();
      decorate();
    }
  }, true);

  document.addEventListener("timeline-party-enhance-panel-open", closeXpPanels);

  document.addEventListener("timeline-party-language-change", () => {
    document.querySelectorAll(".experience-lobby").forEach((node) => node.remove());
    const tools = document.querySelector(".enhance-tools");
    tools?.querySelectorAll('[data-xp="profile"],[data-xp="history"]').forEach((node) => node.remove());
    decorate();
    if (historyOpen || profileOpen) panels();
  });

  new MutationObserver(() => requestAnimationFrame(decorate)).observe(
    document.querySelector("#app") || document.documentElement,
    { childList: true, subtree: true }
  );
})();
