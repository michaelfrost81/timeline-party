(() => {
  "use strict";
  const KEY="timeline-party-language";
  let lang=localStorage.getItem(KEY)==="en-US"?"en-US":"da-DK";
  const originals=new WeakMap();
  const exact={
    "Spilkode":"Game code","Del koden med de andre spillere.":"Share the code with the other players.","Forbinder igen":"Reconnecting","Genoptager spil…":"Resuming game…","Vi finder din spiller og din tidslinje.":"We are finding your player and timeline.",
    "Spilindstillinger":"Game settings","Kortrettelser":"Card corrections","Statistik":"Statistics","Afslut spil og vis vinder":"End game and show winner","Spillet er slut":"Game over","Slutstilling":"Final standings","Spil revanche":"Play again",
    "Min profil":"My profile","Spilhistorik":"Game history","Tidligere spil":"Previous games","Vælg avatar":"Choose avatar","Gem profil":"Save profile","Luk":"Close","Ingen tidligere spil endnu.":"No previous games yet.",
    "Spillere i lobbyen":"Players in the lobby","Invitér spillere":"Invite players","Kopiér spilkode":"Copy game code","Kopieret":"Copied","Klar":"Ready","Offline":"Offline",
    "Først til point":"First to points","Fast antal runder":"Fixed number of rounds","Værten afslutter":"Host ends game","Point for sejr":"Points to win","Antal runder":"Number of rounds","Challenges pr. spiller":"Challenges per player","Challenges slået til":"Challenges enabled","Svar-timer i sekunder (0 = fra)":"Answer timer in seconds (0 = off)","Gem indstillinger":"Save settings",
    "Rettede Hitster-kort":"Corrected Hitster cards","Ingen lokale rettelser endnu.":"No local corrections yet.","Slet":"Delete","Nulstil statistik":"Reset statistics",
    "Start sang":"Start song","Næste sang":"Next song","Afslør svar":"Reveal answer","Lås svar":"Lock answer","Challenge":"Challenge","Pas":"Pass","Forlad spillet":"Leave game","Afslut spillet":"End game","Start forfra":"Restart game",
    "Scan Hitster-kort":"Scan Hitster card","Luk scanner":"Close scanner","Brug denne sang":"Use this song","Kopiér QR-data":"Copy QR data","Titel":"Title","Kunstner":"Artist","År":"Year","Link":"Link",
    "Vært":"Host","Din tur":"Your turn","Point":"Points","Tidslinje":"Timeline","Se tidslinje":"View timeline","Luk tidslinje":"Close timeline","Ikke mulig":"Unavailable"
  };
  const patterns=[
    [/^Runde (\d+)$/,"Round $1"],[/^Runde (\d+) · (.+)s tur$/,"Round $1 · $2's turn"],[/^Spilkode: (.+)$/,"Game code: $1"],[/^Vinder: (.+)$/,"Winner: $1"],[/^(\d+) point$/,"$1 points"],[/^(\d+) runder$/,"$1 rounds"],[/^(\d+) spil$/,"$1 games"],[/^(\d+) sejre$/,"$1 wins"],[/^(\d+) sek\. tilbage$/,"$1 sec. left"],[/^(.+) fører med (\d+) point$/,"$1 leads with $2 points"],[/^Korrekt svar!$/,"Correct answer!"],[/^Ingen ramte denne gang\.$/,"No one got it right this time."],[/^Svaret er afsløret$/,"The answer is revealed"],[/^Spillet er afsluttet$/,"The game is over"]
  ];
  function tr(text){if(lang!=="en-US")return text;const lead=text.match(/^\s*/)?.[0]||"",tail=text.match(/\s*$/)?.[0]||"",core=text.trim();if(!core)return text;let out=exact[core];if(!out){for(const [re,rep] of patterns){if(re.test(core)){out=core.replace(re,rep);break}}}return lead+(out||core)+tail}
  function translateNode(node){if(node.nodeType===Node.TEXT_NODE){if(!originals.has(node))originals.set(node,node.nodeValue);node.nodeValue=lang==="da-DK"?originals.get(node):tr(originals.get(node));return}if(node.nodeType!==Node.ELEMENT_NODE)return;if(node.matches("script,style"))return;for(const attr of ["placeholder","title","aria-label"]){if(node.hasAttribute(attr)){const k=`attr:${attr}`;let store=node.__tpOriginals||(node.__tpOriginals={});if(!(k in store))store[k]=node.getAttribute(attr);node.setAttribute(attr,lang==="da-DK"?store[k]:tr(store[k]))}}node.childNodes.forEach(translateNode)}
  function apply(){document.documentElement.lang=lang==="en-US"?"en":"da";translateNode(document.body);renderSwitcher()}
  function renderSwitcher(){let el=document.querySelector("#language-switcher");if(!el){el=document.createElement("div");el.id="language-switcher";el.innerHTML='<button type="button" data-lang="da-DK">🇩🇰 Dansk</button><button type="button" data-lang="en-US">🇺🇸 English</button>';document.body.appendChild(el)}el.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.lang===lang))}
  document.addEventListener("click",e=>{const b=e.target.closest("#language-switcher [data-lang]");if(!b)return;lang=b.dataset.lang;localStorage.setItem(KEY,lang);apply()},true);
  const nativeAlert=window.alert.bind(window),nativeConfirm=window.confirm.bind(window);window.alert=m=>nativeAlert(tr(String(m)));window.confirm=m=>nativeConfirm(tr(String(m)));
  new MutationObserver(ms=>{if(ms.some(m=>m.addedNodes.length||m.type==="characterData"))requestAnimationFrame(apply)}).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply);else apply();
})();