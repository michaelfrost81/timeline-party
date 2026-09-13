(() => {
  "use strict";

  const SIGNAL_URL = "https://timeline-party-video-signal.onrender.com";
  const GAME_CODE_KEY = "timeline-party-game-code";
  const PLAYER_ID_KEY = "timeline-party-player-id";
  const NAME_KEY = "timeline-party-name";
  const peers = new Map();
  const peerMeta = new Map();
  let signal = null;
  let localStream = null;
  let screenStream = null;
  let joined = false;
  let joinedRoom = "";
  let cameraEnabled = true;
  let micEnabled = true;
  let facingMode = "user";
  let focusId = null;

  const en = () => localStorage.getItem("timeline-party-language") === "en-US";
  const t = (da, us) => en() ? us : da;
  const myId = () => localStorage.getItem(PLAYER_ID_KEY) || "";
  const myName = () => localStorage.getItem(NAME_KEY) || t("Spiller", "Player");
  const gameCode = () => String(localStorage.getItem(GAME_CODE_KEY) || "").trim().toUpperCase();
  const esc = value => String(value ?? "").replace(/[&<>\"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const initials = name => String(name || "?").trim().split(/\s+/).slice(0,2).map(x => x[0]?.toUpperCase()).join("") || "?";

  function getVideoTrack() { return localStream?.getVideoTracks?.()[0] || null; }
  function getAudioTrack() { return localStream?.getAudioTracks?.()[0] || null; }

  async function ensureLocalMedia() {
    if (localStream) return localStream;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error(t("Kamera understøttes ikke i denne browser.", "Camera is not supported in this browser."));
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width:{ideal:640}, height:{ideal:360} },
        audio: { echoCancellation:true, noiseSuppression:true, autoGainControl:true }
      });
    } catch {
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio:true, video:false });
        cameraEnabled = false;
      } catch {
        throw new Error(t("Kamera/mikrofon-adgang blev afvist.", "Camera/microphone access was denied."));
      }
    }
    if (getVideoTrack()) getVideoTrack().enabled = cameraEnabled;
    if (getAudioTrack()) getAudioTrack().enabled = micEnabled;
    return localStream;
  }

  async function joinVideo() {
    const room = gameCode();
    if (!room || joined) return;
    try {
      await ensureLocalMedia();
      signal = globalThis.io(SIGNAL_URL, { transports:["websocket","polling"], timeout:12000, reconnection:true });
      bindSignal();
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(t("Videoforbindelsen svarede ikke.", "The video connection did not respond."))), 15000);
        signal.on("connect_error", err => { clearTimeout(timer); reject(err); });
        signal.on("connect", () => {
          signal.emit("video:join", { room, playerId:myId(), name:myName() }, result => {
            clearTimeout(timer);
            if (!result?.ok) return reject(new Error(t("Kunne ikke åbne videorummet.", "Could not open the video room.")));
            joined = true;
            joinedRoom = room;
            (result.peers || []).forEach(meta => {
              peerMeta.set(meta.socketId, meta);
              createPeer(meta.socketId, true);
            });
            sendPresence(); renderVideoRoom(); resolve();
          });
        });
      });
    } catch (error) {
      alert(error?.message || t("Video kunne ikke startes.", "Video could not be started."));
      leaveVideo(false);
    }
  }

  function bindSignal() {
    signal.on("video:peer-joined", meta => {
      peerMeta.set(meta.socketId, meta);
      createPeer(meta.socketId, false);
      renderVideoRoom();
    });
    signal.on("video:peer-left", ({socketId}) => removePeer(socketId));
    signal.on("video:presence", meta => {
      peerMeta.set(meta.socketId, {...(peerMeta.get(meta.socketId)||{}), ...meta});
      renderVideoRoom();
    });
    signal.on("video:signal", async ({from, playerId, name, data}) => {
      peerMeta.set(from, {...(peerMeta.get(from)||{}), socketId:from, playerId, name});
      const pc = createPeer(from, false);
      try {
        if (data.description) {
          await pc.setRemoteDescription(data.description);
          if (data.description.type === "offer") {
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            signal.emit("video:signal", { target:from, data:{description:pc.localDescription} });
          }
        } else if (data.candidate) await pc.addIceCandidate(data.candidate);
      } catch (error) { console.warn("Timeline Party video signal error", error); }
    });
  }

  function createPeer(socketId, initiator) {
    if (peers.has(socketId)) return peers.get(socketId).pc;
    const pc = new RTCPeerConnection({ iceServers:[
      {urls:"stun:stun.l.google.com:19302"},
      {urls:"stun:stun1.l.google.com:19302"}
    ]});
    const entry = {pc,stream:new MediaStream(),state:"connecting"};
    peers.set(socketId, entry);
    (localStream?.getTracks?.() || []).forEach(track => pc.addTrack(track, localStream));
    pc.onicecandidate = event => event.candidate && signal?.emit("video:signal", {target:socketId,data:{candidate:event.candidate}});
    pc.ontrack = event => {
      entry.stream = event.streams?.[0] || entry.stream;
      if (!event.streams?.[0]) entry.stream.addTrack(event.track);
      renderVideoRoom();
    };
    pc.onconnectionstatechange = () => {
      entry.state = pc.connectionState;
      if (["failed","closed"].includes(pc.connectionState)) removePeer(socketId); else renderVideoRoom();
    };
    if (initiator) setTimeout(async () => {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signal?.emit("video:signal", {target:socketId,data:{description:pc.localDescription}});
      } catch (error) { console.warn(error); }
    }, 50);
    return pc;
  }

  function removePeer(socketId) {
    const entry = peers.get(socketId);
    if (entry) entry.pc.close();
    peers.delete(socketId); peerMeta.delete(socketId);
    if (focusId === socketId) focusId = null;
    renderVideoRoom();
  }

  function sendPresence() {
    signal?.emit("video:presence", {camera:cameraEnabled,microphone:micEnabled,sharing:Boolean(screenStream)});
  }

  function toggleCamera() {
    const track = getVideoTrack(); if (!track) return;
    cameraEnabled = !cameraEnabled; track.enabled = cameraEnabled; sendPresence(); renderVideoRoom();
  }
  function toggleMic() {
    const track = getAudioTrack(); if (!track) return;
    micEnabled = !micEnabled; track.enabled = micEnabled; sendPresence(); renderVideoRoom();
  }

  async function flipCamera() {
    if (!localStream || !navigator.mediaDevices?.getUserMedia || screenStream) return;
    const oldTrack = getVideoTrack(); if (!oldTrack) return;
    const nextFacing = facingMode === "user" ? "environment" : "user";
    try {
      const replacement = await navigator.mediaDevices.getUserMedia({video:{facingMode:nextFacing},audio:false});
      const nextTrack = replacement.getVideoTracks()[0]; nextTrack.enabled = cameraEnabled;
      for (const {pc} of peers.values()) {
        const sender = pc.getSenders().find(s => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(nextTrack);
      }
      localStream.removeTrack(oldTrack); oldTrack.stop(); localStream.addTrack(nextTrack); facingMode = nextFacing; renderVideoRoom();
    } catch {}
  }

  async function toggleShare() {
    if (screenStream) return stopShare();
    if (!navigator.mediaDevices?.getDisplayMedia) return alert(t("Skærmdeling understøttes ikke på denne enhed.", "Screen sharing is not supported on this device."));
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
      const track = screenStream.getVideoTracks()[0];
      for (const {pc} of peers.values()) {
        const sender = pc.getSenders().find(s => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
      }
      track.onended = stopShare; sendPresence(); renderVideoRoom();
    } catch {}
  }
  async function stopShare() {
    if (!screenStream) return;
    screenStream.getTracks().forEach(track => track.stop()); screenStream = null;
    const track = getVideoTrack();
    for (const {pc} of peers.values()) {
      const sender = pc.getSenders().find(s => s.track?.kind === "video" || !s.track);
      if (sender && track) await sender.replaceTrack(track);
    }
    sendPresence(); renderVideoRoom();
  }

  function leaveVideo(removeUi=true) {
    try { signal?.emit("video:leave"); signal?.disconnect(); } catch {}
    signal = null; joined = false; joinedRoom = ""; focusId = null;
    peers.forEach(({pc}) => pc.close()); peers.clear(); peerMeta.clear();
    screenStream?.getTracks?.().forEach(track => track.stop()); screenStream = null;
    localStream?.getTracks?.().forEach(track => track.stop()); localStream = null;
    if (removeUi) renderVideoRoom();
  }

  function tileHtml(id,name,local,meta,entry) {
    const camera = local ? cameraEnabled : meta?.camera !== false;
    const mic = local ? micEnabled : meta?.microphone !== false;
    const sharing = local ? Boolean(screenStream) : Boolean(meta?.sharing);
    const state = local ? "connected" : (entry?.state || "connecting");
    return `<div class="video-tile ${focusId===id?"focused":""}"><div class="video-media"><video data-video-stream="${esc(id)}" autoplay playsinline ${local?"muted":""}></video><div class="video-avatar">${esc(initials(name))}</div></div><div class="video-tile-bar"><span><strong>${esc(name)}</strong>${local?` <small>${t("(dig)","(you)")}</small>`:""}</span><span class="video-icons">${sharing?"🖥️":""} ${camera?"📹":"🚫"} ${mic?"🎙️":"🔇"} <i class="video-dot ${esc(state)}"></i></span></div><button class="video-focus-button" type="button" data-video-action="focus" data-id="${esc(id)}">⛶</button></div>`;
  }

  function renderVideoRoom() {
    document.querySelector(".video-room")?.remove();
    const code = gameCode();
    if (!code) return;
    if (joined && joinedRoom !== code) leaveVideo(false);
    const root = document.querySelector("#app"); if (!root) return;
    const section = document.createElement("section"); section.className = `card video-room ${joined?"active":"inactive"}`;
    if (!joined) {
      section.innerHTML = `<div class="video-room-head"><div><h2>📹 ${t("Videochat","Video chat")}</h2><p class="hint">${t("Valgfri video og lyd mellem spillerne.","Optional video and audio between players.")}</p></div></div><button type="button" data-video-action="join">📹 ${t("Start videochat","Start video chat")}</button>`;
    } else {
      const tiles = [tileHtml("local",myName(),true,{}, {state:"connected"})].concat([...peers.entries()].map(([id,entry])=>tileHtml(id,peerMeta.get(id)?.name||t("Spiller","Player"),false,peerMeta.get(id),entry))).join("");
      section.innerHTML = `<div class="video-room-head"><div><h2>📹 ${t("Videochat","Video chat")}</h2><p class="hint">${1+peers.size} ${1+peers.size===1?t("deltager","participant"):t("deltagere","participants")}</p></div><button type="button" class="secondary video-leave" data-video-action="leave">${t("Forlad video","Leave video")}</button></div><div class="video-grid">${tiles}</div><div class="video-controls"><button type="button" data-video-action="mic">${micEnabled?"🎙️":"🔇"} ${micEnabled?t("Mikrofon","Microphone"):t("Mikrofon fra","Microphone off")}</button><button type="button" data-video-action="camera">${cameraEnabled?"📹":"🚫"} ${cameraEnabled?t("Kamera","Camera"):t("Kamera fra","Camera off")}</button><button type="button" data-video-action="flip">🔄 ${t("Vend kamera","Flip camera")}</button><button type="button" data-video-action="share" ${navigator.mediaDevices?.getDisplayMedia?"":"disabled"}>🖥️ ${screenStream?t("Stop deling","Stop sharing"):t("Del skærm","Share screen")}</button></div>`;
    }
    const anchor = document.querySelector(".experience-lobby") || document.querySelector(".hero-card") || root.firstElementChild;
    if (anchor) anchor.after(section); else root.prepend(section);
    if (joined) attachStreams();
  }

  function attachStreams() {
    const localVideo = document.querySelector('video[data-video-stream="local"]');
    if (localVideo) localVideo.srcObject = screenStream || localStream;
    for (const [id,entry] of peers) {
      const video = [...document.querySelectorAll("video[data-video-stream]")].find(node => node.dataset.videoStream === id);
      if (video && video.srcObject !== entry.stream) video.srcObject = entry.stream;
    }
  }

  function decorate() {
    const code = gameCode();
    if (!code) { if (joined) leaveVideo(false); document.querySelector(".video-room")?.remove(); return; }
    if (!document.querySelector(".video-room")) renderVideoRoom();
  }

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-video-action]"); if (!button) return;
    event.preventDefault();
    const action = button.dataset.videoAction;
    if (action === "join") joinVideo();
    if (action === "leave") leaveVideo();
    if (action === "mic") toggleMic();
    if (action === "camera") toggleCamera();
    if (action === "flip") flipCamera();
    if (action === "share") toggleShare();
    if (action === "focus") { focusId = focusId === button.dataset.id ? null : button.dataset.id; renderVideoRoom(); }
  }, true);

  document.addEventListener("timeline-party-language-change", renderVideoRoom);
  window.addEventListener("beforeunload", () => leaveVideo(false));
  new MutationObserver(() => requestAnimationFrame(decorate)).observe(document.querySelector("#app") || document.documentElement,{childList:true,subtree:true});
  setInterval(decorate, 1500);
  decorate();
})();
