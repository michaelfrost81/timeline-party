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

  globalThis.HITSTER_DK_CARDS["00278"] = {
    cardNumber: 278,
    artist: "Marguerite Viby",
    title: "Tingelingeling For Mig - (Teatertosset)",
    originalYear: 1997,
    year: 1944,
    source: "physical-card"
  };
}
