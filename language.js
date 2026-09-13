(() => {
  "use strict";
  const KEY="timeline-party-language";
  let lang=localStorage.getItem(KEY)==="en-US"?"en-US":"da-DK";
  globalThis.timelinePartyLanguage=()=>lang;

  const exact=new Map(Object.entries({
    "Online musikquiz":"Online music quiz","Start her":"Start here","Dit navn":"Your name","Opret nyt spil":"Create new game","eller":"or","Spilkode":"Game code","Deltag i spil":"Join game","Sådan virker MVP'en":"How the game works",
    "Forbinder igen":"Reconnecting","Genoptager spil…":"Resuming game…","Spilmenu":"Game menu","Spillere":"Players","Venter på sang":"Waiting for a song","Vælg næste sang":"Choose next song","Titel":"Title","Kunstner":"Artist","Årstal":"Year","Musiklink (valgfrit)":"Music link (optional)","Start runde":"Start round",
    "Hitster-sang":"Hitster song","DIN TUR":"YOUR TURN","DIN CHALLENGE-TUR":"YOUR CHALLENGE TURN","Rundestatus":"Round status","Challenge":"Challenge","Nej tak / Pas":"No thanks / Pass","Lås svar":"Lock answer","Svar":"Answer","Næste sang":"Next song","Går videre…":"Moving on…",
    "Spilindstillinger":"Game settings","Kortrettelser":"Card corrections","Statistik":"Statistics","Spilhistorik":"Game history","Min profil":"My profile","Personligt":"Personal","Udvidet statistik":"Advanced statistics","Slutstilling":"Final standings","Spil revanche":"Play again","Vinder":"Winner","Runder":"Rounds","Tilbage":"Back","Luk":"Close","Slet":"Delete","Gem profil":"Save profile","Gem indstillinger":"Save settings","Nulstil statistik":"Reset statistics","Spilhistorik og statistik":"Game history and statistics","Rettede Hitster-kort":"Corrected Hitster cards","Afslut spil og vis vinder":"End game and show winner",
    "Først til point":"First to points","Fast antal runder":"Fixed number of rounds","Værten afslutter":"Host ends game","Point for sejr":"Points to win","Antal runder":"Number of rounds","Challenges pr. spiller":"Challenges per player","Challenges slået til":"Challenges enabled","Spiltype":"Game type",
    "Træfsikkerhed":"Accuracy","Sejrsrate":"Win rate","Point pr. spil":"Points per game","Bedste score":"Best score","Spildetaljer":"Game details","Seneste spil":"Recent games","Ingen korrekte":"No correct answers","Ingen tidligere spil endnu.":"No previous games yet.","Ingen sange endnu":"No songs yet","korrekte":"correct",
    "Scan Hitster-kort":"Scan Hitster card","Start forfra":"Restart game","Afslut spil":"End game","Forlad spillet":"Leave game","Kopiér QR-data":"Copy QR data","Vis rå QR-data":"Show raw QR data","QR fundet ✓":"QR code found ✓","Start runde med kortet":"Start round with this card",
    "Klar":"Ready","Offline":"Offline","Vælger…":"Choosing…","Låst":"Locked","Vælger challenge…":"Choosing challenge…","Har tur":"Current turn","vært":"host","offline":"offline","Optaget":"Taken","Valgt ✓":"Selected ✓","Placér her":"Place here","Ikke mulig":"Unavailable",
    "Afslør svar":"Reveal answer","Venter på låste svar…":"Waiting for locked answers…","Svaret er låst!":"Answer locked!","Korrekt svar!":"Correct answer!","Svaret er afsløret":"The answer is revealed","Spillet er slut":"Game over","Spillet er afsluttet":"Game over","Klar til næste runde":"Ready for the next round","Klar til at afsløre svaret":"Ready to reveal the answer","Challenge-valg":"Challenge choice","Challenge-svar":"Challenge answer",
    "Spotify er klar":"Spotify is ready","Spotify-afspilleren er offline":"The Spotify player is offline","Spotify Premium er påkrævet":"Spotify Premium is required","Forbind Spotify igen":"Reconnect Spotify","Afspil sang":"Play song","Fortsæt":"Resume","Pause":"Pause","Spotify tilsluttet":"Spotify connected","Forbind Spotify":"Connect Spotify","Musikken er stoppet":"Music stopped","Musikken er sat på pause":"Music paused","Spotify er forbundet":"Spotify connected",
    "Spillere i lobbyen":"Players in the lobby","Invitér spillere":"Invite players","Kopiér spilkode":"Copy game code","Kopieret":"Copied","Ingen afsluttede runder gemt endnu.":"No completed rounds saved yet.","Ingen lokale rettelser endnu.":"No local corrections yet."
  }));

  const fragments=[
    ["Lyt til sangen, gæt på din tur, og brug dine challenges på de helt rigtige tidspunkter.","Listen to the song, make your guess on your turn, and use your challenges at just the right moments."],["Én spiller opretter et spil og bliver vært.","One player creates a game and becomes the host."],["Værten indtaster titel, kunstner, årstal og evt. et musiklink.","The host enters the title, artist, year, and optionally a music link."],["Den aktive spiller vælger årti eller placerer sangen og låser sit svar.","The active player chooses a decade or places the song and locks in the answer."],["Andre kan challenge, hvorefter challengers svarer én ad gangen.","Other players can challenge, after which challengers answer one at a time."],
    ["Vi finder din spiller og din tidslinje.","We are finding your player and timeline."],["Del koden med de andre spillere.","Share the code with the other players."],["Værten vælger den næste sang om lidt.","The host will choose the next song shortly."],["Lyt til sangen og placér den på tidslinjen.","Listen to the song and place it on the timeline."],["Den aktive spillers tidslinje er tom. Vælg hvilket årti sangen er fra.","The active player's timeline is empty. Choose the decade the song is from."],
    ["Indstillinger kan ændres mellem runderne.","Settings can be changed between rounds."],["Svar-timer i sekunder (0 = fra)","Answer timer in seconds (0 = off)"],["afsluttede spil gemt på denne enhed.","completed games saved on this device."],["korrekte svar","correct answers"],["korrekte","correct"],["point i alt","total points"],["challenges tilbage","challenges left"],
    ["Spilhistorik og statistik","Game history and statistics"],["Rettede Hitster-kort","Corrected Hitster cards"],["Afslut spil og vis vinder","End game and show winner"],["Spilindstillinger","Game settings"],["Kortrettelser","Card corrections"],["Statistik","Statistics"],
    ["Placér sangen ud fra ","Place the song based on "],["s tidslinje","'s timeline"],["Grå placeringer er optaget.","Gray positions are taken."],[" har låst sit svar. Vil du challenge?"," locked their answer. Do you want to challenge?"],["Du har ","You have "],[" challenges tilbage."," challenges left."],["Venter på ","Waiting for "],[" har tur","'s turn"],
    ["Afspillet:","Played:"],["Ret årstal for kort ","Correct year for card "],["Nyt årstal for kort ","New year for card "],["Spotify: finder sangen…","Spotify: finding the song…"],["Spotify: starter sangen…","Spotify: starting the song…"],["Spotify afspiller rundens sang","Spotify is playing the round's song"],
    ["Skriv dit navn først.","Enter your name first."],["Skriv både navn og spilkode.","Enter both your name and the game code."],["Der er ikke forbindelse til spilserveren endnu. Vent et øjeblik og prøv igen.","The game server is not connected yet. Wait a moment and try again."],["Vil du starte spillet forfra? Point, tidslinjer og challenges nulstilles.","Restart the game? Scores, timelines, and challenges will be reset."],["Vil du forlade spillet?","Leave the game?"],["Vil du afslutte spillet for alle spillere?","End the game for all players?"],
    ["Du har ingen challenges tilbage. Pas registreres automatisk.","You have no challenges left. Pass will be registered automatically."],["Alle svarmuligheder er optaget. Pas registreres automatisk.","All answer options are taken. Pass will be registered automatically."],["Alle svar er låst. Værten kan afsløre sangen.","All answers are locked. The host can reveal the song."],["Ingen ramte denne gang.","No one got it right this time."],
    ["Denne browser understøtter ikke kameraadgang.","This browser does not support camera access."],["Kameraadgang blev afvist.","Camera access was denied."],["Kun værten kan ","Only the host can "],["Spillet findes ikke.","The game could not be found."],["'erne","s"],[" · Optaget"," · Taken"]
  ].sort((a,b)=>b[0].length-a[0].length);

  function pluralizeDanishCounts(text){
    return text
      .replace(/(\d+)\s+point\b/g,(_,n)=>`${n} ${Number(n)===1?"point":"points"}`)
      .replace(/(\d+)\s+runder\b/g,(_,n)=>`${n} ${Number(n)===1?"round":"rounds"}`)
      .replace(/(\d+)\s+spil\b/g,(_,n)=>`${n} ${Number(n)===1?"game":"games"}`)
      .replace(/(\d+)\s+sejre\b/g,(_,n)=>`${n} ${Number(n)===1?"win":"wins"}`)
      .replace(/(\d+)\s+gemte runder\b/g,(_,n)=>`${n} saved ${Number(n)===1?"round":"rounds"}`)
      .replace(/(\d+)\s+afsluttede spil\b/g,(_,n)=>`${n} completed ${Number(n)===1?"game":"games"}`)
      .replace(/(\d+)\s+spillere\b/g,(_,n)=>`${n} ${Number(n)===1?"player":"players"}`)
      .replace(/(\d+)\s+spiller\b/g,(_,n)=>`${n} ${Number(n)===1?"player":"players"}`)
      .replace(/(\d+)\s+sek\. tilbage\b/g,(_,n)=>`${n} sec. left`);
  }

  function translateString(value){
    if(lang!=="en-US"||value==null)return String(value??"");
    const raw=String(value),lead=raw.match(/^\s*/)?.[0]||"",tail=raw.match(/\s*$/)?.[0]||"",core=raw.trim();
    if(!core)return raw;
    if(exact.has(core))return lead+exact.get(core)+tail;
    let out=core;
    for(const [da,en] of fragments)out=out.split(da).join(en);
    out=pluralizeDanishCounts(out)
      .replace(/^(\d{4})'erne$/,"$1s")
      .replace(/\bpoints{2,}\b/gi,"points")
      .replace(/\bgames{2,}\b/gi,"games")
      .replace(/\bwins{2,}\b/gi,"wins")
      .replace(/\brounds{2,}\b/gi,"rounds")
      .replace(/\bplayers{2,}\b/gi,"players");
    return lead+out+tail;
  }

  function shouldSkip(node){const el=node.nodeType===Node.ELEMENT_NODE?node:node.parentElement;return Boolean(el?.closest("script,style,#language-switcher,[data-hitster-card-content]"));}
  function translateNode(node){
    if(shouldSkip(node))return;
    if(node.nodeType===Node.TEXT_NODE){
      const current=node.nodeValue;
      if(lang==="en-US"){const translated=translateString(current);if(translated!==current)node.nodeValue=translated;}
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return;
    for(const attr of ["placeholder","title","aria-label"]){if(node.hasAttribute(attr)&&lang==="en-US"){const cur=node.getAttribute(attr),next=translateString(cur);if(next!==cur)node.setAttribute(attr,next);}}
    node.childNodes.forEach(translateNode);
  }
  function renderSwitcher(){let el=document.querySelector("#language-switcher");if(!el){el=document.createElement("div");el.id="language-switcher";el.innerHTML='<button type="button" data-lang="da-DK">🇩🇰 Dansk</button><button type="button" data-lang="en-US">🇺🇸 English</button>';document.body.appendChild(el)}el.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.lang===lang));}
  function apply(){document.documentElement.lang=lang==="en-US"?"en-US":"da";translateNode(document.body);renderSwitcher();}
  function notifyLanguageChange(){document.dispatchEvent(new CustomEvent("timeline-party-language-change",{detail:{language:lang}}));}
  document.addEventListener("click",e=>{const b=e.target.closest("#language-switcher [data-lang]");if(!b)return;lang=b.dataset.lang;localStorage.setItem(KEY,lang);if(lang==="da-DK"){notifyLanguageChange();location.reload();}else{apply();notifyLanguageChange();requestAnimationFrame(apply);}},true);
  const a=window.alert.bind(window),c=window.confirm.bind(window),p=window.prompt.bind(window);window.alert=m=>a(translateString(m));window.confirm=m=>c(translateString(m));window.prompt=(m,d)=>p(translateString(m),d);
  let queued=false;new MutationObserver(ms=>{if(lang!=="en-US"||!ms.some(m=>m.addedNodes.length||m.type==="characterData"||m.type==="attributes"))return;if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;apply()});}).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["placeholder","title","aria-label"]});
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply);else apply();
})();