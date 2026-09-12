(() => {
  "use strict";

  const DECADES = [1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020];

  function blockedEqualYearSlot(timeline, slot) {
    return slot > 0 && slot < timeline.length && timeline[slot - 1] === timeline[slot];
  }

  function validSlots(timeline) {
    const slots = [];
    for (let slot = 0; slot <= timeline.length; slot += 1) {
      if (!blockedEqualYearSlot(timeline, slot)) slots.push(slot);
    }
    return slots;
  }

  globalThis.renderChallengeChoice = function renderChallengeChoiceFixed(player) {
    const activePlayer = game.players.find((item) => item.id === game.roundPlayerId);
    const usesDecade = activePlayer.timeline.length === 0;
    const occupied = new Set(game.players
      .filter((item) => item.ready)
      .map((item) => usesDecade ? item.selectedDecade : item.selectedSlot)
      .filter(Number.isInteger));
    const reserved = game.challengeQueue.filter((id) => {
      const challenger = game.players.find((item) => item.id === id);
      return challenger && !challenger.ready;
    }).length;
    const options = usesDecade ? DECADES : validSlots(activePlayer.timeline);
    const occupiedValid = [...occupied].filter((value) => options.includes(value)).length;
    const hasAvailableAnswer = options.length - occupiedValid - reserved > 0;
    const maxChallenges = Number(game.settings?.maxChallenges ?? 5);
    return `
      <div class="challenge-choice">
        <p><strong>${activePlayer.name}</strong> har låst sit svar. Vil du challenge?</p>
        <p class="hint">Du har ${player.challengesRemaining}/${maxChallenges} challenges tilbage.</p>
        ${hasAvailableAnswer ? "" : '<p class="hint">Alle svarmuligheder er optaget. Du registreres automatisk som Pas.</p>'}
        <div class="choice-actions">
          <button type="button" class="challenge-button" data-action="challengeSong" ${player.challengesRemaining > 0 && hasAvailableAnswer ? "" : "disabled"}>Challenge</button>
          <button type="button" class="secondary" data-action="passChallenge">Nej tak / Pas</button>
        </div>
      </div>
    `;
  };

  globalThis.renderGuess = function renderGuessFixed(player, activePlayer) {
    if (player.ready) return '<div class="ready-message" role="status"><strong>Svaret er låst!</strong></div>';
    const referenceTimeline = activePlayer.timeline;
    const usesDecade = referenceTimeline.length === 0;
    const occupiedAnswers = new Set(game.players
      .filter((other) => other.id !== player.id && other.ready)
      .map((other) => usesDecade ? other.selectedDecade : other.selectedSlot));

    if (!usesDecade) {
      const selectedIsValid = Number.isInteger(player.selectedSlot) && !blockedEqualYearSlot(referenceTimeline, player.selectedSlot);
      return `${globalThis.renderTimeline(referenceTimeline, player, occupiedAnswers)}<p class="hint">Placér sangen ud fra ${escapeHtml(activePlayer.name)}s tidslinje. Grå placeringer er optaget.</p><button type="button" data-action="lockAnswer" ${selectedIsValid ? "" : "disabled"}>Lås svar</button>`;
    }

    const decades = DECADES.map((decade) => {
      const selected = player.selectedDecade === decade;
      const occupied = occupiedAnswers.has(decade);
      return `<button type="button" class="decade ${selected ? "selected" : ""} ${occupied ? "occupied" : ""}" data-action="guessDecade" data-decade="${decade}" ${occupied ? "disabled" : ""}>${decade}'erne${selected ? " ✓" : occupied ? " · Optaget" : ""}</button>`;
    });

    return `<p class="hint">Den aktive spillers tidslinje er tom. Vælg hvilket årti sangen er fra.</p><div class="decades">${decades.join("")}</div><button type="button" data-action="lockAnswer" ${Number.isInteger(player.selectedDecade) ? "" : "disabled"}>Lås svar</button>`;
  };

  globalThis.renderTimeline = function renderTimelineFixed(timeline, player, occupiedAnswers) {
    const slots = [];
    for (let index = 0; index <= timeline.length; index += 1) {
      const blocked = blockedEqualYearSlot(timeline, index);
      const isSelected = player.selectedSlot === index && !blocked;
      const occupied = occupiedAnswers.has(index);
      const disabled = player.ready || occupied || blocked;
      const label = blocked ? "Ikke mulig" : isSelected ? "Valgt ✓" : occupied ? "Optaget" : "Placér her";
      slots.push(`<button type="button" class="slot ${isSelected ? "selected" : ""} ${occupied || blocked ? "occupied" : ""}" data-action="placeSong" data-slot="${index}" ${disabled ? "disabled" : ""}>${label}</button>`);
      if (index < timeline.length) slots.push(`<div class="year">${timeline[index]}</div>`);
    }
    return `<div class="timeline">${slots.join("")}</div>`;
  };
})();
