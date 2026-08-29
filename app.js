const socket=io();
let game=null, myId=null, myCode=null, myName=localStorage.tpName||"";
socket.on("connect",()=>myId=socket.id);
socket.on("game:update",g=>{game=g;myCode=g.code;render();});

function home(){document.getElementById("app").innerHTML=`
<h1>Timeline Party</h1><p class="tag">Kan du placere musikken rigtigt i tiden?</p>
<div class="card"><input id="name" placeholder="Dit navn" value="${myName}"><button onclick="create()">🎉 Opret spil</button><button class="secondary" onclick="joinForm()">🎵 Deltag i spil</button></div>`}
function create() {
  const name = document.getElementById("name").value.trim();
  if (!name) return;

  myName = name;
  localStorage.tpName = name;

  const code = Math.random().toString(36).substring(2, 7).toUpperCase();

  socket.emit("createGame", {
    name: name,
    code: code
  });
}function joinForm(){document.getElementById("app").innerHTML=`<h1>Timeline Party</h1><div class="card"><input id="name" placeholder="Dit navn" value="${myName}"><input id="code" placeholder="Spilkode"><button onclick="join()">Deltag</button><button class="secondary" onclick="home()">Tilbage</button></div>`}
function join(){const n=document.getElementById("name").value.trim(),c=document.getElementById("code").value.trim().toUpperCase();if(!n||!c)return;myName=n;localStorage.tpName=n;socket.emit("joinGame",{name:n,code:c},r=>{if(!r.ok)alert(r.error)});}
function esc(s){return String(s||"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));}
function render(){
 if(!game)return home();
 const me=game.players.find(p=>p.id===myId),host=game.hostId===myId;
 const winner=game.players.find(p=>p.score>=game.targetScore);
 let html=`<h1>Timeline Party</h1><div class="card"><div class="small">SPILKODE</div><div class="code">${game.code}</div><p class="small">Del koden med vennerne</p></div>`;
 if(winner){html+=`<div class="card winner">🏆 ${esc(winner.name)} vinder!<br><span class="small">${winner.score} point</span></div>`}
 html+=`<div class="card"><b>Spillere</b>${game.players.map(p=>`<div class="player"><span>${esc(p.name)} ${p.id===game.hostId?'<span class="host">VÆRT</span>':""}</span><b>${p.score} ⭐</b></div>`).join("")}</div>`;
 if(game.phase==="lobby"){html+=`<div class="card">${host?`<button onclick="startGame()">Start spillet 🎶</button>`:`<p>Venter på at værten starter…</p>`}</div>`;}
 else if(!game.song){html+=host?`<div class="card"><h2>Ny sang</h2><input id="title" placeholder="Titel"><input id="artist" placeholder="Kunstner"><input id="year" type="number" placeholder="Årstal"><button onclick="setSong()">Start runden 🎵</button></div>`:`<div class="card">Venter på næste sang… 🎶</div>`}
 else {
   const song=game.song;
   if(!song.revealed){
     html+=`<div class="card"><h2>🎵 Hvor hører sangen hjemme?</h2><p>Placér den mellem årstallene på din tidslinje.</p><div class="timeline">${me.timeline.map(y=>`<div class="year">${y}</div>`).join("")||"<span class='small'>Ingen sange endnu</span>"}</div><div class="slots">${Array.from({length:me.timeline.length+1},(_,i)=>`<button class="slot" onclick="place(${i})">Placer her</button>`).join("")}</div><p class="small">${me.ready?"Du er klar! Venter på de andre…":"Vælg en placering"}</p></div>`;
     if(host)html+=`<div class="card"><a href="https://open.spotify.com/search/${encodeURIComponent(song.title+" "+song.artist)}" target="_blank"><button>🎵 Afspil på Spotify</button></a><button onclick="reveal()">Afslør svaret ✨</button></div>`;   } else {
     html+=`<div class="card"><h2>🎉 Svaret</h2><h3>${esc(song.title)} – ${esc(song.artist)}</h3><div class="code">${song.year}</div><p>Point gives automatisk, hvis sangen er placeret korrekt.</p><a href="https://open.spotify.com/search/${encodeURIComponent(song.title+" "+song.artist)}" target="_blank"><button>🎵 Åbn på Spotify</button></a>${host?'<button onclick="next()">Næste runde ➜</button>':""}</div>`;   }
 }
 document.getElementById("app").innerHTML=html;
}
function startGame(){socket.emit("startGame",{code:myCode})}
function setSong(){
  socket.emit("setSong",{
    code: myCode,
    title: document.getElementById("title").value,
    artist: document.getElementById("artist").value,
    year: document.getElementById("year").value
  })
}function place(position){socket.emit("placeSong",{code:myCode,position})}
function reveal(){socket.emit("revealSong",{code:myCode})}
function next(){socket.emit("nextRound",{code:myCode})}
home();
