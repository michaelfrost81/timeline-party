# Timeline Party

Timeline Party er en meget enkel online prototype til et musik-tidslinjespil inspireret af idéen bag Hitster: lyt til en sang, gæt hvor den hører hjemme i tiden, og byg din egen tidslinje.

Appen er lavet som en neutral prototype. Brug ikke beskyttet Hitster-branding i en offentlig udgivelse, og afspil kun musik via lovlige links eller indhold, du har ret til at bruge.

## Den nemmeste måde at teste spillet

1. Installer Node.js.
2. Kør `npm install` i projektmappen.
3. Kør `npm start`.
4. Åbn `http://localhost:10000` i to browserfaner.
5. Opret et spil i den første fane.
6. Deltag med spilkoden i den anden fane.
7. Værten indtaster en sang, et årstal og eventuelt et musiklink.
8. Begge spillere placerer sangen på tidslinjen.
9. Værten afslører svaret og starter næste sang.

## Hvad kan første version?

- Oprette et online rum med spilkode.
- Lade andre spillere deltage via samme kode.
- Lade værten vælge en sang med titel, kunstner, årstal og valgfrit musiklink.
- Lade hver spiller placere sangen på sin egen tidslinje.
- Afsløre svaret og give 1 point for korrekt placering.
- Fortsætte med næste sang.

## Kommandoer

```bash
npm install
npm start
```

Serveren kører som standard på `http://localhost:10000`.

## Gode næste trin

- Tilføj en lille indbygget sangliste, så værten ikke skal skrive sange manuelt.
- Tilføj QR-kode til spilkoden.
- Tilføj en startskærm med regler.
- Tilføj bedre mobilvisning for mange årstal på tidslinjen.
- Tilføj vedvarende rum, hvis spillet skal deployes offentligt.
