(() => {
  "use strict";

  const HISTORY_KEY = "timeline-party-history-v2";
  const PROFILE_KEY = "timeline-party-profile-v1";
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const esc = (value) => String(value ?? "").replace(/[&<>\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const initials = (name) => String(name || "?").trim().split(/\s+/).slice(0,2).map((part)=>part[0]?.toUpperCase()).join("") || "?";
  const locale = () => localStorage.getItem("timeline-party-language") === "en-US" ? "en-US" : "da-DK";
  const isEnglish = () => locale() === "en-US";
  const t = (da,en) => isEnglish() ? en : da;

  let game = null;
  let historyOpen = false;
  let profileOpen = false;
  let historyDetail = null;

  const originalIo = globalThis.io;
  if (typeof originalIo === "function") {
    globalThis.io = function (...args) {
      const socket = originalIo(...args);
      socket.on("game:update", (nextGame) => { game = nextGame; setTimeout(decorate, 0); });
      return socket;
    };
    Object.assign(globalThis.io, originalIo);
  }

  function history() {
    const data = read(HISTORY_KEY, { rounds: [], games: [] });
    return { rounds: Array.isArray(data.rounds) ? data.rounds : [], games: Array.isArray(data.games) ? data.games : [] };
  }
  function profile() { return { avatar: "🎵", ...read(PROFILE_KEY, {}) }; }
  const myId = () => localStorage.getItem("timeline-party-player-id") || "";
  const playerKey = (player) => player.id ? `id:${player.id}` : `name:${player.name}`;

  function aggregate() {
    const data = history();
    const output = {};
    data.rounds.forEach((round) => round.players?.forEach((player) => {
      const key = playerKey(player);
      output[key] ??= { id:player.id, name:player.name, rounds:0, correct:0, wins:0, games:0, points:0, bestScore:0, recent:[] };
      output[key].rounds++;
      if (player.correct) output[key].correct++;
    }));
    data.games.forEach((savedGame) => savedGame.players?.forEach((player) => {
      const key = playerKey(player);
      output[key] ??= { id:player.id, name:player.name, rounds:0, correct:0, wins:0, games:0, points:0, bestScore:0, recent:[] };
      const stats = output[key], score = Number(player.score) || 0;
      stats.games++; stats.points += score; stats.bestScore = Math.max(stats.bestScore, score);
      if (player.winner) stats.wins++;
      stats.recent.push({ at:savedGame.at, winner:Boolean(player.winner), score });
    }));
    Object.values(output).forEach((stats) => stats.recent.sort((a,b)=>b.at-a.at));
    return output;
  }

  function myStats() {
    const all = aggregate();
    const id = myId();
    const name = localStorage.getItem("timeline-party-name") || t("Spiller", "Player");
    return all[`id:${id}`] || Object.values(all).find((stats)=>stats.name===name) || { name, rounds:0, correct:0, wins:0, games:0, points:0, bestScore:0, recent:[] };
  }

  function inviteUrl() {
    const url = new URL(location.origin);
    if (game?.code) url.searchParams.set("join", game.code);
    return url.toString();
  }

  function renderInviteQr() {
    const target = document.querySelector("#xp-invite-qr");
    if (!target || target.dataset.ready === "1" || typeof globalThis.QRCode !== "function") return;
    target.dataset.ready = "1";
    try {
      new globalThis.QRCode(target, { text: inviteUrl(), width:156, height:156, correctLevel:globalThis.QRCode.CorrectLevel.M });
    } catch { target.textContent = game?.code || ""; }
  }

  function addLobby() {
    if (!game || game.currentSong || game.finished) return;
    const hero = document.querySelector(".hero-card");
    if (!hero || document.querySelector(".experience-lobby")) return;
    const currentProfile = profile();
    const connected = game.players.filter((p)=>p.connected!==false).length;
    const section = document.createElement("section");
    section.className = "card experience-lobby";
    section.innerHTML = `
      <div class="xp-lobby-head">
        <div><h2>👥 ${t("Spillere i lobbyen","Players in the lobby")}</h2><p class="hint">${connected}/${game.players.length} ${t("online","online")}</p></div>
      </div>
      <div class="lobby-grid xp-lobby-grid">
        ${game.players.map((player) => {
          const mine = player.id === myId();
          const avatar = mine ? currentProfile.avatar : initials(player.name);
          return `<div class="lobby-player ${mine ? "is-me" : ""}">
            <span class="avatar">${esc(avatar)}</span>
            <strong>${esc(player.name)}</strong>
            ${player.id === game.hostId ? `<small>⭐ ${t("Vært","Host")}</small>` : ""}
            <small>${player.connected === false ? `🔴 ${t("Offline","Offline")}` : `🟢 ${t("Online","Online")}`}</small>
          </div>`;
        }).join("")}
      </div>
      <div class="invite-box xp-invite-box">
        <strong>${t("Invitér spillere","Invite players")}</strong>
        <span>${t("Spilkode","Game code")}: <b>${esc(game.code)}</b></span>
        <div id="xp-invite-qr" class="xp-invite-qr" aria-label="${t("QR-kode til invitation","Invitation QR code")}"></div>
        <p class="hint">${t("Scan QR-koden for at åbne spillet. Spilkoden udfyldes automatisk.","Scan the QR code to open the game. The game code will be filled in automatically.")}</p>
        <div class="xp-invite-actions">
          <button type="button" data-xp="copy-code">📋 ${t("Kopiér spilkode","Copy game code")}</button>
          <button type="button" class="secondary" data-xp="copy-link">🔗 ${t("Kopiér invitationslink","Copy invite link")}</button>
        </div>
      </div>`;
    hero.after(section);
    requestAnimationFrame(renderInviteQr);
  }

  function addPersonalTools() {
    if (!game || document.querySelector(".xp-personal-tools")) return;
    const anchor = document.querySelector(".game-actions") || document.querySelector(".experience-lobby") || [...document.querySelectorAll("#app > section")].at(-1);
    if (!anchor) return;
    const currentProfile = profile();
    const section = document.createElement("section");
    section.className = "card xp-personal-tools";
    section.innerHTML = `<h2>${t("Personligt","Personal")}</h2><div class="xp-personal-grid"><button type="button" data-xp="profile">${currentProfile.avatar} ${t("Min profil","My profile")}</button><button type="button" data-xp="history">🕘 ${t("Spilhistorik","Game history")}</button></div>`;
    anchor.after(section);
  }

  function removeHostProfileDuplicates() {
    document.querySelectorAll('.enhance-tools [data-xp="profile"], .enhance-tools [data-xp="history"]').forEach((el)=>el.remove());
  }

  function addFinish() {
    if (!game?.finished) return;
    const banner = document.querySelector(".game-finish-banner");
    if (!banner || banner.querySelector(".final-standings")) return;
    const sorted = [...game.players].sort((a,b)=>b.score-a.score);
    banner.insertAdjacentHTML("beforeend", `<div class="final-standings"><h3>${t("Slutstilling","Final standings")}</h3>${sorted.map((player,index)=>`<div><b>${index+1}. ${esc(player.name)}</b><span>${player.score} ${t("point","points")}</span></div>`).join("")}</div><button type="button" data-action="restartGame">🔄 ${t("Spil revanche","Play again")}</button>`);
  }

  function statCards(stats) {
    const accuracy = stats.rounds ? Math.round(stats.correct/stats.rounds*100) : 0;
    const winRate = stats.games ? Math.round(stats.wins/stats.games*100) : 0;
    const average = stats.games ? (stats.points/stats.games).toFixed(1) : "0.0";
    return `<div class="xp-stat-grid"><div><strong>${accuracy}%</strong><span>${t("Træfsikkerhed","Accuracy")}</span></div><div><strong>${winRate}%</strong><span>${t("Sejrsrate","Win rate")}</span></div><div><strong>${average}</strong><span>${t("Point pr. spil","Points per game")}</span></div><div><strong>${stats.bestScore||0}</strong><span>${t("Bedste score","Best score")}</span></div></div>`;
  }

  function gameSummary(savedGame,index) {
    const players=[...(savedGame.players||[])].sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
    const winners=players.filter((p)=>p.winner).map((p)=>p.name).join(" & ")||"–";
    const date=new Date(savedGame.at), roundCount=Number(savedGame.rounds)||0;
    const playerText=players.length===1?t("spiller","player"):t("spillere","players");
    const roundText=roundCount===1?t("runde","round"):t("runder","rounds");
    return `<button class="history-game history-game-button" data-xp="history-detail" data-index="${index}"><span><strong>${date.toLocaleDateString(locale())}</strong><small>${date.toLocaleTimeString(locale(),{hour:"2-digit",minute:"2-digit"})}</small></span><span>🏆 ${esc(winners)}<br><small>${players.length} ${playerText} · ${roundCount} ${roundText}</small></span></button>`;
  }

  function historyPanel() {
    const data=history();
    if(historyDetail!==null){
      const savedGame=data.games[historyDetail]; if(!savedGame){historyDetail=null;return historyPanel();}
      const players=[...(savedGame.players||[])].sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
      const related=data.rounds.filter((r)=>String(r.key||"").startsWith(String(savedGame.key||"").split(":finished")[0])).sort((a,b)=>(a.round||0)-(b.round||0));
      const roundCount=Number(savedGame.rounds)||0;
      return `<section class="card xp-panel"><h2>🎮 ${t("Spildetaljer","Game details")}</h2><p><strong>${new Date(savedGame.at).toLocaleString(locale())}</strong><br>${roundCount} ${roundCount===1?t("runde","round"):t("runder","rounds")}</p><div class="history-standing">${players.map((p,i)=>`<div><b>${i+1}. ${esc(p.name)}${p.winner?" 🏆":""}</b><span>${Number(p.score)||0} ${t("point","points")}</span></div>`).join("")}</div>${related.length?`<h3>${t("Runder","Rounds")}</h3><div class="round-history">${related.map((r)=>`<div><b>${t("Runde","Round")} ${r.round}</b><span>${r.year||"?"}</span><small>${(r.players||[]).filter((p)=>p.correct).map((p)=>esc(p.name)).join(", ")||t("Ingen korrekte","No correct answers")}</small></div>`).join("")}</div>`:""}<button data-xp="history-back">← ${t("Tilbage","Back")}</button><button data-xp="close">${t("Luk","Close")}</button></section>`;
    }
    return `<section class="card xp-panel"><h2>🕘 ${t("Spilhistorik","Game history")}</h2><p>${data.games.length} ${t("afsluttede spil gemt på denne enhed.","completed games saved on this device.")}</p>${data.games.length?data.games.slice(0,30).map((g,i)=>gameSummary(g,i)).join(""):`<p>${t("Ingen tidligere spil endnu.","No previous games yet.")}</p>`}<button data-xp="close">${t("Luk","Close")}</button></section>`;
  }

  function profilePanel() {
    const currentProfile=profile(), name=localStorage.getItem("timeline-party-name")||t("Spiller","Player"), stats=myStats(), recent=(stats.recent||[]).slice(0,5);
    const gameWord=stats.games===1?t("spil","game"):t("spil","games");
    const winWord=stats.wins===1?t("sejr","win"):t("sejre","wins");
    return `<section class="card xp-panel"><h2>${esc(currentProfile.avatar)} ${t("Min profil","My profile")}</h2><div class="profile-hero"><span class="profile-avatar">${esc(currentProfile.avatar)}</span><div><strong>${esc(name)}</strong><small>${stats.games} ${gameWord} · ${stats.wins} ${winWord}</small></div></div><label>${t("Vælg avatar","Choose avatar")}<select id="xp-avatar"><option>🎵</option><option>🎧</option><option>🎸</option><option>🪩</option><option>🐰</option><option>⭐</option><option>🔥</option><option>🏆</option></select></label>${statCards(stats)}<div class="xp-stats-detail"><p><b>${stats.correct}/${stats.rounds}</b> ${t("korrekte svar","correct answers")}</p><p><b>${stats.points}</b> ${t("point i alt","total points")}</p></div>${recent.length?`<h3>${t("Seneste spil","Recent games")}</h3><div class="recent-form">${recent.map((item)=>`<span title="${new Date(item.at).toLocaleDateString(locale())}">${item.winner?"🏆":"•"} ${item.score}p</span>`).join("")}</div>`:""}<button data-xp="save-profile">${t("Gem profil","Save profile")}</button><button data-xp="close">${t("Luk","Close")}</button></section>`;
  }

  function closeXpPanels(){historyOpen=false;profileOpen=false;historyDetail=null;document.querySelectorAll(".xp-panel").forEach((node)=>node.remove());}
  function panels(){document.querySelectorAll(".xp-panel").forEach((node)=>node.remove());const root=document.querySelector("#app");if(!root)return;if(historyOpen)root.insertAdjacentHTML("beforeend",historyPanel());if(profileOpen){root.insertAdjacentHTML("beforeend",profilePanel());const select=document.querySelector("#xp-avatar");if(select)select.value=profile().avatar;}}

  function decorate(){ addLobby(); addPersonalTools(); removeHostProfileDuplicates(); addFinish(); renderInviteQr(); if((historyOpen||profileOpen)&&!document.querySelector(".xp-panel"))panels(); }

  document.addEventListener("click", async (event)=>{
    const button=event.target.closest("[data-xp]"); if(!button)return;
    event.preventDefault(); const action=button.dataset.xp;
    if(action==="copy-code"&&game?.code){try{await navigator.clipboard?.writeText(game.code);button.textContent=`✅ ${t("Kopieret","Copied")}`;}catch{}}
    if(action==="copy-link"){try{await navigator.clipboard?.writeText(inviteUrl());button.textContent=`✅ ${t("Link kopieret","Link copied")}`;}catch{}}
    if(action==="history"){document.dispatchEvent(new CustomEvent("timeline-party-xp-panel-open"));historyOpen=true;profileOpen=false;historyDetail=null;panels();}
    if(action==="history-detail"){historyDetail=Number(button.dataset.index);panels();}
    if(action==="history-back"){historyDetail=null;panels();}
    if(action==="profile"){document.dispatchEvent(new CustomEvent("timeline-party-xp-panel-open"));profileOpen=true;historyOpen=false;historyDetail=null;panels();}
    if(action==="close")closeXpPanels();
    if(action==="save-profile"){localStorage.setItem(PROFILE_KEY,JSON.stringify({avatar:document.querySelector("#xp-avatar")?.value||"🎵"}));closeXpPanels();document.querySelectorAll(".experience-lobby,.xp-personal-tools").forEach((n)=>n.remove());decorate();}
  },true);

  document.addEventListener("timeline-party-enhance-panel-open", closeXpPanels);
  document.addEventListener("timeline-party-language-change",()=>{document.querySelectorAll(".experience-lobby,.xp-personal-tools").forEach((node)=>node.remove());decorate();if(historyOpen||profileOpen)panels();});
  new MutationObserver(()=>requestAnimationFrame(decorate)).observe(document.querySelector("#app")||document.documentElement,{childList:true,subtree:true});
})();