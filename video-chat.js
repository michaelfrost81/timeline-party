(() => {
  "use strict";

  const SIGNAL_URL = "https://timeline-party-video-signal.onrender.com";
  const GAME_CODE_KEY = "timeline-party-game-code";
  const PLAYER_ID_KEY = "timeline-party-player-id";
  const NAME_KEY = "timeline-party-name";
  const AUTO_VIDEO_KEY = "timeline-party-video-auto-start";
  const MAX_VIDEO_PARTICIPANTS = 10;
  const peers = new Map();
  const peerMeta = new Map();
  let signal=null, localStream=null, screenStream=null, joined=false, joining=false, joinedRoom="", focusId=null;
  let cameraEnabled=true, micEnabled=true, facingMode="user", minimized=false, activeSpeakerId=null, autoStartTriedCode="";
  const levels=new Map(); let audioContext=null, meterTimer=null;

  const en=()=>localStorage.getItem("timeline-party-language")==="en-US";
  const t=(da,us)=>en()?us:da;
  const myId=()=>localStorage.getItem(PLAYER_ID_KEY)||"";
  const myName=()=>localStorage.getItem(NAME_KEY)||t("Spiller","Player");
  const gameCode=()=>String(localStorage.getItem(GAME_CODE_KEY)||"").trim().toUpperCase();
  const autoStartEnabled=()=>localStorage.getItem(AUTO_VIDEO_KEY)==="1";
  const esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const initials=n=>String(n||"?").trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join("")||"?";
  const getVideoTrack=()=>localStream?.getVideoTracks?.()[0]||null;
  const getAudioTrack=()=>localStream?.getAudioTracks?.()[0]||null;

  async function ensureLocalMedia(){
    if(localStream)return localStream;
    if(!navigator.mediaDevices?.getUserMedia)throw new Error(t("Kamera understøttes ikke i denne browser.","Camera is not supported in this browser."));
    try{localStream=await navigator.mediaDevices.getUserMedia({video:{facingMode,width:{ideal:480},height:{ideal:270},frameRate:{ideal:18,max:20}},audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}})}
    catch{try{localStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});cameraEnabled=false}catch{throw new Error(t("Kamera/mikrofon-adgang blev afvist.","Camera/microphone access was denied."))}}
    if(getVideoTrack())getVideoTrack().enabled=cameraEnabled;if(getAudioTrack())getAudioTrack().enabled=micEnabled;return localStream;
  }

  async function joinVideo({quiet=false}={}){
    const room=gameCode();if(!room||joined||joining)return;
    joining=true;renderVideoRoom();
    try{await ensureLocalMedia();signal=globalThis.io(SIGNAL_URL,{transports:["websocket","polling"],timeout:20000,reconnection:true,reconnectionAttempts:8,reconnectionDelay:1000});bindSignal();
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(t("Videoforbindelsen svarede ikke.","The video connection did not respond."))),25000);
        signal.on("connect_error",err=>{if(!signal?.active){clearTimeout(timer);reject(err)}});
        signal.on("connect",()=>signal.emit("video:join",{room,playerId:myId(),name:myName()},result=>{clearTimeout(timer);if(!result?.ok){if(result?.reason==="room-full")return reject(new Error(t("Videorummet har allerede 10 deltagere.","The video room already has 10 participants.")));return reject(new Error(t("Kunne ikke åbne videorummet.","Could not open the video room.")))}joined=true;joining=false;joinedRoom=room;(result.peers||[]).forEach(meta=>{peerMeta.set(meta.socketId,meta);createPeer(meta.socketId,true)});sendPresence();startAudioMeter();adaptVideoQuality();renderVideoRoom();resolve()}));});
    }catch(error){joining=false;if(!quiet)alert(error?.message||t("Video kunne ikke startes.","Video could not be started."));leaveVideo(false);renderVideoRoom()}
  }

  function bindSignal(){
    signal.on("video:peer-joined",meta=>{peerMeta.set(meta.socketId,meta);createPeer(meta.socketId,false);adaptVideoQuality();renderVideoRoom()});
    signal.on("video:peer-left",({socketId})=>removePeer(socketId));
    signal.on("video:presence",meta=>{peerMeta.set(meta.socketId,{...(peerMeta.get(meta.socketId)||{}),...meta});renderVideoRoom()});
    signal.on("video:signal",async({from,playerId,name,data})=>{peerMeta.set(from,{...(peerMeta.get(from)||{}),socketId:from,playerId,name});const pc=createPeer(from,false);try{if(data.description){await pc.setRemoteDescription(data.description);if(data.description.type==="offer"){const answer=await pc.createAnswer();await pc.setLocalDescription(answer);signal.emit("video:signal",{target:from,data:{description:pc.localDescription}});await tunePeer(pc)}}else if(data.candidate)await pc.addIceCandidate(data.candidate)}catch(error){console.warn("Timeline Party video signal error",error)}});
  }

  function createPeer(socketId,initiator){
    if(peers.has(socketId))return peers.get(socketId).pc;
    const pc=new RTCPeerConnection({iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]});const entry={pc,stream:new MediaStream(),state:"connecting"};peers.set(socketId,entry);
    (localStream?.getTracks?.()||[]).forEach(track=>pc.addTrack(track,localStream));pc.onicecandidate=e=>e.candidate&&signal?.emit("video:signal",{target:socketId,data:{candidate:e.candidate}});
    pc.ontrack=e=>{entry.stream=e.streams?.[0]||entry.stream;if(!e.streams?.[0])entry.stream.addTrack(e.track);renderVideoRoom();startAudioMeter()};
    pc.onconnectionstatechange=()=>{entry.state=pc.connectionState;if(["failed","closed"].includes(pc.connectionState))removePeer(socketId);else renderVideoRoom()};
    if(initiator)setTimeout(async()=>{try{const offer=await pc.createOffer();await pc.setLocalDescription(offer);signal?.emit("video:signal",{target:socketId,data:{description:pc.localDescription}});await tunePeer(pc)}catch(e){console.warn(e)}},50);return pc;
  }

  async function tunePeer(pc){
    const total=1+peers.size;
    const videoBps=total>=9?160000:total>=7?220000:total>=5?320000:500000;
    for(const sender of pc.getSenders?.()||[]){
      if(!sender.track||!sender.getParameters||!sender.setParameters)continue;
      try{const params=sender.getParameters();params.encodings=params.encodings?.length?params.encodings:[{}];if(sender.track.kind==="video"){params.encodings[0].maxBitrate=videoBps;params.encodings[0].maxFramerate=total>=7?15:20}else if(sender.track.kind==="audio")params.encodings[0].maxBitrate=32000;await sender.setParameters(params)}catch{}
    }
  }
  function adaptVideoQuality(){for(const{pc}of peers.values())tunePeer(pc)}

  function removePeer(id){const e=peers.get(id);if(e)e.pc.close();peers.delete(id);peerMeta.delete(id);levels.delete(id);if(focusId===id)focusId=null;if(activeSpeakerId===id)activeSpeakerId=null;adaptVideoQuality();renderVideoRoom()}
  function sendPresence(){signal?.emit("video:presence",{camera:cameraEnabled,microphone:micEnabled,sharing:Boolean(screenStream)})}
  function toggleCamera(){const track=getVideoTrack();if(!track)return;cameraEnabled=!cameraEnabled;track.enabled=cameraEnabled;sendPresence();renderVideoRoom()}
  function toggleMic(){const track=getAudioTrack();if(!track)return;micEnabled=!micEnabled;track.enabled=micEnabled;sendPresence();renderVideoRoom()}

  async function flipCamera(){if(!localStream||!navigator.mediaDevices?.getUserMedia||screenStream)return;const old=getVideoTrack();if(!old)return;const nextFacing=facingMode==="user"?"environment":"user";try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:nextFacing,width:{ideal:480},height:{ideal:270},frameRate:{ideal:18,max:20}},audio:false});const next=s.getVideoTracks()[0];next.enabled=cameraEnabled;for(const{pc}of peers.values()){const sender=pc.getSenders().find(x=>x.track?.kind==="video");if(sender)await sender.replaceTrack(next)}localStream.removeTrack(old);old.stop();localStream.addTrack(next);facingMode=nextFacing;adaptVideoQuality();renderVideoRoom()}catch{}}
  async function toggleShare(){if(screenStream)return stopShare();if(!navigator.mediaDevices?.getDisplayMedia)return alert(t("Skærmdeling understøttes ikke på denne enhed.","Screen sharing is not supported on this device."));try{screenStream=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});const track=screenStream.getVideoTracks()[0];for(const{pc}of peers.values()){const sender=pc.getSenders().find(s=>s.track?.kind==="video");if(sender)await sender.replaceTrack(track)}track.onended=stopShare;sendPresence();renderVideoRoom()}catch{}}
  async function stopShare(){if(!screenStream)return;screenStream.getTracks().forEach(x=>x.stop());screenStream=null;const track=getVideoTrack();for(const{pc}of peers.values()){const sender=pc.getSenders().find(s=>s.track?.kind==="video"||!s.track);if(sender&&track)await sender.replaceTrack(track)}adaptVideoQuality();sendPresence();renderVideoRoom()}

  function startAudioMeter(){
    if(!joined||meterTimer)return;try{audioContext=audioContext||new(window.AudioContext||window.webkitAudioContext)()}catch{return}
    const analyzers=new Map();const add=(id,stream)=>{if(!stream?.getAudioTracks?.().length||analyzers.has(id))return;try{const source=audioContext.createMediaStreamSource(stream),an=audioContext.createAnalyser();an.fftSize=256;source.connect(an);analyzers.set(id,{an,data:new Uint8Array(an.frequencyBinCount)})}catch{}};
    meterTimer=setInterval(()=>{if(!joined)return;add("local",localStream);for(const[id,e]of peers)add(id,e.stream);let best=null,bestLevel=8;for(const[id,o]of analyzers){o.an.getByteFrequencyData(o.data);const level=o.data.reduce((a,b)=>a+b,0)/o.data.length;levels.set(id,level);if(level>bestLevel){best=id;bestLevel=level}}if(best&&best!==activeSpeakerId){activeSpeakerId=best;document.querySelectorAll(".video-tile").forEach(n=>n.classList.toggle("speaking",n.dataset.videoId===best));updateMiniSpeaker()}},350);
  }
  function stopAudioMeter(){if(meterTimer)clearInterval(meterTimer);meterTimer=null;levels.clear();activeSpeakerId=null}

  function leaveVideo(removeUi=true){try{signal?.emit("video:leave");signal?.disconnect()}catch{}signal=null;joined=false;joining=false;joinedRoom="";focusId=null;minimized=false;stopAudioMeter();peers.forEach(({pc})=>pc.close());peers.clear();peerMeta.clear();screenStream?.getTracks?.().forEach(x=>x.stop());screenStream=null;localStream?.getTracks?.().forEach(x=>x.stop());localStream=null;if(removeUi)renderVideoRoom()}

  function stateText(state){if(state==="connected")return t("forbundet","connected");if(state==="disconnected")return t("forbinder igen","reconnecting");if(state==="failed")return t("forbindelse mistet","connection lost");return t("forbinder","connecting")}
  function tileHtml(id,name,local,meta,entry){const camera=local?cameraEnabled:meta?.camera!==false,mic=local?micEnabled:meta?.microphone!==false,sharing=local?Boolean(screenStream):Boolean(meta?.sharing),state=local?"connected":entry?.state||"connecting";return `<div class="video-tile ${focusId===id?"focused":""} ${activeSpeakerId===id?"speaking":""}" data-video-id="${esc(id)}"><div class="video-media"><video data-video-stream="${esc(id)}" autoplay playsinline ${local?"muted":""}></video><div class="video-avatar">${esc(initials(name))}</div></div><div class="video-tile-bar"><span><strong>${esc(name)}</strong>${local?` <small>${t("(dig)","(you)")}</small>`:""}<small class="video-state-label"> · ${esc(stateText(state))}</small></span><span class="video-icons">${sharing?"🖥️":""} ${camera?"📹":"🚫"} ${mic?"🎙️":"🔇"} <i class="video-dot ${esc(state)}"></i></span></div><button class="video-focus-button" type="button" data-video-action="focus" data-id="${esc(id)}">⛶</button></div>`}

  function miniSpeakerHtml(){
    const id=activeSpeakerId&&((activeSpeakerId==="local")||peers.has(activeSpeakerId))?activeSpeakerId:(peers.keys().next().value||"local");
    const local=id==="local", meta=local?null:peerMeta.get(id), name=local?myName():(meta?.name||t("Spiller","Player"));
    return `<div class="video-mini-speaker" data-mini-id="${esc(id)}"><div class="video-mini-media"><video data-video-mini-stream="${esc(id)}" autoplay playsinline ${local?"muted":""}></video><div class="video-avatar">${esc(initials(name))}</div></div><div class="video-mini-name"><strong>${esc(name)}</strong><small>${t("Aktiv taler","Active speaker")}</small></div></div>`;
  }
  function updateMiniSpeaker(){if(!minimized)return;const holder=document.querySelector(".video-mini-wrap");if(holder){holder.innerHTML=miniSpeakerHtml();attachMiniStream()}}

  function renderVideoRoom(){
    document.querySelector(".video-room")?.remove();const code=gameCode();if(!code)return;if(joined&&joinedRoom!==code)leaveVideo(false);const root=document.querySelector("#app");if(!root)return;const section=document.createElement("section");section.className=`card video-room ${joined?"active":"inactive"} ${minimized?"minimized":""}`;
    const autoText=autoStartEnabled()?t("Auto-video: til","Auto video: on"):t("Auto-video: fra","Auto video: off");
    if(!joined)section.innerHTML=`<div class="video-room-head"><div><h2>📹 ${t("Videochat","Video chat")}</h2><p class="hint">${t("Valgfri video og lyd mellem op til 10 spillere.","Optional video and audio for up to 10 players.")}</p></div><button type="button" class="secondary video-auto-button" data-video-action="auto">${esc(autoText)}</button></div><button type="button" data-video-action="join" ${joining?"disabled":""}>📹 ${joining?t("Forbinder…","Connecting…"):t("Start videochat","Start video chat")}</button>`;
    else{const count=1+peers.size;const tiles=[tileHtml("local",myName(),true,{}, {state:"connected"})].concat([...peers.entries()].map(([id,e])=>tileHtml(id,peerMeta.get(id)?.name||t("Spiller","Player"),false,peerMeta.get(id),e))).join("");section.innerHTML=`<div class="video-room-head"><div><h2>📹 ${t("Videochat","Video chat")}</h2><p class="hint">${count}/${MAX_VIDEO_PARTICIPANTS} ${count===1?t("deltager","participant"):t("deltagere","participants")} · ${activeSpeakerId?t("aktiv taler markeret","active speaker highlighted"):t("klar","ready")}</p></div><div class="video-head-actions"><button type="button" class="secondary" data-video-action="auto">${esc(autoText)}</button><button type="button" class="secondary" data-video-action="minimize">${minimized?"▣ "+t("Vis alle","Show all"):"— "+t("Minimér","Minimize")}</button><button type="button" class="secondary video-leave" data-video-action="leave">${t("Forlad video","Leave video")}</button></div></div>${minimized?`<div class="video-mini-wrap">${miniSpeakerHtml()}</div>`:`<div class="video-content"><div class="video-grid video-count-${Math.min(count,10)}">${tiles}</div><div class="video-controls"><button type="button" data-video-action="mic">${micEnabled?"🎙️":"🔇"} ${micEnabled?t("Mikrofon","Microphone"):t("Mikrofon fra","Microphone off")}</button><button type="button" data-video-action="camera">${cameraEnabled?"📹":"🚫"} ${cameraEnabled?t("Kamera","Camera"):t("Kamera fra","Camera off")}</button><button type="button" data-video-action="flip">🔄 ${t("Vend kamera","Flip camera")}</button><button type="button" data-video-action="share" ${navigator.mediaDevices?.getDisplayMedia?"":"disabled"}>🖥️ ${screenStream?t("Stop deling","Stop sharing"):t("Del skærm","Share screen")}</button></div></div>`}`}
    const anchor=document.querySelector(".experience-lobby")||document.querySelector(".hero-card")||root.firstElementChild;if(anchor)anchor.after(section);else root.prepend(section);if(joined){attachStreams();attachMiniStream()}
  }
  function attachStreams(){const local=document.querySelector('video[data-video-stream="local"]');if(local)local.srcObject=screenStream||localStream;for(const[id,e]of peers){const v=[...document.querySelectorAll("video[data-video-stream]")].find(n=>n.dataset.videoStream===id);if(v&&v.srcObject!==e.stream)v.srcObject=e.stream}}
  function attachMiniStream(){const v=document.querySelector("video[data-video-mini-stream]");if(!v)return;const id=v.dataset.videoMiniStream;if(id==="local")v.srcObject=screenStream||localStream;else{const stream=peers.get(id)?.stream;if(stream&&v.srcObject!==stream)v.srcObject=stream}}
  function decorate(){const code=gameCode();if(!code){autoStartTriedCode="";if(joined)leaveVideo(false);document.querySelector(".video-room")?.remove();return}if(!document.querySelector(".video-room"))renderVideoRoom();if(autoStartEnabled()&&!joined&&!joining&&autoStartTriedCode!==code){autoStartTriedCode=code;setTimeout(()=>joinVideo({quiet:true}),300)}}

  document.addEventListener("click",e=>{const b=e.target.closest("[data-video-action]");if(!b)return;e.preventDefault();const a=b.dataset.videoAction;if(a==="join")joinVideo();if(a==="leave")leaveVideo();if(a==="mic")toggleMic();if(a==="camera")toggleCamera();if(a==="flip")flipCamera();if(a==="share")toggleShare();if(a==="minimize"){minimized=!minimized;renderVideoRoom()}if(a==="focus"){focusId=focusId===b.dataset.id?null:b.dataset.id;renderVideoRoom()}if(a==="auto"){const enabled=!autoStartEnabled();localStorage.setItem(AUTO_VIDEO_KEY,enabled?"1":"0");if(enabled)autoStartTriedCode="";renderVideoRoom();decorate()}},true);
  document.addEventListener("timeline-party-language-change",renderVideoRoom);window.addEventListener("beforeunload",()=>leaveVideo(false));new MutationObserver(()=>requestAnimationFrame(decorate)).observe(document.querySelector("#app")||document.documentElement,{childList:true,subtree:true});setInterval(decorate,1500);decorate();
})();
