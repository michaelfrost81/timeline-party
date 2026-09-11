# Spotify test flow

Timeline Party uses Spotify Authorization Code with PKCE. No client secret is stored in the browser.

Production redirect URI used by the client:

`https://timeline-party.onrender.com/callback`

Host flow:

1. Create or resume a game.
2. In Spilmenu choose **Forbind Spotify** and complete Spotify login.
3. Return to Timeline Party. The host should see **Spotify tilsluttet** / **Spotify er klar**.
4. Scan a supported Danish Hitster card.
5. Choose **Start runde med kortet**. The client searches Spotify for the card song and starts playback on the browser player while Timeline Party keeps title, artist and year hidden until reveal.

Spotify Premium is required for Web Playback and playback-control endpoints. On iOS, playback may require the user interaction used by the connect/start button.