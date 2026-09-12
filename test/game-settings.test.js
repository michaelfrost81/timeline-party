const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");

const port = 14000 + Math.floor(Math.random() * 1000);
let serverProcess;

class Client {
  constructor() { this.nextAck = 1; this.messages = []; this.waiters = []; }
  async connect() {
    this.socket = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
    this.socket.addEventListener("message", (event) => this.receive(String(event.data)));
    await new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once:true }); this.socket.addEventListener("error", reject, { once:true }); });
    await this.wait((m) => m.startsWith("0")); this.socket.send("40"); await this.wait((m) => m.startsWith("40"));
  }
  receive(message) {
    if (message === "2") return this.socket.send("3");
    const index = this.waiters.findIndex((item) => item.predicate(message));
    if (index >= 0) { const [item] = this.waiters.splice(index,1); clearTimeout(item.timer); return item.resolve(message); }
    this.messages.push(message);
  }
  wait(predicate) {
    const index = this.messages.findIndex(predicate); if (index >= 0) return Promise.resolve(this.messages.splice(index,1)[0]);
    return new Promise((resolve,reject) => { const timer=setTimeout(()=>reject(new Error("timeout")),3000); this.waiters.push({predicate,resolve,timer}); });
  }
  async emit(event, payload) {
    const id=this.nextAck++; this.socket.send(`42${id}${JSON.stringify([event,payload])}`);
    const packet=await this.wait((m)=>m.startsWith(`43${id}`)); return JSON.parse(packet.slice(String(id).length+2))[0];
  }
  async update() { const packet=await this.wait((m)=>m.startsWith('42["game:update"')); return JSON.parse(packet.slice(2))[1]; }
  close(){ this.socket.close(); }
}

before(async () => {
  serverProcess=spawn(process.execPath,["server.js"],{cwd:process.cwd(),env:{...process.env,PORT:String(port)},stdio:"ignore"});
  for(let i=0;i<30;i++){ try{const r=await fetch(`http://127.0.0.1:${port}`); if(r.ok)return;}catch{} await new Promise(r=>setTimeout(r,100)); }
  throw new Error("server start failed");
});
after(()=>serverProcess.kill());

async function setup(settings) {
  const host=new Client(), guest=new Client(); await host.connect(); await guest.connect();
  const created=await host.emit("game:create",{playerName:"Host",playerId:"host",settings}); await host.update();
  await guest.emit("game:join",{code:created.code,playerName:"Guest",playerId:"guest"}); await Promise.all([host.update(),guest.update()]);
  return {host,guest,code:created.code};
}
async function both(host,guest,event,payload){const result=await host.emit(event,payload); if(result.ok) await Promise.all([host.update(),guest.update()]); return result;}

test("værtsindstillinger sætter challenge-beholdning for alle", async()=>{
  const {host,guest,code}=await setup({maxChallenges:2,winMode:"host"});
  const state=await host.emit("game:settings",{code,settings:{maxChallenges:3,winMode:"host",targetScore:10,roundLimit:15,challengesEnabled:true,answerTimer:0}});
  assert.equal(state.ok,true); assert.equal(state.game.settings.maxChallenges,3); assert.equal(state.game.players.every(p=>p.challengesRemaining===3),true);
  host.close(); guest.close();
});

test("challenges kan slås helt fra", async()=>{
  const {host,guest,code}=await setup({challengesEnabled:false,winMode:"host"});
  await both(host,guest,"song:start",{code,title:"Song",artist:"Artist",year:1984,url:""});
  await both(host,guest,"song:decade",{code,decade:1980});
  const locked=await both(host,guest,"song:lock",code);
  assert.equal(locked.game.phase,"awaiting_reveal");
  const challenge=await guest.emit("song:challenge",code); assert.equal(challenge.ok,false);
  host.close(); guest.close();
});

test("først til point afslutter automatisk og viser vinder", async()=>{
  const {host,guest,code}=await setup({winMode:"firstTo",targetScore:1,challengesEnabled:false});
  await both(host,guest,"song:start",{code,title:"Song",artist:"Artist",year:1984,url:""});
  await both(host,guest,"song:decade",{code,decade:1980});
  await both(host,guest,"song:lock",code);
  const revealed=await both(host,guest,"song:reveal",code);
  assert.equal(revealed.game.finished,true); assert.equal(revealed.game.phase,"finished"); assert.deepEqual(revealed.game.winnerIds,["host"]);
  const next=await host.emit("song:next",{code,roundNumber:revealed.game.roundNumber}); assert.equal(next.ok,false);
  host.close(); guest.close();
});
