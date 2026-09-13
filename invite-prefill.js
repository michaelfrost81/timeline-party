(() => {
  "use strict";
  const params = new URLSearchParams(location.search);
  const invitedCode = String(params.get("join") || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(invitedCode)) return;

  function applyInviteCode() {
    const input = document.querySelector("#game-code");
    if (!input) return false;
    if (!input.value) input.value = invitedCode;
    return true;
  }

  if (!applyInviteCode()) {
    const observer = new MutationObserver(() => {
      if (applyInviteCode()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();