(() => {
  "use strict";
  let game = null;
  let previousGame = null;
  let lastRevealKey = "";

  const isEnglish = () => localStorage.getItem("timeline-party-language") === "en-US";
  const text = (da, en) => isEnglish() ? en : da;
  const myId = () => localStorage.getItem("timeline-party-player-id") || "";

  const originalIo = globalThis.io;
  if (typeof originalIo === "function") {
    globalThis.io = function (...args) {
      const socket = originalIo(...args);
      socket.on("game:update", (nextGame) => {
        previousGame = game;
        game = nextGame;
        requestAnimationFrame(updateExperience);
      });
      return socket;
    };
    Object.assign(globalThis.io, originalIo);
  }

  function currentPlayer() { return game?.players?.find((player) => player.id === myId()); }
  function activePlayer() { return game?.players?.find((player) => player.id === game?.roundPlayerId); }

  function getPhase() {
    if (!game?.currentSong) return null;
    if (game.finished) return "finished";
    if (game.showAnswer) return "revealed";
    const player = currentPlayer();
    if (player?.ready || player?.locked || player?.answerLocked) return "locked";
    return game.roundPlayerId === myId() ? "my-turn" : "other-turn";
  }

  function statusText() {
    const phase = getPhase();
    const active = activePlayer();
    if (phase === "my-turn") return ["🎯", text("Din tur", "Your turn"), text("Vælg dit svar og lås det, når du er klar.", "Choose your answer and lock it when you're ready.")];
    if (phase === "other-turn") return ["👀", text("Følg med", "Watch closely"), active ? text(`${active.name} har turen.`, `It's ${active.name}'s turn.`) : text("En anden spiller har turen.", "Another player is taking their turn.")];
    if (phase === "locked") return ["✅", text("Svar låst", "Answer locked"), text("Dit svar er gemt. Du kan følge med.", "Your answer is saved. You can follow along.")];
    if (phase === "revealed") return ["🎉", text("Svar afsløret", "Answer revealed"), text("Se resultatet og gør klar til næste sang.", "Check the result and get ready for the next song.")];
    return null;
  }

  function updateTurnCard() {
    document.querySelector(".gx-turn-card")?.remove();
    const copy = statusText();
    const hero = document.querySelector(".hero-card");
    if (!copy || !hero) return;
    const card = document.createElement("section");
    card.className = `card gx-turn-card gx-${getPhase()}`;
    card.innerHTML = `<div class="gx-turn-icon">${copy[0]}</div><div><p class="eyebrow">${copy[1]}</p><h2>${copy[2]}</h2></div>`;
    hero.after(card);
  }

  function showToast(message) {
    document.querySelector(".gx-toast")?.remove();
    const toast = document.createElement("div");
    toast.className = "gx-toast";
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("show"));
    setTimeout(() => { toast.classList.remove("show"); setTimeout(() => toast.remove(), 250); }, 1400);
  }

  function detectNewTimelineSong() {
    if (!previousGame?.players || !game?.players) return;
    for (const player of game.players) {
      const oldPlayer = previousGame.players.find((item) => item.id === player.id);
      if (!oldPlayer) continue;
      if ((player.timeline?.length || 0) > (oldPlayer.timeline?.length || 0)) {
        showToast(text(`🎵 Sangen blev lagt på ${player.name}s tidslinje`, `🎵 The song was added to ${player.name}'s timeline`));
        document.querySelectorAll(".timeline, .timeline-list").forEach((item) => item.classList.add("gx-timeline-pulse"));
        setTimeout(() => document.querySelectorAll(".gx-timeline-pulse").forEach((item) => item.classList.remove("gx-timeline-pulse")), 1400);
        break;
      }
    }
  }

  function showReveal() {
    if (!game?.showAnswer || !game.currentSong) return;
    const key = `${game.code}:${game.roundNumber}`;
    if (key === lastRevealKey) return;
    lastRevealKey = key;
    const song = game.currentSong;
    const overlay = document.createElement("div");
    overlay.className = "gx-reveal";
    overlay.innerHTML = `<div class="gx-reveal-card"><p class="eyebrow">${text("SVARET ER", "THE ANSWER IS")}</p><div class="gx-reveal-year">${song.year || "?"}</div><h2>${song.title || ""}</h2><p>${song.artist || ""}</p><button type="button" data-gx-dismiss>${text("Fortsæt", "Continue")}</button></div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("show"));
    const dismiss = () => { overlay.classList.remove("show"); setTimeout(() => overlay.remove(), 250); };
    overlay.querySelector("[data-gx-dismiss]")?.addEventListener("click", dismiss);
    setTimeout(dismiss, 3200);
  }

  function improveLongTimelines() {
    document.querySelectorAll(".timeline, .timeline-list, [data-timeline]").forEach((item) => item.classList.add("gx-timeline-scroll"));
  }

  function challengePlayerIds() {
    const ids = new Set();
    const add = (value) => {
      if (!value) return;
      if (typeof value === "string") ids.add(value);
      else if (value.playerId) ids.add(value.playerId);
      else if (value.id) ids.add(value.id);
    };
    [game?.challengers, game?.challengePlayers, game?.challengeQueue, game?.challenges].forEach((list) => {
      if (Array.isArray(list)) list.forEach(add);
    });
    game?.players?.forEach((player) => {
      if (player.challenging || player.challengeActive || player.hasChallenged || player.challengePending) ids.add(player.id);
    });
    return [...ids];
  }

  function announceGameplayPhase() {
    const active = activePlayer();
    document.dispatchEvent(new CustomEvent("timeline-party-game-phase", {
      detail: {
        active: Boolean(game?.currentSong && !game?.finished),
        phase: getPhase(),
        roundNumber: game?.roundNumber || 0,
        activePlayerId: active?.id || game?.roundPlayerId || "",
        activePlayerName: active?.name || "",
        challengerIds: challengePlayerIds()
      }
    }));
  }

  function updateExperience() {
    updateTurnCard(); improveLongTimelines(); detectNewTimelineSong(); showReveal(); announceGameplayPhase();
  }

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    if (button.dataset.action === "lockAnswer") showToast(text("✅ Svar låst", "✅ Answer locked"));
    if (button.dataset.action === "challengeSong") showToast(text("⚡ Challenge valgt", "⚡ Challenge selected"));
    if (button.dataset.action === "passChallenge") showToast(text("👍 Pas registreret", "👍 Pass registered"));
    if (button.dataset.action === "placeSong" || button.dataset.action === "guessDecade") showToast(text("🎯 Valg registreret", "🎯 Choice registered"));
  }, true);

  document.addEventListener("timeline-party-language-change", () => requestAnimationFrame(updateTurnCard));
  new MutationObserver(() => requestAnimationFrame(improveLongTimelines)).observe(document.querySelector("#app") || document.documentElement, { childList: true, subtree: true });
})();

(() => {
  if (document.querySelector('script[data-timeline-video]')) return;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = '/video-chat.css?v=4'; document.head.appendChild(css);
  const script = document.createElement('script'); script.src = '/video-chat.js?v=4'; script.dataset.timelineVideo = '1'; document.head.appendChild(script);
})();
