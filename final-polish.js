(() => {
  "use strict";
  const HISTORY_KEY="timeline-party-history-v2", ADV_KEY="timeline-party-advanced-stats-v1";
  const read=(k,f)=>{try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}};
  const en=()=>localStorage.getItem("timeline-party-language")==="en-US";
  const t=(da,us)=>en()?us:da;
  const myId=()=>localStorage.getItem("timeline-party-player-id")||"";
  const myName=()=>localStorage.getItem("timeline-party-name")||t("Spiller","Player");
  let historyFilter="all";

  function mine(){
    const h=read(HISTORY_KEY,{rounds:[],games:[]}),a=read(ADV_KEY,{rounds:[]}),id=myId(),name=myName();
    const match=p=>p&&((id&&p.id===id)||p.name===name);
    const games=(h.games||[]).map(g=>{const p=(g.players||[]).find(match);return p?{...g,me:p}:null}).filter(Boolean);
    const rounds=(h.rounds||[]).map(r=>{const p=(r.players||[]).find(match);return p?{...r,me:p}:null}).filter(Boolean);
    const adv=(a.rounds||[]).map(r=>{const p=(r.players||[]).find(match);return p?{...r,me:p}:null}).filter(Boolean);
    return {games,rounds,adv};
  }
  function summary(){
    const {games,rounds,adv}=mine();
    const wins=games.filter(g=>g.me.winner).length,correct=rounds.filter(r=>r.me.correct).length;
    const challenges=adv.filter(r=>r.me.role==="challenge"),challengeCorrect=challenges.filter(r=>r.me.correct).length;
    const accuracy=rounds.length?Math.round(correct/rounds.length*100):0;
    const challengeRate=challenges.length?Math.round(challengeCorrect/challenges.length*100):0;
    return {games,rounds,wins,correct,accuracy,challenges:challenges.length,challengeCorrect,challengeRate};
  }
  function addProfileCareer(panel){
    if(panel.querySelector(".final-career"))return;
    const s=summary();
    const block=document.createElement("div");block.className="final-career";
    block.innerHTML=`<h3>📌 ${t("Karriereoversigt","Career overview")}</h3><div class="final-career-grid"><div><b>${s.accuracy}%</b><span>${t("samlet træfsikkerhed","overall accuracy")}</span></div><div><b>${s.challengeRate}%</b><span>${t("challenge-rate","challenge rate")}</span></div><div><b>${s.correct}</b><span>${t("korrekte svar","correct answers")}</span></div><div><b>${s.challengeCorrect}</b><span>${t("korrekte challenges","correct challenges")}</span></div></div>`;
    const achievements=panel.querySelector(".ph-plus-profile");
    (achievements||panel.querySelector(".xp-stats-detail")||panel.querySelector("h2"))?.insertAdjacentElement("afterend",block);
  }
  function addHistoryFilters(panel){
    if(panel.querySelector(".final-history-filters")||panel.querySelector(".round-history"))return;
    const buttons=[['all',t('Alle','All')],['wins',t('Sejre','Wins')],['other',t('Øvrige','Other')]];
    const wrap=document.createElement("div");wrap.className="final-history-filters";
    wrap.innerHTML=buttons.map(([k,l])=>`<button type="button" data-history-filter="${k}" class="${historyFilter===k?'active':''}">${l}</button>`).join("");
    const firstGame=panel.querySelector(".history-game-button");
    if(firstGame)firstGame.insertAdjacentElement("beforebegin",wrap); else panel.querySelector("h2")?.insertAdjacentElement("afterend",wrap);
    applyHistoryFilter(panel);
  }
  function applyHistoryFilter(panel){
    const data=read(HISTORY_KEY,{games:[]}),id=myId(),name=myName();
    panel.querySelectorAll(".history-game-button").forEach((button,index)=>{
      const g=(data.games||[])[index],p=(g?.players||[]).find(x=>(id&&x.id===id)||x.name===name);
      const isWin=Boolean(p?.winner);
      button.hidden=historyFilter==='wins'?!isWin:historyFilter==='other'?isWin:false;
    });
    panel.querySelectorAll(".final-history-filters button").forEach(b=>b.classList.toggle("active",b.dataset.historyFilter===historyFilter));
  }
  function addStatsShortcut(panel){
    if(panel.querySelector("[data-final-open-advanced]"))return;
    const btn=document.createElement("button");btn.type="button";btn.className="secondary final-advanced-shortcut";btn.dataset.finalOpenAdvanced="1";btn.textContent=`📈 ${t("Åbn udvidet statistik","Open advanced statistics")}`;
    panel.appendChild(btn);
  }
  function decorate(){
    document.querySelectorAll(".xp-panel").forEach(panel=>{
      const title=(panel.querySelector("h2")?.textContent||"").toLowerCase();
      if(title.includes("profil")||title.includes("profile"))addProfileCareer(panel);
      if(title.includes("spilhistorik")||title.includes("game history"))addHistoryFilters(panel);
    });
    document.querySelectorAll('.enhance-panel[data-panel="stats"]').forEach(addStatsShortcut);
  }
  document.addEventListener("click",e=>{
    const f=e.target.closest("[data-history-filter]");
    if(f){historyFilter=f.dataset.historyFilter;const panel=f.closest(".xp-panel");if(panel)applyHistoryFilter(panel);return;}
    const a=e.target.closest("[data-final-open-advanced]");
    if(a){document.querySelector("[data-advanced-stats='open']")?.click();}
  },true);
  document.addEventListener("timeline-party-language-change",()=>setTimeout(decorate,0));
  new MutationObserver(()=>requestAnimationFrame(decorate)).observe(document.querySelector("#app")||document.documentElement,{childList:true,subtree:true});
  decorate();
})();