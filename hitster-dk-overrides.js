// Physical-card corrections for Hitster Denmark / DK01.
// Loaded after hitster-dk.js so verified physical cards override community data.
if (globalThis.HITSTER_DK_CARDS) {
  globalThis.HITSTER_DK_CARDS["00113"] = {
    cardNumber: 113,
    artist: "Specktors",
    title: "Kommet For At Danse",
    year: 2017,
    source: "physical-card"
  };
}
