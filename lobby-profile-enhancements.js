(() => {
  "use strict";
  const PROFILE_KEY = "timeline-party-profile-v1";
  const lang = () => localStorage.getItem("timeline-party-language") === "en-US" ? "en-US" : "da-DK";
  const t = (da,en) => lang()==="en-US" ? en : da;
  const esc = (v) => String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const profile = () => { try { return { avatar:"🎵", ...(JSON.parse(localStorage.getItem(PROFILE_KEY)||"{}")) }; } catch { return {avatar:"🎵"}; } };
  const myId = () => localStorage.getItem("timeline-party-player-id") || "";
  let gameState = null;
  const originalIo = globalThis.io;
  if (typeof originalIo === "function") {
    globalThis.io = function(...args){
      const s = originalIo(...args);
      s.on("game:update", g => { gameState = g; requestAnimationFrame(enhance); });
      return s;
    };
    Object.assign(globalThis.io, originalIo);
  }

  function inviteUrl(){
    if (!gameState?.code) return location.origin;
    const u = new URL(location.origin);
    u.searchParams.set("join", gameState.code);
    return u.toString();
  }

  function replaceLobby(){
    if (!gameState || gameState.currentSong || gameState.finished) return;
    const old = document.querySelector(".experience-lobby");
    if (!old || old.dataset.upgraded === "1") return;
    old.dataset.upgraded = "1";
    const p = profile();
    const connected = gameState.players.filter(x=>x.connected!==false).length;
    old.innerHTML = `
      <div class="xp-lobby-head"><div><h2>👥 ${t("Spillere i lobbyen","Players in the lobby")}</h2><p class="hint">${connected}/${gameState.players.length} ${t("online","online")}</p></div></div>
      <div class="lobby-grid xp-lobby-grid">
        ${gameState.players.map(player=>{
          const mine = player.id===myId();
          const avatar = mine ? p.avatar : (String(player.name||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("")||"?");
          return `<div class="lobby-player ${mine?"is-me":""}"><span class="avatar">${esc(avatar)}</span><strong>${esc(player.name)}</strong>${player.id===gameState.hostId?`<small>⭐ ${t("Vært","Host")}</small>`:""}<small>${player.connected===false?`🔴 ${t("Offline","Offline")}`:`🟢 ${t("Online","Online")}`}</small></div>`;
        }).join("")}
      </div>
      <div class="invite-box xp-invite-box">
        <strong>${t("Invitér spillere","Invite players")}</strong>
        <span>${t("Spilkode","Game code")}: <b>${esc(gameState.code)}</b></span>
        <div id="xp-invite-qr" class="xp-invite-qr" aria-label="${t("QR-kode til invitation","Invitation QR code")}"></div>
        <p class="hint">${t("Scan QR-koden for at åbne spillet. Koden står også ovenfor.","Scan the QR code to open the game. The code is also shown above.")}</p>
        <div class="xp-invite-actions">
          <button type="button" data-xpl="copy-code">📋 ${t("Kopiér spilkode","Copy game code")}</button>
          <button type="button" class="secondary" data-xpl="copy-link">🔗 ${t("Kopiér invitationslink","Copy invite link")}</button>
        </div>
      </div>`;
    renderQr();
  }

  function renderQr(){
    const target=document.querySelector("#xp-invite-qr");
    if(!target||target.dataset.ready==="1"||typeof globalThis.QRCode!=="function")return;
    target.dataset.ready="1";
    new globalThis.QRCode(target,{text:inviteUrl(),width:156,height:156,correctLevel:globalThis.QRCode.CorrectLevel.M});
  }

  function addPersonalTools(){
    if(!gameState || document.querySelector(".xp-personal-tools")) return;
    const anchor = document.querySelector(".game-actions") || document.querySelector(".experience-lobby") || [...document.querySelectorAll("#app > section")].at(-1);
    if(!anchor) return;
    const p=profile();
    const section=document.createElement("section");
    section.className="card xp-personal-tools";
    section.innerHTML=`<h2>${t("Personligt","Personal")}</h2><div class="xp-personal-grid"><button type="button" data-xpl="open-profile">${p.avatar} ${t("Min profil","My profile")}</button><button type="button" data-xpl="open-history">🕘 ${t("Spilhistorik","Game history")}</button></div>`;
    anchor.after(section);
  }

  function hideDuplicateHostButtons(){
    document.querySelectorAll('.enhance-tools [data-xp="profile"],.enhance-tools [data-xp="history"]').forEach(el=>el.remove());
  }

  function ensureHiddenTriggers(){
    let holder=document.querySelector("#xp-hidden-triggers");
    if(holder)return;
    holder=document.createElement("div");holder.id="xp-hidden-triggers";holder.hidden=true;
    holder.innerHTML='<button data-xp="profile"></button><button data-xp="history"></button>';
    document.body.appendChild(holder);
  }

  function enhance(){ replaceLobby(); addPersonalTools(); hideDuplicateHostButtons(); ensureHiddenTriggers(); renderQr(); }

  document.addEventListener("click", async e=>{
    const b=e.target.closest("[data-xpl]"); if(!b)return;
    const a=b.dataset.xpl;
    if(a==="copy-code"&&gameState?.code){await navigator.clipboard?.writeText(gameState.code);b.textContent=`✅ ${t("Kopieret","Copied")}`;}
    if(a==="copy-link"){await navigator.clipboard?.writeText(inviteUrl());b.textContent=`✅ ${t("Link kopieret","Link copied")}`;}
    if(a==="open-profile"){document.querySelector('#xp-hidden-triggers [data-xp="profile"]')?.click();}
    if(a==="open-history"){document.querySelector('#xp-hidden-triggers [data-xp="history"]')?.click();}
  },true);

  document.addEventListener("timeline-party-language-change",()=>{document.querySelector(".xp-personal-tools")?.remove();document.querySelector(".experience-lobby")?.removeAttribute("data-upgraded");requestAnimationFrame(enhance);});
  new MutationObserver(()=>requestAnimationFrame(enhance)).observe(document.querySelector("#app")||document.documentElement,{childList:true,subtree:true});
})();