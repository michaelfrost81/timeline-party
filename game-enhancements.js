(() => {
  "use strict";

  const SETTINGS_KEY = "timeline-party-settings-v1";
  const HISTORY_KEY = "timeline-party-history-v1";
  const CORRECTIONS_KEY = "timeline-party-card-corrections-v1";
  const defaults = { winMode: "firstTo", targetScore: 10, roundLimit: 15, challenges: 5, challengesEnabled: true, answerTimer: 0 };
  let settings = { ...defaults, ...read(SETTINGS_KEY, {}) };
  let history = read(HISTORY_KEY, []);
  let previousGame = null;
  let settingsOpen = false;
  let statsOpen = false;
  let correctionsOpen = false;
  let timer = null;
  let timerKey = "";

  function read(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
  function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  function esc(value) { return String(value ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
  function isHost() { return globalThis.game && game.hostId === globalThis.myPlayerId; }

  function corrections() { return read(CORRECTIONS_KEY, {}); }
  function applyCorrections() {
    if (!globalThis.HITSTER_DK_CARDS) return;
    Object.entries(corrections()).forEach(([id, year]) => {
      if (globalThis.HITSTER_DK_CARDS[id]) globalThis.HITSTER_DK_CARDS[id] = { ...globalThis.HITSTER_DK_CARDS[id], year: Number(year), source: "local-physical-card" };
    });
  }
  applyCorrections();

  function recordRound(next) {
    if (!previousGame || !next || !next.showAnswer || previousGame.showAnswer || next.roundNumber !== previousGame.roundNumber) return;
    const row = { at: Date.now(), code: next.code, round: next.roundNumber, songYear: next.currentSong?.year, players: next.players.map(p => ({ name:p.name, correct:p.lastGuessWasCorrect === true, score:p.score })) };
    history.unshift(row); history = history.slice(0, 250); save(HISTORY_KEY, history);
  }

  function winnerText(g) {
    if (!g) return "";
    const max = Math.max(0, ...g.players.map(p => p.score));
    const leaders = g.players.filter(p => p.score === max);
    if (!leaders.length) return "";
    return leaders.length === 1 ? `${leaders[0].name} fører med ${max} point` : `${leaders.map(p=>p.name).join(" & ")} fører med ${max} point`;
  }

  function endReached(g) {
    if (!g) return false;
    if (settings.winMode === "firstTo") return g.players.some(p => p.score >= Number(settings.targetScore));
    if (settings.winMode === "rounds") return g.roundNumber >= Number(settings.roundLimit) && g.showAnswer;
    return false;
  }

  function decorate() {
    const g = globalThis.game;
    if (!g) return;
    const hero = document.querySelector(".hero-card");
    if (hero && !hero.querySelector(".enhance-status")) {
      const p = document.createElement("p"); p.className="enhance-status";
      const active = g.players.find(x=>x.id===g.roundPlayerId || x.id===g.activePlayerId);
      p.textContent = g.currentSong ? `🎯 Runde ${g.roundNumber} · ${active ? `${active.name}s tur` : "Runde i gang"}` : `🎮 ${winnerText(g)}`;
      hero.appendChild(p);
    }
    if (g.showAnswer && !document.querySelector(".round-celebration")) {
      const round = document.querySelector(".round-card") || hero;
      const winners = g.players.filter(p=>p.lastGuessWasCorrect).map(p=>p.name);
      const box=document.createElement("div"); box.className="round-celebration";
      box.innerHTML = winners.length ? `<strong>🎉 Korrekt!</strong><br>${esc(winners.join(", "))}` : `<strong>🎵 Svaret er afsløret</strong><br>Ingen ramte denne gang.`;
      round?.prepend(box);
    }
    if (endReached(g) && !document.querySelector(".game-finish-banner")) {
      const max=Math.max(...g.players.map(p=>p.score)); const winners=g.players.filter(p=>p.score===max);
      const box=document.createElement("section"); box.className="card game-finish-banner";
      box.innerHTML=`<p class="eyebrow">Spillet er slut</p><h2>🏆 ${esc(winners.map(p=>p.name).join(" & "))}</h2><p>${max} point · ${g.roundNumber} runder</p>`;
      hero?.after(box);
    }
    const actions=document.querySelector(".game-actions") || document.querySelector("main#app section:last-of-type");
    if (actions && isHost() && !document.querySelector('[data-enhance="settings"]')) {
      const wrap=document.createElement("div"); wrap.className="enhance-tools";
      wrap.innerHTML='<button type="button" data-enhance="settings">⚙️ Spilindstillinger</button><button type="button" data-enhance="corrections">🃏 Kortrettelser</button><button type="button" data-enhance="stats">📊 Statistik</button>';
      actions.appendChild(wrap);
    }
    renderPanels();
    manageTimer(g);
  }

  function renderPanels() {
    document.querySelectorAll(".enhance-panel").forEach(n=>n.remove());
    const root=document.querySelector("#app"); if(!root) return;
    if(settingsOpen) root.insertAdjacentHTML("beforeend", `<section class="card enhance-panel"><h2>⚙️ Spilindstillinger</h2><label>Spiltype<select id="enh-win"><option value="firstTo" ${settings.winMode==='firstTo'?'selected':''}>Først til point</option><option value="rounds" ${settings.winMode==='rounds'?'selected':''}>Fast antal runder</option><option value="host" ${settings.winMode==='host'?'selected':''}>Værten afslutter</option></select></label><label>Point for sejr<input id="enh-score" type="number" min="1" max="50" value="${settings.targetScore}"></label><label>Antal runder<input id="enh-rounds" type="number" min="1" max="100" value="${settings.roundLimit}"></label><label>Challenges pr. spiller<input id="enh-challenges" type="number" min="0" max="20" value="${settings.challenges}"></label><label><input id="enh-challenges-on" type="checkbox" ${settings.challengesEnabled?'checked':''}> Challenges slået til</label><label>Svar-timer (sek., 0 = fra)<input id="enh-timer" type="number" min="0" max="120" value="${settings.answerTimer}"></label><button data-enhance="save-settings">Gem indstillinger</button><button data-enhance="close">Luk</button></section>`);
    if(statsOpen) { const totals={}; history.forEach(r=>r.players.forEach(p=>{totals[p.name]??={rounds:0,correct:0};totals[p.name].rounds++;if(p.correct)totals[p.name].correct++;})); root.insertAdjacentHTML("beforeend", `<section class="card enhance-panel"><h2>📊 Spilhistorik og statistik</h2>${Object.entries(totals).length?Object.entries(totals).map(([n,s])=>`<p><strong>${esc(n)}</strong>: ${s.correct}/${s.rounds} korrekte (${Math.round(s.correct/s.rounds*100)}%)</p>`).join(""):"<p>Ingen afsluttede runder gemt endnu.</p>"}<p>Gemte runder: ${history.length}</p><button data-enhance="clear-stats">Nulstil statistik</button><button data-enhance="close">Luk</button></section>`); }
    if(correctionsOpen) { const rows=Object.entries(corrections()); root.insertAdjacentHTML("beforeend", `<section class="card enhance-panel"><h2>🃏 Rettede Hitster-kort</h2>${rows.length?rows.map(([id,y])=>`<p>Kort ${Number(id)} → <strong>${y}</strong> <button data-enhance="delete-correction" data-card="${id}">Slet</button></p>`).join(""):"<p>Ingen lokale rettelser endnu.</p>"}<p class="muted">Rettelser lavet via “Ret årstal” vises her, når de er gemt lokalt.</p><button data-enhance="close">Luk</button></section>`); }
  }

  function manageTimer(g) {
    const key = g.currentSong && !g.showAnswer ? `${g.code}:${g.roundNumber}:${g.phase}` : "";
    if (!key || !settings.answerTimer) { clearInterval(timer); timer=null; timerKey=""; document.querySelector(".answer-countdown")?.remove(); return; }
    if (timerKey === key) return;
    clearInterval(timer); timerKey=key; let left=Number(settings.answerTimer);
    const round=document.querySelector(".round-card") || document.querySelector(".hero-card");
    const el=document.createElement("p"); el.className="answer-countdown"; el.textContent=`⏱ ${left} sek.`; round?.prepend(el);
    timer=setInterval(()=>{ left--; if(el.isConnected) el.textContent=`⏱ ${Math.max(0,left)} sek.`; if(left<=0){clearInterval(timer);timer=null;} },1000);
  }

  document.addEventListener("click", e=>{
    const b=e.target.closest("[data-enhance]"); if(!b)return;
    const a=b.dataset.enhance;
    if(a==="settings") settingsOpen=!settingsOpen;
    if(a==="stats") statsOpen=!statsOpen;
    if(a==="corrections") correctionsOpen=!correctionsOpen;
    if(a==="close") settingsOpen=statsOpen=correctionsOpen=false;
    if(a==="save-settings") { settings={...settings,winMode:document.querySelector("#enh-win").value,targetScore:+document.querySelector("#enh-score").value,roundLimit:+document.querySelector("#enh-rounds").value,challenges:+document.querySelector("#enh-challenges").value,challengesEnabled:document.querySelector("#enh-challenges-on").checked,answerTimer:+document.querySelector("#enh-timer").value}; save(SETTINGS_KEY,settings); settingsOpen=false; }
    if(a==="clear-stats" && confirm("Nulstil gemt statistik?")){history=[];save(HISTORY_KEY,history);}
    if(a==="delete-correction"){const c=corrections();delete c[b.dataset.card];save(CORRECTIONS_KEY,c);location.reload();return;}
    setTimeout(decorate,0);
  }, true);

  const observer=new MutationObserver(()=>requestAnimationFrame(decorate));
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setInterval(()=>{ const g=globalThis.game; if(g!==previousGame){recordRound(g); previousGame=g?JSON.parse(JSON.stringify(g)):null;} decorate(); },750);
  decorate();
})();
