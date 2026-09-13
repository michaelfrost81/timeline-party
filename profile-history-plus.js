(() => {
  "use strict";
  const HISTORY_KEY="timeline-party-history-v2";
  const ADV_KEY="timeline-party-advanced-stats-v1";
  const en=()=>localStorage.getItem("timeline-party-language")==="en-US";
  const t=(da,us)=>en()?us:da;
  const myId=()=>localStorage.getItem("timeline-party-player-id")||"";
  const myName=()=>localStorage.getItem("timeline-party-name")||t("Spiller","Player");
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}};

  function mineFromHistory(){
    const data=read(HISTORY_KEY,{rounds:[],games:[]});
    const id=myId(),name=myName();
    const games=(data.games||[]).map(g=>{
      const p=(g.players||[]).find(x=>(id&&x.id===id)||(!id&&x.name===name)||x.name===name);
      return p?{...g,me:p}:null;
    }).filter(Boolean);
    const rounds=(data.rounds||[]).map(r=>{
      const p=(r.players||[]).find(x=>(id&&x.id===id)||(!id&&x.name===name)||x.name===name);
      return p?{...r,me:p}:null;
    }).filter(Boolean);
    return {games,rounds};
  }

  function mineAdvanced(){
    const data=read(ADV_KEY,{rounds:[]}); const id=myId(),name=myName();
    const rows=[];
    for(const r of data.rounds||[]){const p=(r.players||[]).find(x=>(id&&x.id===id)||(!id&&x.name===name)||x.name===name);if(p)rows.push({...p,at:r.at||0,round:r.round||0});}
    return rows;
  }

  function stats(){
    const {games,rounds}=mineFromHistory(); const adv=mineAdvanced();
    const wins=games.filter(g=>g.me.winner).length;
    const points=games.reduce((s,g)=>s+(Number(g.me.score)||0),0);
    const best=games.reduce((m,g)=>Math.max(m,Number(g.me.score)||0),0);
    const correct=rounds.filter(r=>r.me.correct).length;
    const challenges=adv.filter(r=>r.role==="challenge");
    const challengeCorrect=challenges.filter(r=>r.correct).length;
    let bestStreak=0,streak=0;
    [...adv].sort((a,b)=>(a.at||0)-(b.at||0)).forEach(r=>{if(r.correct){streak++;bestStreak=Math.max(bestStreak,streak)}else if(r.role==="active"||r.role==="challenge")streak=0;});
    return {games:games.length,wins,points,best,rounds:rounds.length,correct,challenges:challenges.length,challengeCorrect,bestStreak,recent:games.slice(0,5)};
  }

  function achievements(s){
    const a=[
      {ok:s.games>=1,icon:"🎮",da:"Første spil",us:"First game"},
      {ok:s.wins>=1,icon:"🏆",da:"Første sejr",us:"First win"},
      {ok:s.rounds>=10,icon:"🎵",da:"10 runder",us:"10 rounds"},
      {ok:s.correct>=10,icon:"🎯",da:"10 korrekte",us:"10 correct"},
      {ok:s.challengeCorrect>=3,icon:"⚡",da:"Challenge-ekspert",us:"Challenge expert"},
      {ok:s.bestStreak>=3,icon:"🔥",da:"3 på stribe",us:"3 in a row"},
      {ok:s.wins>=5,icon:"👑",da:"5 sejre",us:"5 wins"},
      {ok:s.games>=20,icon:"🌟",da:"20 spil",us:"20 games"}
    ];
    return a;
  }

  function profileEnhance(panel){
    if(panel.querySelector(".ph-plus-profile"))return;
    const s=stats(),ach=achievements(s),unlocked=ach.filter(x=>x.ok).length;
    const block=document.createElement("div"); block.className="ph-plus-profile";
    block.innerHTML=`<div class="ph-summary-strip"><div><b>${s.wins}</b><span>${t("sejre","wins")}</span></div><div><b>${s.best}</b><span>${t("bedste score","best score")}</span></div><div><b>${s.bestStreak}</b><span>${t("bedste stime","best streak")}</span></div></div><h3>🏅 ${t("Præstationer","Achievements")} <small>${unlocked}/${ach.length}</small></h3><div class="ph-achievements">${ach.map(x=>`<div class="ph-achievement ${x.ok?"unlocked":"locked"}"><span>${x.ok?x.icon:"🔒"}</span><small>${t(x.da,x.us)}</small></div>`).join("")}</div>`;
    const target=panel.querySelector(".xp-stats-detail")||panel.querySelector(".xp-stat-grid");
    (target||panel.querySelector("h2"))?.insertAdjacentElement("afterend",block);
  }

  function historyEnhance(panel){
    if(panel.querySelector(".ph-plus-history"))return;
    const s=stats();
    const block=document.createElement("div"); block.className="ph-plus-history";
    const rate=s.games?Math.round(s.wins/s.games*100):0,avg=s.games?(s.points/s.games).toFixed(1):"0.0";
    block.innerHTML=`<h3>👤 ${t("Min oversigt","My summary")}</h3><div class="ph-summary-strip"><div><b>${s.games}</b><span>${t("spil","games")}</span></div><div><b>${rate}%</b><span>${t("sejrsrate","win rate")}</span></div><div><b>${avg}</b><span>${t("gns. point","avg. points")}</span></div></div>${s.recent.length?`<div class="ph-recent"><strong>${t("Seneste resultater","Recent results")}</strong><div>${s.recent.map(g=>`<span title="${new Date(g.at).toLocaleDateString(en()?"en-US":"da-DK")}" class="${g.me.winner?"win":"loss"}">${g.me.winner?"🏆":"•"} ${Number(g.me.score)||0}</span>`).join("")}</div></div>`:""}`;
    const h2=panel.querySelector("h2"); h2?.insertAdjacentElement("afterend",block);
  }

  function decorate(){
    document.querySelectorAll(".xp-panel").forEach(panel=>{
      const title=(panel.querySelector("h2")?.textContent||"").toLowerCase();
      if(title.includes("profil")||title.includes("profile"))profileEnhance(panel);
      if(title.includes("spilhistorik")||title.includes("game history"))historyEnhance(panel);
    });
  }
  document.addEventListener("timeline-party-language-change",()=>setTimeout(decorate,0));
  new MutationObserver(()=>requestAnimationFrame(decorate)).observe(document.querySelector("#app")||document.documentElement,{childList:true,subtree:true});
  decorate();
})();