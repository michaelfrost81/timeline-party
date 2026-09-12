(() => {
  "use strict";
  const KEY = "timeline-party-language";
  let lang = localStorage.getItem(KEY) === "en-US" ? "en-US" : "da-DK";
  const originals = new WeakMap();
  globalThis.timelinePartyLanguage = () => lang;

  const exact = {
    "Online musikquiz":"Online music quiz",
    "Lyt til sangen, gæt på din tur, og brug dine challenges på de helt rigtige tidspunkter.":"Listen to the song, make your guess on your turn, and use your challenges at just the right moments.",
    "Start her":"Start here","Dit navn":"Your name","Fx Alma":"E.g. Alex","Opret nyt spil":"Create new game","eller":"or","Spilkode":"Game code","Fx A1B2C":"E.g. A1B2C","Deltag i spil":"Join game",
    "Sådan virker MVP'en":"How the game works","Én spiller opretter et spil og bliver vært.":"One player creates a game and becomes the host.","Værten indtaster titel, kunstner, årstal og evt. et musiklink.":"The host enters the title, artist, year, and optionally a music link.","Den aktive spiller vælger årti eller placerer sangen og låser sit svar.":"The active player chooses a decade or places the song and locks in the answer.","Andre kan challenge, hvorefter challengers svarer én ad gangen.":"Other players can challenge, after which challengers answer one at a time.",
    "Forbinder igen":"Reconnecting","Genoptager spil…":"Resuming game…","Vi finder din spiller og din tidslinje.":"We are finding your player and timeline.","Del koden med de andre spillere.":"Share the code with the other players.","Forbindelsen er midlertidigt afbrudt. Vi prøver automatisk igen…":"The connection was temporarily lost. We are reconnecting automatically…",
    "Spilmenu":"Game menu","Scan Hitster-kort":"Scan Hitster card","Start forfra":"Restart game","Afslut spil":"End game","Forlad spillet":"Leave game",
    "Kameravisning til QR-scanning":"Camera view for QR scanning","Hold kortets QR-kode tydeligt foran kameraet.":"Hold the card's QR code clearly in front of the camera.","QR fundet ✓":"QR code found ✓","Sangoplysningerne er fundet og holdes skjult for spillerne indtil afsløring.":"The song information was found and will stay hidden from the players until reveal.","Start runde med kortet":"Start round with this card","Vis rå QR-data":"Show raw QR data","Kopiér QR-data":"Copy QR data","Luk":"Close",
    "Spillere":"Players","vært":"host","Har tur":"Current turn","offline":"offline","Vælger…":"Choosing…","Låst":"Locked","Vælger challenge…":"Choosing challenge…","challenges tilbage":"challenges left",
    "Venter på sang":"Waiting for a song","Værten vælger den næste sang om lidt.":"The host will choose the next song shortly.","Vælg næste sang":"Choose next song","Titel":"Title","Kunstner":"Artist","Årstal":"Year","Musiklink (valgfrit)":"Music link (optional)","Start runde":"Start round",
    "Hitster-sang":"Hitster song","Lyt til sangen og placér den på tidslinjen.":"Listen to the song and place it on the timeline.","Åbn musik":"Open music","DIN TUR":"YOUR TURN","DIN CHALLENGE-TUR":"YOUR CHALLENGE TURN","Rundestatus":"Round status","Afslør svar":"Reveal answer","Venter på låste svar…":"Waiting for locked answers…",
    "Du har challenged. Vent på din tur i køen.":"You challenged. Wait for your turn in the queue.","Alle svarmuligheder er optaget. Du registreres automatisk som Pas.":"All answer options are taken. You will automatically be registered as Pass.","Challenge":"Challenge","Nej tak / Pas":"No thanks / Pass","Svaret er låst!":"Answer locked!","Placér sangen ud fra":"Place the song based on","Grå placeringer er optaget.":"Gray positions are taken.","Lås svar":"Lock answer","Den aktive spillers tidslinje er tom. Vælg hvilket årti sangen er fra.":"The active player's timeline is empty. Choose the decade the song is from.","Optaget":"Taken","Valgt ✓":"Selected ✓","Placér her":"Place here","Ikke mulig":"Unavailable",
    "Alle svar er låst. Værten kan afsløre sangen.":"All answers are locked. The host can reveal the song.","Venter på de andre spilleres challenge-valg…":"Waiting for the other players' challenge choices…","Dit svar er låst.":"Your answer is locked.","næste spiller":"next player","Spilleren er offline og har op til 60 sekunder til at vende tilbage.":"The player is offline and has up to 60 seconds to return.",
    "Svar":"Answer","Se tidslinje":"View timeline","Går videre…":"Moving on…","Næste sang":"Next song","Ingen sange endnu":"No songs yet",
    "Spillet er afsluttet":"Game over","Klar til næste runde":"Ready for the next round","Challenge-valg":"Challenge choice","Challenge-svar":"Challenge answer","Klar til at afsløre svaret":"Ready to reveal the answer","Svaret er afsløret":"The answer is revealed","Korrekt svar!":"Correct answer!","Ingen ramte denne gang.":"No one got it right this time.","Spillet er slut":"Game over","Vinder":"Winner",
    "Spilindstillinger":"Game settings","Kortrettelser":"Card corrections","Statistik":"Statistics","Afslut spil og vis vinder":"End game and show winner","Indstillinger kan ændres mellem runderne.":"Settings can be changed between rounds.","Spiltype":"Game type","Først til point":"First to points","Fast antal runder":"Fixed number of rounds","Værten afslutter":"Host ends game","Point for sejr":"Points to win","Antal runder":"Number of rounds","Challenges pr. spiller":"Challenges per player","Challenges slået til":"Challenges enabled","Svar-timer i sekunder (0 = fra)":"Answer timer in seconds (0 = off)","Gem indstillinger":"Save settings",
    "Spilhistorik og statistik":"Game history and statistics","Ingen afsluttede runder gemt endnu.":"No completed rounds saved yet.","Nulstil statistik":"Reset statistics","Rettede Hitster-kort":"Corrected Hitster cards","Ingen lokale rettelser endnu.":"No local corrections yet.","Slet":"Delete","Her vises de årstal, du har rettet via Spotify-funktionen “Ret årstal”. Bekræftede rettelser kan bagefter lægges ind permanent i Hitster-listen.":"This shows the years you corrected using Spotify's “Correct year” feature. Confirmed corrections can later be added permanently to the Hitster list.",
    "Spillere i lobbyen":"Players in the lobby","Klar":"Ready","Invitér spillere":"Invite players","Kopiér spilkode":"Copy game code","Kopieret":"Copied","Min profil":"My profile","Spilhistorik":"Game history","Slutstilling":"Final standings","Spil revanche":"Play again","Træfsikkerhed":"Accuracy","Sejrsrate":"Win rate","Point pr. spil":"Points per game","Bedste score":"Best score","Spildetaljer":"Game details","Runder":"Rounds","Ingen korrekte":"No correct answers","Tilbage":"Back","afsluttede spil gemt på denne enhed.":"completed games saved on this device.","Ingen tidligere spil endnu.":"No previous games yet.","Vælg avatar":"Choose avatar","korrekte svar":"correct answers","point i alt":"total points","Seneste spil":"Recent games","Gem profil":"Save profile",
    "Du har ingen challenges tilbage. Pas registreres automatisk.":"You have no challenges left. Pass will be registered automatically.","Alle svarmuligheder er optaget. Pas registreres automatisk.":"All answer options are taken. Pass will be registered automatically.",
    "Spotify er klar":"Spotify is ready","Spotify-afspilleren er offline":"The Spotify player is offline","iPhone blokerede automatisk afspilning – tryk ▶ Afspil sang":"iPhone blocked automatic playback – tap ▶ Play song","Spotify Premium er påkrævet":"Spotify Premium is required","Forbind Spotify igen":"Reconnect Spotify","Afspil sang":"Play song","Fortsæt":"Resume","Pause":"Pause","Afspillet:":"Played:","Spotify tilsluttet":"Spotify connected","Forbind Spotify":"Connect Spotify","Musikken er stoppet":"Music stopped","Spotify afspiller rundens sang":"Spotify is playing the round's song","Musikken er sat på pause":"Music paused","Spotify: finder sangen…":"Spotify: finding the song…","Spotify: starter sangen…":"Spotify: starting the song…","Spotify: prøver igen efter dit tryk…":"Spotify: trying again after your tap…","Spotify er forbundet":"Spotify connected",
    "Skriv dit navn først.":"Enter your name first.","Der er ikke forbindelse til spilserveren endnu. Vent et øjeblik og prøv igen.":"The game server is not connected yet. Wait a moment and try again.","Skriv både navn og spilkode.":"Enter both your name and the game code.","Vil du starte spillet forfra? Point, tidslinjer og challenges nulstilles.":"Restart the game? Scores, timelines, and challenges will be reset.","Vil du forlade spillet?":"Leave the game?","Vil du afslutte spillet for alle spillere?":"End the game for all players?","Værten har afsluttet spillet.":"The host ended the game.",
    "Denne browser understøtter ikke kameraadgang.":"This browser does not support camera access.","QR-scanneren kunne ikke indlæses. Kontrollér internetforbindelsen og prøv igen.":"The QR scanner could not load. Check your internet connection and try again.","Kameraadgang blev afvist. Tillad kameraet i browserens indstillinger og prøv igen.":"Camera access was denied. Allow camera access in your browser settings and try again.","Kameraet kunne ikke startes. Kontrollér, at det ikke bruges af en anden app.":"The camera could not start. Make sure another app is not using it.","QR-koden blev læst, men den ligner ikke et dansk Hitster-kort.":"The QR code was read, but it does not look like a Danish Hitster card.","QR-data kunne ikke kopieres automatisk. Markér teksten og kopiér den manuelt.":"QR data could not be copied automatically. Select the text and copy it manually.",
    "Det er ikke din tur til at vælge et svar.":"It is not your turn to choose an answer.","Vælg et gyldigt årti.":"Choose a valid decade.","Det årti er allerede optaget.":"That decade is already taken.","Vælg en gyldig plads på tidslinjen.":"Choose a valid position on the timeline.","Du kan ikke placere en sang mellem to sange med samme årstal.":"You cannot place a song between two songs from the same year.","Den placering er allerede optaget.":"That position is already taken.","Det er ikke din tur til at låse et svar.":"It is not your turn to lock an answer.","Vælg et gyldigt svar, før du låser.":"Choose a valid answer before locking it.",
    "Spillersessionen kunne ikke oprettes. Genindlæs siden.":"The player session could not be created. Reload the page.","Spillet findes ikke. Tjek koden og prøv igen.":"The game could not be found. Check the code and try again.","Den gemte spilsession findes ikke længere.":"The saved game session no longer exists.","Kun værten kan ændre spilindstillinger.":"Only the host can change game settings.","Indstillinger kan ændres mellem runderne.":"Settings can be changed between rounds.","Kun værten kan starte spillet forfra.":"Only the host can restart the game.","Kun værten kan afslutte spillet.":"Only the host can end the game.","Afslør først den igangværende sang.":"Reveal the current song first.","Du er ikke med i dette spil.":"You are not in this game.","Værten skal afslutte spillet for alle.":"The host must end the game for everyone.","Kun værten kan starte en ny runde.":"Only the host can start a new round.","Udfyld titel, kunstner og årstal.":"Enter title, artist, and year.","Challenges er slået fra i dette spil.":"Challenges are disabled in this game.","Der er lukket for challenges.":"Challenges are closed.","Du har allerede valgt i denne runde.":"You have already made your choice this round.","Der er ingen ledige svarmuligheder. Du er automatisk registreret som Pas.":"There are no available answer options. You were automatically registered as Pass.","Du kan ikke passe lige nu.":"You cannot pass right now.","Svaret kan ikke afsløres endnu.":"The answer cannot be revealed yet.","Kun værten kan gå videre til næste sang.":"Only the host can continue to the next song.","Spillet er afsluttet. Start et nyt spil eller start forfra.":"The game is over. Start a new game or restart.","Næste runde kan først startes, når svaret er afsløret.":"The next round can only start after the answer is revealed.",
    "Afslut spillet og vis vinderen?":"End the game and show the winner?","Spillet kunne ikke afsluttes.":"The game could not be ended.","Indstillingerne kunne ikke gemmes.":"The settings could not be saved.","Nulstil gemt statistik på denne enhed?":"Reset saved statistics on this device?",
    "Spotify-login er udløbet. Forbind Spotify igen.":"Your Spotify login expired. Reconnect Spotify.","Forbind Spotify i spilmenuen først.":"Connect Spotify in the game menu first.","Spotify-afspilleren kunne ikke indlæses.":"The Spotify player could not load.","Spotify-afspilleren kunne ikke forbindes.":"The Spotify player could not connect.","Spotify-afspilleren blev ikke klar i tide.":"The Spotify player did not become ready in time.","Sangsøgning":"Song search","Sangsøgning fejlede: sangen blev ikke fundet på Spotify.":"Song search failed: the song was not found on Spotify.","Overførsel til Timeline Party-afspilleren":"Transfer to the Timeline Party player","Start af sangen":"Starting the song","Der er ingen sang klar til afspilning.":"There is no song ready to play.","Spotify-login blev annulleret.":"Spotify login was canceled.","Spotify-login kunne ikke valideres.":"Spotify login could not be validated.","Spotify afviste login.":"Spotify rejected the login.","Skriv et gyldigt årstal mellem 1800 og 2100.":"Enter a valid year between 1800 and 2100."
  };

  const patterns = [
    [/^Runde (\d+)$/,"Round $1"],[/^Runde (\d+) · (.+)s tur$/,"Round $1 · $2's turn"],[/^(.+) har tur$/,"$1's turn"],[/^(.+)s tur$/,"$1's turn"],[/^(.+)s tidslinje$/,"$1's timeline"],[/^(.+) har låst sit svar\. Vil du challenge\?$/,"$1 locked their answer. Do you want to challenge?"],
    [/^Du har (\d+)\/(\d+) challenges tilbage\.$/,"You have $1/$2 challenges left."],[/^(\d+)\/(\d+) challenges tilbage$/,"$1/$2 challenges left"],[/^(\d+) point$/,"$1 points"],[/^(\d+) runder$/,"$1 rounds"],[/^(\d+) spil$/,"$1 games"],[/^(\d+) sejre$/,"$1 wins"],[/^(\d+) gemte runder$/,"$1 saved rounds"],[/^(\d+) afsluttede spil$/,"$1 completed games"],[/^(\d+) afsluttede spil · (\d+) gemte runder$/,"$1 completed games · $2 saved rounds"],[/^(\d+) sek\. tilbage$/,"$1 sec. left"],
    [/^(.+) fører med (\d+) point$/,"$1 leads with $2 points"],[/^Venter på (.+)…$/,"Waiting for $1…"],[/^Venter på (.+)$/,"Waiting for $1"],[/^Kort (\d+) fundet\.$/,"Card $1 found."],[/^Kort (\d+)$/,"Card $1"],[/^Kort (\d+) → (\d+)$/,"Card $1 → $2"],[/^Kort (\d+) er rettet til (\d+) på denne enhed\. Rettelsen bruges næste gang kortet scannes\.$/,"Card $1 was corrected to $2 on this device. The correction will be used the next time the card is scanned."],[/^Nyt årstal for kort (\d+):$/,"New year for card $1:"],[/^Ret årstal for kort (\d+)$/,"Correct year for card $1"],[/^Hitster-kort (\d+) er ikke i vores verificerede sangliste endnu\.$/,"Hitster card $1 is not in our verified song list yet."],
    [/^(.+) er fra (\d{4})$/,"$1 is from $2"],[/^(.+) · Se tidslinje$/,"$1 · View timeline"],[/^(\d+)'erne$/,"${1}s"],[/^(\d+)'erne ✓$/,"${1}s ✓"],[/^(\d+)'erne · Optaget$/,"${1}s · Taken"],[/^Placér sangen ud fra (.+)s tidslinje\. Grå placeringer er optaget\.$/,"Place the song based on $1's timeline. Gray positions are taken."],
    [/^(\d+) spiller$/,"$1 player"],[/^(\d+) spillere$/,"$1 players"],[/^(\d+) spiller · (\d+) runder$/,"$1 player · $2 rounds"],[/^(\d+) spillere · (\d+) runder$/,"$1 players · $2 rounds"],[/^(\d+) afsluttede spil gemt på denne enhed\.$/,"$1 completed games saved on this device."],[/^(\d+)\/([0-9]+) korrekte$/,"$1/$2 correct"],[/^(\d+)\/([0-9]+) korrekte svar$/,"$1/$2 correct answers"],[/^(\d+) point i alt$/,"$1 total points"],[/^(.+) (\d+)p$/,"$1 $2 pts"],
    [/^Spotify-afspilning fejlede: (.+)$/,"Spotify playback failed: $1"],[/^Spotify: (.+) fejlede \((\d+)\)(.*)$/,"Spotify: $1 failed ($2)$3"],[/^(.+) fejlede \((\d+)\)(.*)$/,"$1 failed ($2)$3"],[/^Du har brugt alle (\d+) challenges\.$/,"You have used all $1 challenges."],[/^Spotify: (.+)\. Tryk ▶ Afspil sang\.$/,"Spotify: $1. Tap ▶ Play song."],[/^(.+)\. Tryk ▶ Afspil sang\.$/,"$1. Tap ▶ Play song."]
  ];

  function coreTranslate(core) {
    if (exact[core]) return exact[core];
    for (const [re, rep] of patterns) if (re.test(core)) return core.replace(re, rep);
    const prefix = core.match(/^([^A-Za-zÆØÅæøå0-9]*)(.+)$/u);
    if (prefix && prefix[1] && prefix[2] !== core) {
      const translated = coreTranslate(prefix[2]);
      if (translated !== prefix[2]) return prefix[1] + translated;
    }
    return core;
  }

  function tr(text) {
    if (lang !== "en-US") return text;
    const lead = text.match(/^\s*/)?.[0] || "", tail = text.match(/\s*$/)?.[0] || "", core = text.trim();
    if (!core) return text;
    return lead + coreTranslate(core) + tail;
  }

  function translateNode(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!originals.has(node)) originals.set(node, node.nodeValue);
      node.nodeValue = lang === "da-DK" ? originals.get(node) : tr(originals.get(node));
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE || node.matches("script,style")) return;
    for (const attr of ["placeholder","title","aria-label"]) {
      if (!node.hasAttribute(attr)) continue;
      const key = `attr:${attr}`, store = node.__tpOriginals || (node.__tpOriginals = {});
      if (!(key in store)) store[key] = node.getAttribute(attr);
      node.setAttribute(attr, lang === "da-DK" ? store[key] : tr(store[key]));
    }
    node.childNodes.forEach(translateNode);
  }

  function apply() {
    document.documentElement.lang = lang === "en-US" ? "en-US" : "da";
    translateNode(document.body);
    renderSwitcher();
    document.dispatchEvent(new CustomEvent("timeline-party-language-change", { detail: { language: lang } }));
  }

  function renderSwitcher() {
    let el = document.querySelector("#language-switcher");
    if (!el) {
      el = document.createElement("div"); el.id = "language-switcher";
      el.innerHTML = '<button type="button" data-lang="da-DK">🇩🇰 Dansk</button><button type="button" data-lang="en-US">🇺🇸 English</button>';
      document.body.appendChild(el);
    }
    el.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.lang === lang));
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("#language-switcher [data-lang]");
    if (!b) return;
    lang = b.dataset.lang; localStorage.setItem(KEY, lang); apply();
  }, true);

  const nativeAlert = window.alert.bind(window), nativeConfirm = window.confirm.bind(window), nativePrompt = window.prompt.bind(window);
  window.alert = (m) => nativeAlert(tr(String(m)));
  window.confirm = (m) => nativeConfirm(tr(String(m)));
  window.prompt = (m, d) => nativePrompt(tr(String(m)), d);

  new MutationObserver((mutations) => {
    if (mutations.some((m) => m.addedNodes.length || m.type === "characterData")) requestAnimationFrame(apply);
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply); else apply();
})();