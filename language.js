(() => {
  "use strict";
  const KEY = "timeline-party-language";
  let lang = localStorage.getItem(KEY) === "en-US" ? "en-US" : "da-DK";
  const originals = new WeakMap();
  globalThis.timelinePartyLanguage = () => lang;

  const exact = new Map(Object.entries({
    "Online musikquiz":"Online music quiz","Start her":"Start here","Dit navn":"Your name","Opret nyt spil":"Create new game","eller":"or","Spilkode":"Game code","Deltag i spil":"Join game","Sådan virker MVP'en":"How the game works",
    "Forbinder igen":"Reconnecting","Genoptager spil…":"Resuming game…","Spilmenu":"Game menu","Spillere":"Players","Venter på sang":"Waiting for a song","Vælg næste sang":"Choose next song","Titel":"Title","Kunstner":"Artist","Årstal":"Year","Musiklink (valgfrit)":"Music link (optional)","Start runde":"Start round",
    "Hitster-sang":"Hitster song","DIN TUR":"YOUR TURN","DIN CHALLENGE-TUR":"YOUR CHALLENGE TURN","Rundestatus":"Round status","Challenge":"Challenge","Nej tak / Pas":"No thanks / Pass","Lås svar":"Lock answer","Svar":"Answer","Næste sang":"Next song","Går videre…":"Moving on…",
    "Spilindstillinger":"Game settings","Kortrettelser":"Card corrections","Statistik":"Statistics","Spilhistorik":"Game history","Min profil":"My profile","Slutstilling":"Final standings","Spil revanche":"Play again","Vinder":"Winner","Runder":"Rounds","Tilbage":"Back","Luk":"Close","Slet":"Delete","Gem profil":"Save profile","Gem indstillinger":"Save settings","Nulstil statistik":"Reset statistics",
    "Først til point":"First to points","Fast antal runder":"Fixed number of rounds","Værten afslutter":"Host ends game","Point for sejr":"Points to win","Antal runder":"Number of rounds","Challenges pr. spiller":"Challenges per player","Challenges slået til":"Challenges enabled","Spiltype":"Game type",
    "Træfsikkerhed":"Accuracy","Sejrsrate":"Win rate","Point pr. spil":"Points per game","Bedste score":"Best score","Spildetaljer":"Game details","Seneste spil":"Recent games","Ingen korrekte":"No correct answers","Ingen tidligere spil endnu.":"No previous games yet.","Ingen sange endnu":"No songs yet",
    "Scan Hitster-kort":"Scan Hitster card","Start forfra":"Restart game","Afslut spil":"End game","Forlad spillet":"Leave game","Kopiér QR-data":"Copy QR data","Vis rå QR-data":"Show raw QR data","QR fundet ✓":"QR code found ✓","Start runde med kortet":"Start round with this card",
    "Klar":"Ready","Offline":"Offline","Vælger…":"Choosing…","Låst":"Locked","Vælger challenge…":"Choosing challenge…","Har tur":"Current turn","vært":"host","offline":"offline","Optaget":"Taken","Valgt ✓":"Selected ✓","Placér her":"Place here","Ikke mulig":"Unavailable",
    "Afslør svar":"Reveal answer","Venter på låste svar…":"Waiting for locked answers…","Svaret er låst!":"Answer locked!","Korrekt svar!":"Correct answer!","Svaret er afsløret":"The answer is revealed","Spillet er slut":"Game over","Spillet er afsluttet":"Game over","Klar til næste runde":"Ready for the next round","Klar til at afsløre svaret":"Ready to reveal the answer","Challenge-valg":"Challenge choice","Challenge-svar":"Challenge answer",
    "Spotify er klar":"Spotify is ready","Spotify-afspilleren er offline":"The Spotify player is offline","Spotify Premium er påkrævet":"Spotify Premium is required","Forbind Spotify igen":"Reconnect Spotify","Afspil sang":"Play song","Fortsæt":"Resume","Pause":"Pause","Spotify tilsluttet":"Spotify connected","Forbind Spotify":"Connect Spotify","Musikken er stoppet":"Music stopped","Musikken er sat på pause":"Music paused","Spotify er forbundet":"Spotify connected"
  }));

  const fragments = [
    ["Lyt til sangen, gæt på din tur, og brug dine challenges på de helt rigtige tidspunkter.","Listen to the song, make your guess on your turn, and use your challenges at just the right moments."],
    ["Én spiller opretter et spil og bliver vært.","One player creates a game and becomes the host."],
    ["Værten indtaster titel, kunstner, årstal og evt. et musiklink.","The host enters the title, artist, year, and optionally a music link."],
    ["Den aktive spiller vælger årti eller placerer sangen og låser sit svar.","The active player chooses a decade or places the song and locks in the answer."],
    ["Andre kan challenge, hvorefter challengers svarer én ad gangen.","Other players can challenge, after which challengers answer one at a time."],
    ["Vi finder din spiller og din tidslinje.","We are finding your player and timeline."],
    ["Del koden med de andre spillere.","Share the code with the other players."],
    ["Forbindelsen er midlertidigt afbrudt. Vi prøver automatisk igen…","The connection was temporarily lost. We are reconnecting automatically…"],
    ["Hold kortets QR-kode tydeligt foran kameraet.","Hold the card's QR code clearly in front of the camera."],
    ["Sangoplysningerne er fundet og holdes skjult for spillerne indtil afsløring.","The song information was found and will stay hidden from the players until reveal."],
    ["Værten vælger den næste sang om lidt.","The host will choose the next song shortly."],
    ["Lyt til sangen og placér den på tidslinjen.","Listen to the song and place it on the timeline."],
    ["Du har challenged. Vent på din tur i køen.","You challenged. Wait for your turn in the queue."],
    ["Alle svarmuligheder er optaget. Du registreres automatisk som Pas.","All answer options are taken. You will automatically be registered as Pass."],
    ["Du har ingen challenges tilbage. Pas registreres automatisk.","You have no challenges left. Pass will be registered automatically."],
    ["Alle svarmuligheder er optaget. Pas registreres automatisk.","All answer options are taken. Pass will be registered automatically."],
    ["Den aktive spillers tidslinje er tom. Vælg hvilket årti sangen er fra.","The active player's timeline is empty. Choose the decade the song is from."],
    ["Alle svar er låst. Værten kan afsløre sangen.","All answers are locked. The host can reveal the song."],
    ["Venter på de andre spilleres challenge-valg…","Waiting for the other players' challenge choices…"],
    ["Spilleren er offline og har op til 60 sekunder til at vende tilbage.","The player is offline and has up to 60 seconds to return."],
    ["Ingen ramte denne gang.","No one got it right this time."],
    ["Indstillinger kan ændres mellem runderne.","Settings can be changed between rounds."],
    ["Svar-timer i sekunder (0 = fra)","Answer timer in seconds (0 = off)"],
    ["Ingen afsluttede runder gemt endnu.","No completed rounds saved yet."],
    ["Ingen lokale rettelser endnu.","No local corrections yet."],
    ["Her vises de årstal, du har rettet via Spotify-funktionen “Ret årstal”. Bekræftede rettelser kan bagefter lægges ind permanent i Hitster-listen.","This shows the years you corrected using Spotify's ‘Correct year’ feature. Confirmed corrections can later be added permanently to the Hitster list."],
    ["afsluttede spil gemt på denne enhed.","completed games saved on this device."],
    ["korrekte svar","correct answers"],["point i alt","total points"],["challenges tilbage","challenges left"],
    ["Placér sangen ud fra ","Place the song based on "],["s tidslinje","'s timeline"],["Grå placeringer er optaget.","Gray positions are taken."],
    [" har låst sit svar. Vil du challenge?"," locked their answer. Do you want to challenge?"],
    ["Du har ","You have "],[" challenges tilbage."," challenges left."],
    ["Venter på ","Waiting for "],["næste spiller","next player"],["Dit svar er låst.","Your answer is locked."],
    [" har tur","'s turn"],[" er fra "," is from "],[" · Se tidslinje"," · View timeline"],
    ["Ingen sange endnu","No songs yet"],["Går videre…","Moving on…"],
    [" fører med "," leads with "],[" point"," points"],[" runder"," rounds"],[" spil"," games"],[" sejre"," wins"],[" spiller"," player"],[" spillere"," players"],
    ["Runde ","Round "],["sek. tilbage","sec. left"],["Klar til næste runde","Ready for the next round"],
    ["Spilhistorik og statistik","Game history and statistics"],["Rettede Hitster-kort","Corrected Hitster cards"],["Afslut spil og vis vinder","End game and show winner"],
    ["Spillere i lobbyen","Players in the lobby"],["Invitér spillere","Invite players"],["Kopiér spilkode","Copy game code"],["Kopieret","Copied"],
    ["Afspillet:","Played:"],["Ret årstal for kort ","Correct year for card "],["Nyt årstal for kort ","New year for card "],
    ["Spotify: finder sangen…","Spotify: finding the song…"],["Spotify: starter sangen…","Spotify: starting the song…"],["Spotify: prøver igen efter dit tryk…","Spotify: trying again after your tap…"],
    ["Spotify afspiller rundens sang","Spotify is playing the round's song"],["iPhone blokerede automatisk afspilning – tryk ▶ Afspil sang","iPhone blocked automatic playback – tap ▶ Play song"],
    ["Skriv dit navn først.","Enter your name first."],["Skriv både navn og spilkode.","Enter both your name and the game code."],["Der er ikke forbindelse til spilserveren endnu. Vent et øjeblik og prøv igen.","The game server is not connected yet. Wait a moment and try again."],
    ["Vil du starte spillet forfra? Point, tidslinjer og challenges nulstilles.","Restart the game? Scores, timelines, and challenges will be reset."],["Vil du forlade spillet?","Leave the game?"],["Vil du afslutte spillet for alle spillere?","End the game for all players?"],["Værten har afsluttet spillet.","The host ended the game."],
    ["Denne browser understøtter ikke kameraadgang.","This browser does not support camera access."],["QR-scanneren kunne ikke indlæses. Kontrollér internetforbindelsen og prøv igen.","The QR scanner could not load. Check your internet connection and try again."],["Kameraadgang blev afvist. Tillad kameraet i browserens indstillinger og prøv igen.","Camera access was denied. Allow camera access in your browser settings and try again."],["Kameraet kunne ikke startes. Kontrollér, at det ikke bruges af en anden app.","The camera could not start. Make sure another app is not using it."],
    ["QR-koden blev læst, men den ligner ikke et dansk Hitster-kort.","The QR code was read, but it does not look like a Danish Hitster card."],["QR-data kunne ikke kopieres automatisk. Markér teksten og kopiér den manuelt.","QR data could not be copied automatically. Select the text and copy it manually."],
    ["Det er ikke din tur til at vælge et svar.","It is not your turn to choose an answer."],["Vælg et gyldigt årti.","Choose a valid decade."],["Det årti er allerede optaget.","That decade is already taken."],["Vælg en gyldig plads på tidslinjen.","Choose a valid position on the timeline."],["Du kan ikke placere en sang mellem to sange med samme årstal.","You cannot place a song between two songs from the same year."],["Den placering er allerede optaget.","That position is already taken."],["Det er ikke din tur til at låse et svar.","It is not your turn to lock an answer."],["Vælg et gyldigt svar, før du låser.","Choose a valid answer before locking it."],
    ["Spillersessionen kunne ikke oprettes. Genindlæs siden.","The player session could not be created. Reload the page."],["Spillet findes ikke. Tjek koden og prøv igen.","The game could not be found. Check the code and try again."],["Den gemte spilsession findes ikke længere.","The saved game session no longer exists."],["Kun værten kan ændre spilindstillinger.","Only the host can change game settings."],["Kun værten kan starte spillet forfra.","Only the host can restart the game."],["Kun værten kan afslutte spillet.","Only the host can end the game."],["Afslør først den igangværende sang.","Reveal the current song first."],["Du er ikke med i dette spil.","You are not in this game."],["Værten skal afslutte spillet for alle.","The host must end the game for everyone."],["Kun værten kan starte en ny runde.","Only the host can start a new round."],["Udfyld titel, kunstner og årstal.","Enter title, artist, and year."],
    ["Challenges er slået fra i dette spil.","Challenges are disabled in this game."],["Der er lukket for challenges.","Challenges are closed."],["Du har allerede valgt i denne runde.","You have already made your choice this round."],["Der er ingen ledige svarmuligheder. Du er automatisk registreret som Pas.","There are no available answer options. You were automatically registered as Pass."],["Du kan ikke passe lige nu.","You cannot pass right now."],["Svaret kan ikke afsløres endnu.","The answer cannot be revealed yet."],["Kun værten kan gå videre til næste sang.","Only the host can continue to the next song."],["Spillet er afsluttet. Start et nyt spil eller start forfra.","The game is over. Start a new game or restart."],["Næste runde kan først startes, når svaret er afsløret.","The next round can only start after the answer is revealed."],
    ["Afslut spillet og vis vinderen?","End the game and show the winner?"],["Spillet kunne ikke afsluttes.","The game could not be ended."],["Indstillingerne kunne ikke gemmes.","The settings could not be saved."],["Nulstil gemt statistik på denne enhed?","Reset saved statistics on this device?"],
    ["Spotify-login er udløbet. Forbind Spotify igen.","Your Spotify login expired. Reconnect Spotify."],["Forbind Spotify i spilmenuen først.","Connect Spotify in the game menu first."],["Spotify-afspilleren kunne ikke indlæses.","The Spotify player could not load."],["Spotify-afspilleren kunne ikke forbindes.","The Spotify player could not connect."],["Spotify-afspilleren blev ikke klar i tide.","The Spotify player did not become ready in time."],["Sangsøgning fejlede: sangen blev ikke fundet på Spotify.","Song search failed: the song was not found on Spotify."],["Der er ingen sang klar til afspilning.","There is no song ready to play."],["Spotify-login blev annulleret.","Spotify login was canceled."],["Spotify-login kunne ikke valideres.","Spotify login could not be validated."],["Spotify afviste login.","Spotify rejected the login."],["Skriv et gyldigt årstal mellem 1800 og 2100.","Enter a valid year between 1800 and 2100."],
    [" er rettet til "," was corrected to "],[" på denne enhed. Rettelsen bruges næste gang kortet scannes."," on this device. The correction will be used the next time the card is scanned."],
    ["Kameravisning til QR-scanning","Camera view for QR scanning"],["Kort ","Card "],[" fundet."," found."],["Hitster-kort ","Hitster card "],[" er ikke i vores verificerede sangliste endnu."," is not in our verified song list yet."],
    ["'erne","s"],[" · Optaget"," · Taken"]
  ].sort((a,b)=>b[0].length-a[0].length);

  function translateString(value) {
    if (lang !== "en-US" || value == null) return String(value ?? "");
    const raw = String(value);
    const leading = raw.match(/^\s*/)?.[0] || "";
    const trailing = raw.match(/\s*$/)?.[0] || "";
    const core = raw.trim();
    if (!core) return raw;
    if (exact.has(core)) return leading + exact.get(core) + trailing;
    let out = core;
    for (const [da,en] of fragments) out = out.split(da).join(en);
    out = out.replace(/(\d+)\s+point\b/g,"$1 points")
      .replace(/(\d+)\s+runder\b/g,"$1 rounds")
      .replace(/(\d+)\s+spil\b/g,"$1 games")
      .replace(/(\d+)\s+sejre\b/g,"$1 wins")
      .replace(/(\d+)\s+sek\. tilbage\b/g,"$1 sec. left")
      .replace(/^(\d{4})'erne$/,"$1s");
    return leading + out + trailing;
  }

  function shouldSkip(node) {
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return Boolean(el?.closest("script,style,#language-switcher"));
  }
  function translateNode(node) {
    if (shouldSkip(node)) return;
    if (node.nodeType === Node.TEXT_NODE) {
      if (!originals.has(node)) originals.set(node,node.nodeValue);
      const original = originals.get(node);
      node.nodeValue = lang === "da-DK" ? original : translateString(original);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    for (const attr of ["placeholder","title","aria-label"]) {
      if (!node.hasAttribute(attr)) continue;
      const store = node.__tpOriginals || (node.__tpOriginals = {});
      if (!(attr in store)) store[attr] = node.getAttribute(attr);
      node.setAttribute(attr, lang === "da-DK" ? store[attr] : translateString(store[attr]));
    }
    node.childNodes.forEach(translateNode);
  }
  function renderSwitcher() {
    let el = document.querySelector("#language-switcher");
    if (!el) {
      el = document.createElement("div"); el.id = "language-switcher";
      el.innerHTML = '<button type="button" data-lang="da-DK">🇩🇰 Dansk</button><button type="button" data-lang="en-US">🇺🇸 English</button>';
      document.body.appendChild(el);
    }
    el.querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.lang===lang));
  }
  function apply() {
    document.documentElement.lang = lang === "en-US" ? "en-US" : "da";
    translateNode(document.body);
    renderSwitcher();
  }
  document.addEventListener("click",e=>{
    const b=e.target.closest("#language-switcher [data-lang]"); if(!b)return;
    lang=b.dataset.lang; localStorage.setItem(KEY,lang); apply();
  },true);

  const nativeAlert=window.alert.bind(window), nativeConfirm=window.confirm.bind(window), nativePrompt=window.prompt.bind(window);
  window.alert=m=>nativeAlert(translateString(m));
  window.confirm=m=>nativeConfirm(translateString(m));
  window.prompt=(m,d)=>nativePrompt(translateString(m),d);

  let queued=false;
  new MutationObserver(ms=>{
    if (!ms.some(m=>m.addedNodes.length || m.type==="characterData" || m.type==="attributes")) return;
    if (queued) return; queued=true;
    requestAnimationFrame(()=>{queued=false;apply()});
  }).observe(document.documentElement,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:["placeholder","title","aria-label"]});
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",apply); else apply();
})();