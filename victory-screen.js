(() => {
  "use strict";
  let game = null, shownKey = "";
  const esc = v => String(v ?? "").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const en = () => localStorage.getItem("timeline-party-language") === "en-US";
  const t = (da,us) => en() ? us : da;
  const originalIo = globalThis.io;
  if (typeof originalIo === "function") {
    globalThis.io = function(...args) {
      const socket = originalIo(...args);
      socket.on("game:update", next => { game = next; if (next?.finished) setTimeout(renderVictory,0); else removeVictory(); });
      return socket;
    };
    Object.assign(globalThis.io, originalIo);
  }
  function removeVictory(){ document.querySelector(".victory-screen")?.remove(); document.querySelector(".victory-confetti")?.remove(); }
  function confetti(){
    document.querySelector(".victory-confetti")?.remove();
    const layer=document.createElement("div"); layer.className="victory-confetti"; layer.setAttribute("aria-hidden","true");
    const pieces=["■","●","◆","▲"];
    for(let i=0;i<70;i++){
      const s=document.createElement("i"); s.textContent=pieces[i%pieces.length];
      s.style.setProperty("--x",`${Math.random()*100}vw`); s.style.setProperty("--delay",`${Math.random()*1.6}s`); s.style.setProperty("--dur",`${2.7+Math.random()*2.5}s`); s.style.setProperty("--spin",`${360+Math.random()*1080}deg`); s.style.setProperty("--h",`${Math.floor(Math.random()*360)}deg`); layer.appendChild(s);
    }
    document.body.appendChild(layer); setTimeout(()=>layer.remove(),6500);
  }
  function renderVictory(){
    if(!game?.finished) return;
    const key=`${game.code}:${game.roundNumber}:${(game.winnerIds||[]).join(",")}`;
    const root=document.querySelector("#app"); if(!root)return;
    document.querySelector(".victory-screen")?.remove();
    const winners=new Set(game.winnerIds||[]), sorted=[...game.players].sort((a,b)=>(Number(b.score)||0)-(Number(a.score)||0));
    const winnerNames=sorted.filter(p=>winners.has(p.id)).map(p=>p.name);
    const winnerLabel=winnerNames.join(" & ") || sorted[0]?.name || t("Vinderen","Winner");
    const rounds=Number(game.roundNumber)||0, players=game.players.length;
    const section=document.createElement("section"); section.className="card victory-screen";
    section.innerHTML=`
      <div class="victory-hero"><div class="victory-trophy">🏆</div><p class="eyebrow">${t("SPILLET ER SLUT","GAME OVER")}</p><h1>🎉 ${t("Tillykke!","Congratulations!")}</h1><h2>${esc(winnerLabel)} ${t("vandt spillet!","won the game!")}</h2><p>${t("Godt spil – tak fordi I spillede!","Great game — thanks for playing!")}</p></div>
      <div class="victory-box"><h2>📊 ${t("Slutstilling","Final standings")}</h2><div class="victory-standing">${sorted.map((p,i)=>`<div class="victory-player ${winners.has(p.id)?"winner":""}"><span class="victory-rank">${i===0?"🥇":i===1?"🥈":i===2?"🥉":`${i+1}.`}</span><b>${esc(p.name)}${winners.has(p.id)?" 👑":""}</b><strong>${Number(p.score)||0} ${t("point","points")}</strong></div>`).join("")}</div></div>
      <div class="victory-box"><h2>⭐ ${t("Spiloversigt","Game summary")}</h2><div class="victory-summary"><div><b>🎵 ${rounds}</b><span>${rounds===1?t("runde","round"):t("runder","rounds")}</span></div><div><b>👥 ${players}</b><span>${players===1?t("spiller","player"):t("spillere","players")}</span></div><div><b>🏆 ${Math.max(0,...sorted.map(p=>Number(p.score)||0))}</b><span>${t("vinderpoint","winning score")}</span></div></div></div>
      <button type="button" class="victory-primary" data-action="restartGame">🔄 ${t("Spil revanche","Play again")}</button>
      <button type="button" class="secondary" data-victory="stats">📊 ${t("Se detaljeret statistik","View detailed statistics")}</button>
      <button type="button" class="secondary" data-victory="menu">🏠 ${t("Tilbage til menu","Back to menu")}</button>`;
    root.prepend(section);
    document.querySelectorAll(".game-finish-banner").forEach(n=>n.style.display="none");
    if(shownKey!==key){shownKey=key;confetti(); window.scrollTo({top:0,behavior:"smooth"});}
  }
  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-victory]"); if(!b)return;
    if(b.dataset.victory==="stats"){
      const stats=[...document.querySelectorAll("[data-enhance='stats'],[data-xp='history']")][0];
      if(stats){stats.click(); setTimeout(()=>document.querySelector(".enhance-panel,.xp-panel")?.scrollIntoView({behavior:"smooth",block:"start"}),50);}
    }
    if(b.dataset.victory==="menu"){
      e.preventDefault(); e.stopImmediatePropagation();
      // The match is already finished. Returning to the menu is a local navigation
      // action and must not call leaveGame(), which asks for confirmation and can
      // wait for a server acknowledgement that is no longer useful here.
      localStorage.removeItem("timeline-party-game-code");
      removeVictory();
      location.href = `${location.origin}${location.pathname}`;
    }
  },true);
  new MutationObserver(()=>{if(game?.finished&&!document.querySelector(".victory-screen"))requestAnimationFrame(renderVictory)}).observe(document.querySelector("#app")||document.documentElement,{childList:true,subtree:true});
})();