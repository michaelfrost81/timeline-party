(() => {
  "use strict";
  const KEY = "timeline-party-advanced-stats-v1";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { rounds: [] }; } catch { return { rounds: [] }; } };
  const save = data => localStorage.setItem(KEY, JSON.stringify(data));
  const en = () => localStorage.getItem("timeline-party-language") === "en-US";
  const t = (da,us) => en() ? us : da;
  const esc = v => String(v ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  let game = null, panelOpen = false;

  const originalIo = globalThis.io;
  if (typeof originalIo === "function") {
    globalThis.io = function(...args){
      const socket = originalIo(...args);
      socket.on("game:update", next => { game = next; capture(next); requestAnimationFrame(decorate); });
      return socket;
    };
    Object.assign(globalThis.io, originalIo);
  }

  function capture(next){
    if(!next?.showAnswer || !next.code || !next.roundNumber) return;
    const data = read();
    const key = `${next.code}:${next.roundNumber}`;
    if(data.rounds.some(r=>r.key===key)) return;
    const challengers = new Set(next.challengeQueue || []);
    data.rounds.unshift({
      key,
      at: Date.now(),
      code: next.code,
      round: next.roundNumber,
      roundPlayerId: next.roundPlayerId,
      challengers: [...challengers],
      players: (next.players||[]).map(p=>({
        id:p.id,name:p.name,correct:p.lastGuessWasCorrect===true,
        role:p.id===next.roundPlayerId?"active":challengers.has(p.id)?"challenge":"spectator"
      }))
    });
    data.rounds = data.rounds.slice(0,1000);
    save(data);
  }

  function aggregate(){
    const out = {};
    const rounds = [...(read().rounds || [])].reverse();
    for(const round of rounds){
      for(const p of round.players || []){
        const k = p.id ? `id:${p.id}` : `name:${p.name}`;
        out[k] ??= {id:p.id,name:p.name,active:0,activeCorrect:0,challenges:0,challengeCorrect:0,totalCorrect:0,totalAnswers:0,currentStreak:0,bestStreak:0};
        const s=out[k];
        if(p.role!=="active"&&p.role!=="challenge") continue;
        s.totalAnswers++;
        if(p.role==="active") s.active++;
        if(p.role==="challenge") s.challenges++;
        if(p.correct){
          s.totalCorrect++;
          if(p.role==="active") s.activeCorrect++;
          if(p.role==="challenge") s.challengeCorrect++;
          s.currentStreak++;
          s.bestStreak=Math.max(s.bestStreak,s.currentStreak);
        } else {
          s.currentStreak=0;
        }
      }
    }
    return Object.values(out);
  }

  function pct(a,b){return b?Math.round(a/b*100):0;}
  function awardCards(rows){
    if(!rows.length) return "";
    const mostCorrect=[...rows].sort((a,b)=>b.totalCorrect-a.totalCorrect||b.totalAnswers-a.totalAnswers)[0];
    const bestStreak=[...rows].sort((a,b)=>b.bestStreak-a.bestStreak||b.totalCorrect-a.totalCorrect)[0];
    const challengeKing=[...rows].filter(x=>x.challenges>0).sort((a,b)=>b.challengeCorrect-a.challengeCorrect||pct(b.challengeCorrect,b.challenges)-pct(a.challengeCorrect,a.challenges))[0];
    return `<div class="advanced-records">
      <div><span>🎯</span><b>${esc(mostCorrect.name)}</b><small>${t("Flest korrekte","Most correct")}: ${mostCorrect.totalCorrect}</small></div>
      <div><span>🔥</span><b>${esc(bestStreak.name)}</b><small>${t("Bedste stime","Best streak")}: ${bestStreak.bestStreak}</small></div>
      ${challengeKing?`<div><span>⚡</span><b>${esc(challengeKing.name)}</b><small>${t("Flest challenge-træffere","Most challenge wins")}: ${challengeKing.challengeCorrect}</small></div>`:""}
    </div>`;
  }

  function addButton(){
    if(!game) return;
    const tools=document.querySelector(".xp-personal-tools .xp-personal-grid");
    if(!tools || tools.querySelector("[data-advanced-stats]")) return;
    const b=document.createElement("button");b.type="button";b.dataset.advancedStats="open";b.textContent=`📈 ${t("Udvidet statistik","Advanced statistics")}`;tools.appendChild(b);
  }

  function renderPanel(){
    document.querySelector(".advanced-stats-panel")?.remove();
    if(!panelOpen) return;
    const root=document.querySelector("#app"); if(!root) return;
    const rows=aggregate().sort((a,b)=>b.totalCorrect-a.totalCorrect || b.challengeCorrect-a.challengeCorrect);
    const panel=document.createElement("section"); panel.className="card xp-panel advanced-stats-panel";
    panel.innerHTML=`<h2>📈 ${t("Udvidet statistik","Advanced statistics")}</h2>
      <p class="hint">${t("Statistikken registreres fra de runder, der spilles fra nu af på denne enhed.","Statistics are recorded from rounds played from now on on this device.")}</p>
      ${rows.length ? `<h3>🏅 ${t("Rekorder","Records")}</h3>${awardCards(rows)}<div class="advanced-stats-list">${rows.map(s=>`
        <div class="advanced-stat-card"><div class="advanced-stat-head"><strong>${esc(s.name)}</strong><span>${pct(s.totalCorrect,s.totalAnswers)}%</span></div>
          <div class="advanced-stat-grid">
            <div><b>${s.activeCorrect}/${s.active}</b><span>${t("egne ture","own turns")}</span></div>
            <div><b>${pct(s.activeCorrect,s.active)}%</b><span>${t("på egne ture","on own turns")}</span></div>
            <div><b>${s.challengeCorrect}/${s.challenges}</b><span>${t("challenge-træffere","challenge wins")}</span></div>
            <div><b>${pct(s.challengeCorrect,s.challenges)}%</b><span>${t("challenge-rate","challenge rate")}</span></div>
            <div><b>🔥 ${s.bestStreak}</b><span>${t("bedste stime","best streak")}</span></div>
            <div><b>${s.currentStreak}</b><span>${t("nuværende stime","current streak")}</span></div>
          </div>
        </div>`).join("")}</div>` : `<p>${t("Ingen nye runder registreret endnu.","No new rounds recorded yet.")}</p>`}
      <button type="button" data-advanced-stats="close">${t("Luk","Close")}</button>`;
    root.appendChild(panel);
    panel.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function decorate(){ addButton(); if(panelOpen&&!document.querySelector(".advanced-stats-panel"))renderPanel(); }
  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-advanced-stats]"); if(!b)return;
    e.preventDefault();
    if(b.dataset.advancedStats==="open"){panelOpen=true;renderPanel();}
    if(b.dataset.advancedStats==="close"){panelOpen=false;renderPanel();}
  },true);
  document.addEventListener("timeline-party-language-change",()=>{if(panelOpen)renderPanel();requestAnimationFrame(decorate);});
  new MutationObserver(()=>requestAnimationFrame(decorate)).observe(document.querySelector("#app")||document.documentElement,{childList:true,subtree:true});
})();