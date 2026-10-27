'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const canvas = $('gameCanvas'), ctx = canvas.getContext('2d');
  const bg = new Image(), shell = new Image();
  bg.src = 'assets/village.png'; shell.src = 'assets/turtle.png';
  const SAVE_KEY = 'turtle-bounce-v1';
  let storageAvailable = true, save = { best: 0, coins: 0, launch: 0, shell: 0, runs: 0 };
  try { const old = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (old) for (const key of Object.keys(save)) { if (Number.isFinite(old[key]) && old[key] >= 0) save[key] = Math.floor(old[key]); } save.launch = Math.min(save.launch, 5); save.shell = Math.min(save.shell, 5); } catch { storageAvailable = false; }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { storageAvailable = false; } if (!storageAvailable) $('saveNote').textContent = '현재 브라우저에서는 저장이 제한돼요. 이번 접속 동안 기록은 유지됩니다.'; }
  const regions = [{name:'햇살 마을',short:'마을',at:0},{name:'바람 도로',short:'도로',at:250},{name:'지붕 도시',short:'도시',at:650},{name:'통통 공장',short:'공장',at:1150},{name:'증기 발전소',short:'발전소',at:1750},{name:'푸른 바다',short:'바다',at:2400}];
  let W = 1280, H = 600, ground = 510, stage = 'angle', paused = false, helpPaused = false;
  let elapsed = 0, phase = 0, angle = 45, power = .5, combo = 0, comboLeft = 3, comboStarted = false;
  let camera = 0, cameraY = 0, particles = [], floaters = [], trail = [], objects = [], audio = null, sound = false;
  let turtle, run, last = 0, lastUI = 0, hintUntil = 0, hintText = '', usedPads = new Set(), usedCoins = new Set(), tapCooldown = 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const distance = () => Math.max(0, Math.floor((turtle.x - 180) / 8));
  const region = d => regions.reduce((found, r) => d >= r.at ? r : found, regions[0]);
  function resize() { W = Math.round(600 * $('viewport').clientWidth / $('viewport').clientHeight); canvas.width = W; canvas.height = H; }
  new ResizeObserver(resize).observe($('viewport')); resize();
  function syncSave() {
    $('best').textContent = save.best.toLocaleString(); $('wallet').textContent = save.coins.toLocaleString();
    for (const [kind, id] of [['launch','Launch'],['shell','Shell']]) {
      const level = save[kind], cost = 80 + level * 70;
      $(kind+'Level').textContent = (kind === 'launch' ? '추진력' : '반동과 마찰') + ' · Lv. ' + level;
      $(kind+'Cost').textContent = level === 5 ? '최고 단계' : cost + ' ◎';
      $('upgrade'+id).disabled = stage === 'flight' || level === 5 || save.coins < cost;
    }
  }
  function setStage(next) {
    stage = next;
    for (const kind of ['angle','power','combo']) {
      $(kind+'Card').classList.toggle('active',stage === kind);
      $(kind+'Card').classList.toggle('done', ['angle','power','combo','flight','result'].indexOf(stage) > ['angle','power','combo'].indexOf(kind));
      $(kind+'Button').disabled = stage !== kind;
    }
    $('flightTools').hidden = stage !== 'flight';
    syncSave();
  }
  function reset() {
    paused = false; helpPaused = false; elapsed = phase = camera = cameraY = 0; angle = 45; power = .5; combo = 0; comboLeft = 3; comboStarted = false; tapCooldown = 0;
    turtle = { x:180, y:ground-87, vx:0, vy:0, r:27, rot:-.2, squash:0, rolling:false, face:false };
    run = { perfect:0, pad:0, coins:0, charges:3, time:0, pending:false, newBest:false };
    objects = []; particles = []; floaters = []; trail = []; usedPads = new Set(); usedCoins = new Set();
    for (let i=0; i<85; i++) {
      const x = 610 + i * 245 + Math.sin(i * 12.7) * 48;
      const type = i % 7 === 4 ? 'rough' : i % 4 === 2 ? 'ramp' : i % 6 === 5 ? 'steam' : 'pad';
      objects.push({x,type,id:i,width:type==='pad'?125:110});
    }
    $('pauseOverlay').hidden = $('resultOverlay').hidden = $('helpOverlay').hidden = true;
    $('pauseButton').textContent = 'Ⅱ'; $('comboValue').textContent = '×0'; $('powerValue').textContent = '—';
    $('powerFill').style.width = '0%'; $('comboFill').style.width = '0%'; $('comboTime').textContent = '힘을 정하면 시작해요';
    $('angleButton').innerHTML = '각도 결정 <span>SPACE</span>'; $('powerButton').innerHTML = '힘 결정 <span>SPACE</span>'; $('comboButton').innerHTML = '연타하기 <span>TAP!</span>';
    setStage('angle'); say('각도를 맞추고, 여행을 시작해요!',3); updateUI();
  }
  function say(text, duration=1.2) { hintText=text; hintUntil=elapsed+duration; $('stageHint').textContent=text; $('stageHint').hidden=false; $('announcement').textContent=text; }
  function tone(freq=480, duration=.09, type='sine', volume=.05) {
    if (!sound) return;
    try { audio ||= new (window.AudioContext||window.webkitAudioContext)(); if (audio.state==='suspended') audio.resume(); const o=audio.createOscillator(),g=audio.createGain(); o.type=type; o.frequency.setValueAtTime(freq,audio.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(100,freq*.65),audio.currentTime+duration); g.gain.setValueAtTime(volume,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g);g.connect(audio.destination);o.start();o.stop(audio.currentTime+duration); } catch {}
  }
  function burst(x,y,color,n=12) { for(let i=0;i<n;i++) particles.push({x,y,vx:(Math.random()-.5)*190,vy:-30-Math.random()*130,life:.5+Math.random()*.4,max:1,r:2+Math.random()*3,color}); }
  function label(text,x,y,color='#6b9270') { floaters.push({text,x,y,color,life:1.4}); }
  function action() {
    if (paused || helpPaused || ! $('loading').hidden) return;
    if(stage==='angle') { setStage('power'); phase=0; $('angleButton').innerHTML='각도 확정 <span>✓</span>';say('힘 게이지가 높을 때 멈춰요!',3);tone(470); }
    else if(stage==='power') { setStage('combo'); comboLeft=3;comboStarted=false;$('powerButton').innerHTML='힘 확정 <span>✓</span>';$('comboTime').textContent='첫 탭부터 3초 시작!';say('준비되면 탭! 3초 동안 힘을 모아요.',4);tone(600); }
    else if(stage==='combo') {comboStarted=true;combo++;$('comboValue').textContent='×'+combo;tone(400+Math.min(combo,25)*18,.045,'triangle',.025); }
    else if(stage==='flight') landingTap();
    else if(stage==='result') reset();
  }
  function launch() {
    const velocity = (410+power*225+Math.min(combo,25)*6.5)*(1+save.launch*.11);
    const rad=angle*Math.PI/180;
    turtle.vx=velocity*Math.cos(rad);turtle.vy=-velocity*Math.sin(rad);run.charges=3+Math.min(4,Math.floor(combo/7));
    $('comboButton').innerHTML='발사 완료 <span>✓</span>';
    setStage('flight');say('통통! 바닥에 닿기 직전 탭하세요.',3);tone(700,.3,'triangle');burst(turtle.x-20,turtle.y+20,'#f5e0a3',20);
  }
  function landingTap() {
    if(tapCooldown>0 || run.charges<=0) return;
    tapCooldown=.45; run.charges--;
    const height=ground-turtle.r-turtle.y;
    const timeToLand=turtle.vy>0 ? (Math.sqrt(turtle.vy*turtle.vy+2*450*Math.max(0,height))-turtle.vy)/450 : Infinity;
    if (turtle.rolling) {
      turtle.rolling=false;turtle.vy=-245;turtle.vx=Math.min(800,turtle.vx+60);run.perfect++;label('다시 통통!',turtle.x,turtle.y-35);burst(turtle.x,turtle.y,'#f1d694');tone(740);say('다시 날아올랐어요!',1);
    } else if(timeToLand<=.22 && height>=-3) {run.pending=true;say('좋아요, 착지 준비!',.5);tone(800,.05);}
    else {say(turtle.vy<0?'아직 올라가는 중이에요!':'조금 더 바닥 가까이에서 탭!',1);tone(240,.06);}
    updateUI();
  }
  function finish(clear=false) {
    if(stage!=='flight')return;
    const d=distance(), reward=Math.max(12,Math.floor(d*.22)+run.perfect*7+run.coins);
    run.newBest=d>save.best;save.best=Math.max(save.best,d);save.coins+=reward;save.runs++;persist();
    setStage('result');turtle.face=true;
    $('resultOverlay').hidden=false;
    $('resultTag').textContent=clear?'바다에 도착했어요!':run.newBest?'새로운 최고 기록!':'오늘의 작은 여행';
    $('resultTitle').textContent=clear?'드디어, 푸른 바다!':run.newBest?'한 걸음 더 멀리!':'참 잘 날아왔어요!';
    $('resultDistance').textContent=d.toLocaleString();$('resultPerfect').textContent=run.perfect+'회';$('resultCoins').textContent='+'+reward+' ◎';
    const next=regions.find(r=>r.at>d);$('resultDetail').textContent=clear?'작은 등껍질로 큰 여행을 해냈어요. 이제 더 좋은 기록에 도전해요!':next?next.short+'까지 '+(next.at-d)+' m! 다음에는 조금 더 멀리.':'바닷바람이 느껴져요. 한 번 더 날아볼까요?';
    $('stageHint').hidden=true;tone(550,.18);syncSave();
  }
  function physics(dt) {
    run.time+=dt;const oldX=turtle.x, oldY=turtle.y;
    turtle.vx *= Math.exp(-(.045-save.shell*.004)*dt);
    if(turtle.rolling) { turtle.vx=Math.max(0,turtle.vx-(80-save.shell*9)*dt);turtle.y=ground-turtle.r; }
    else { turtle.vy+=450*dt;turtle.y+=turtle.vy*dt; }
    turtle.x+=turtle.vx*dt;turtle.rot+=turtle.vx*dt/58;turtle.squash=Math.max(0,turtle.squash-dt*3);
    const raisedPad = turtle.vy > 0 && objects.find(o => o.type !== 'rough' && !usedPads.has(o.id) && Math.abs(o.x-turtle.x)<o.width*.5 && oldY+turtle.r<=ground-22 && turtle.y+turtle.r>=ground-22);
    if(!turtle.rolling && (raisedPad || turtle.y>=ground-turtle.r) && turtle.vy>0) {
      const landingX=oldX+(turtle.x-oldX)*clamp((ground-turtle.r-oldY)/(turtle.y-oldY||1),0,1);
      turtle.y=ground-turtle.r-(raisedPad?22:0);turtle.squash=.22;
      const obj=raisedPad || objects.find(o=>Math.abs(o.x-landingX)<o.width*.5+turtle.r*.35 && !usedPads.has(o.id));
      let bounce=.53+save.shell*.025;
      if(obj) {
        usedPads.add(obj.id);run.pad++;
        if(obj.type==='pad') {bounce=.86;turtle.vy=-Math.max(250,Math.min(470,turtle.vy*bounce));turtle.vx=Math.min(860,turtle.vx*.94+18);label('통통 발판!',turtle.x,turtle.y-45);tone(670);}
        else if(obj.type==='ramp') {turtle.vx=Math.min(880,turtle.vx+130);turtle.vy=-210;label('슝! 가속',turtle.x,turtle.y-45,'#4b94ac');tone(900);}
        else if(obj.type==='steam') {turtle.vy=-430;turtle.vx=Math.min(840,turtle.vx+40);label('증기 점프!',turtle.x,turtle.y-45);tone(800);}
        else {turtle.vx*=.75;turtle.vy=-Math.min(110,turtle.vy*.3);label('울퉁불퉁!',turtle.x,turtle.y-45,'#a08e72');tone(190);}
      } else {turtle.vx*=.77+save.shell*.024;turtle.vy=-turtle.vy*bounce;tone(330,.07);}
      if(run.pending) {run.pending=false;run.perfect++;turtle.vx=Math.min(900,turtle.vx+95);turtle.vy=-Math.max(270,Math.min(480,Math.abs(turtle.vy)+100));label('완벽한 착지!',turtle.x,turtle.y-70,'#55996b');burst(turtle.x,turtle.y,'#f9d479',20);tone(990,.15);say('완벽한 착지! 계속 가요!',1.4);}
      if(Math.abs(turtle.vy)<90){turtle.vy=0;turtle.rolling=true;}
      burst(turtle.x,ground-10,'#dec694',8);
    }
    for(const obj of objects) {
      if(obj.type==='ramp' && turtle.rolling && oldX<obj.x && turtle.x>=obj.x && !usedPads.has(obj.id)) {usedPads.add(obj.id);turtle.vx=Math.min(880,turtle.vx+130);turtle.vy=-190;turtle.rolling=false;label('슝! 가속',turtle.x,turtle.y-45);tone(700);}
      if(obj.type==='pad' && turtle.rolling && Math.abs(turtle.x-obj.x)<30 && !usedPads.has(obj.id)){usedPads.add(obj.id);turtle.vy=-265;turtle.rolling=false;turtle.vx+=35;label('다시 통통!',turtle.x,turtle.y-45);}
    }
    // Only coins actually touched by the shell are collected.
    const coinIndex=Math.round(turtle.x/140);
    if(coinIndex>2&&!usedCoins.has(coinIndex)&&Math.hypot(turtle.x-coinIndex*140,turtle.y-(ground-93-Math.sin(coinIndex*.75)*22))<turtle.r+12){usedCoins.add(coinIndex);run.coins+=2;burst(turtle.x,turtle.y,'#eac462',5);tone(1100,.04,'sine',.02);}
    camera+=(Math.max(0,turtle.x-W*.3)-camera)*Math.min(1,dt*5);
    cameraY+=(Math.min(0,turtle.y-150)-cameraY)*Math.min(1,dt*3);
    trail.push({x:turtle.x,y:turtle.y});if(trail.length>25)trail.shift();
    if(distance()>=2400){finish(true);return;}
    if(turtle.vx<14 || run.time>75)finish();
  }
  function updateUI() {
    $('distance').textContent=distance().toLocaleString();$('speed').textContent=Math.round(turtle.vx/10);$('chargeCount').textContent='착지 도움 '+run.charges+'회';$('landButton').disabled=run.charges<=0;
    const d=distance(),r=region(d),next=regions.find(r=>r.at>d);$('regionName').textContent=r.name;$('nextRegion').textContent=next?'다음: '+next.short+' '+(next.at-d)+' m':'바다에 도착했어요!';
    $('angleValue').textContent=Math.round(angle)+'°';$('angleNeedle').setAttribute('x2',20+140*Math.cos(angle*Math.PI/180));$('angleNeedle').setAttribute('y2',70-140*Math.sin(angle*Math.PI/180));
    if(stage==='power'){$('powerValue').textContent=Math.round(power*100)+'%';$('powerFill').style.width=(power*100)+'%';$('powerCaption').textContent=power>.85?'지금! 강하게 날아요':'게이지가 높을 때 멈춰요';}
    if(stage==='combo'){$('comboTime').textContent=comboStarted?comboLeft.toFixed(1)+'초 남았어요':'첫 탭부터 3초 시작!';$('comboFill').style.width=(comboStarted?(3-comboLeft)/3*100:0)+'%';}
    const h=ground-turtle.r-turtle.y;$('landButton').classList.toggle('ready',stage==='flight'&&run.charges>0&&(turtle.rolling||turtle.vy>0&&h<90));
    if(elapsed>hintUntil){if(stage==='flight'){hintText=turtle.rolling?'구르는 중! 탭하면 다시 튀어요.':turtle.y<100?'높이 '+Math.round((ground-turtle.y)/8)+' m · 바닥으로 내려가는 중':run.charges>0?'바닥 가까이에서 탭하면 완벽한 착지!':'발판을 타고 조금 더 멀리!';$('stageHint').textContent=hintText;$('stageHint').hidden=false;}else if(stage==='angle'||stage==='power'||stage==='combo'){$('stageHint').hidden=true;}}
  }
  function update(dt) {
    if(paused||helpPaused)return;
    elapsed+=dt;phase+=dt;tapCooldown=Math.max(0,tapCooldown-dt);
    if(stage==='angle')angle=17+(Math.sin(phase*4.2)+1)*27;
    else if(stage==='power')power=.16+(Math.sin(phase*5.4)+1)*.42;
    else if(stage==='combo'&&comboStarted){comboLeft=Math.max(0,comboLeft-dt);if(comboLeft<=0)launch();}
    else if(stage==='flight')physics(dt);
    for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=180*dt;}particles=particles.filter(p=>p.life>0);
    for(const f of floaters){f.life-=dt;f.y-=25*dt;}floaters=floaters.filter(f=>f.life>0);
  }
  function roundRect(x,y,w,h,r,fill,stroke='#75664e',line=2){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.lineWidth=line;ctx.strokeStyle=stroke;ctx.stroke();}}
  function drawPad(o) {
    const x=o.x-camera, y=ground-cameraY;
    if(x<-170||x>W+170)return;
    if(o.type==='pad') {
      roundRect(x-52,y-15,18,17,5,'#ab8860');roundRect(x+32,y-15,18,17,5,'#ab8860');
      ctx.save();ctx.beginPath();ctx.ellipse(x,y-20,65,18,0,0,Math.PI*2);ctx.fillStyle='#f8efcc';ctx.fill();ctx.clip();
      ctx.fillStyle='#e1a18c';for(let i=-70;i<70;i+=44)ctx.fillRect(x+i,y-45,22,50);ctx.restore();ctx.beginPath();ctx.ellipse(x,y-20,65,18,0,0,Math.PI*2);ctx.lineWidth=3;ctx.strokeStyle='#73664c';ctx.stroke();ctx.beginPath();ctx.ellipse(x,y-23,58,10,0,Math.PI,Math.PI*2);ctx.strokeStyle='#fff8e0';ctx.lineWidth=3;ctx.stroke();
    } else if(o.type==='ramp') {
      ctx.beginPath();ctx.moveTo(x-57,y-1);ctx.lineTo(x+47,y-43);ctx.lineTo(x+47,y-1);ctx.closePath();ctx.fillStyle='#d2aa7b';ctx.fill();ctx.strokeStyle='#79644c';ctx.lineWidth=3;ctx.stroke();ctx.beginPath();ctx.moveTo(x-54,y-3);ctx.lineTo(x+47,y-46);ctx.strokeStyle='#efc586';ctx.lineWidth=8;ctx.stroke();ctx.fillStyle='#827351';ctx.font='bold 24px sans-serif';ctx.fillText('»',x-8,y-10);
    } else if(o.type==='steam') {
      roundRect(x-37,y-35,74,34,7,'#b2c5b4');roundRect(x-43,y-44,86,15,6,'#e0e1ce');ctx.fillStyle='#688678';for(let i=-25;i<30;i+=16)ctx.fillRect(x+i,y-39,9,4);
      for(let j=0;j<3;j++){const a=(elapsed*40+j*25)%90;ctx.globalAlpha=(1-a/90)*.65;ctx.beginPath();ctx.ellipse(x+(j-1)*17,y-50-a,12+a*.08,15+a*.15,0,0,Math.PI*2);ctx.fillStyle='#fffaf0';ctx.fill();}ctx.globalAlpha=1;
    } else {
      for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(x-40+i*20,y-3,11,7+i%2*3,-.3,0,Math.PI*2);ctx.fillStyle=i%2?'#b0af94':'#cac3a4';ctx.fill();ctx.strokeStyle='#a0987f';ctx.lineWidth=1;ctx.stroke();}
    }
  }
  function drawLauncher() {
    const x=100-camera,y=ground-cameraY;
    ctx.save();ctx.translate(x,y);
    roundRect(-30,-12,160,12,5,'#ac885e');roundRect(-15,-76,12,70,5,'#be9b6e');roundRect(108,-81,12,75,5,'#b49063');
    for(let i=0;i<2;i++){ctx.beginPath();ctx.moveTo(25+i*45,-16);for(let j=0;j<5;j++)ctx.lineTo(25+i*45+(j%2?12:-8),-20-j*9);ctx.strokeStyle='#797b5b';ctx.lineWidth=3;ctx.stroke();}
    ctx.beginPath();ctx.moveTo(-12,-61);ctx.quadraticCurveTo(45,-48,120,-90);ctx.lineTo(119,-79);ctx.quadraticCurveTo(45,-36,-12,-49);ctx.closePath();ctx.fillStyle='#fff0d5';ctx.fill();ctx.strokeStyle='#71614d';ctx.lineWidth=3;ctx.stroke();
    ctx.save();ctx.beginPath();ctx.moveTo(-12,-61);ctx.quadraticCurveTo(45,-48,120,-90);ctx.lineTo(119,-79);ctx.quadraticCurveTo(45,-36,-12,-49);ctx.closePath();ctx.clip();ctx.fillStyle='#e6a18a';for(let i=-10;i<130;i+=35)ctx.fillRect(i,-100,17,60);ctx.restore();
    ctx.beginPath();ctx.moveTo(-28,-3);ctx.lineTo(111,-92);ctx.strokeStyle='#997349';ctx.lineWidth=13;ctx.lineCap='round';ctx.stroke();ctx.strokeStyle='#caa270';ctx.lineWidth=7;ctx.stroke();ctx.lineCap='butt';ctx.restore();
  }
  function drawCoin(x,y) {const sx=x-camera,sy=y-cameraY;if(sx<-20||sx>W+20)return;ctx.beginPath();ctx.arc(sx,sy,10,0,Math.PI*2);ctx.fillStyle='#f1d57b';ctx.fill();ctx.strokeStyle='#bf9d50';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#aa8b47';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.fillText('·',sx,sy+4);ctx.textAlign='left';}
  function draw() {
    ctx.clearRect(0,0,W,H);ctx.fillStyle='#b7dcf1';ctx.fillRect(0,0,W,H);
    if(bg.complete&&bg.naturalWidth){const width=Math.max(W,1280),offset=camera*.13,first=Math.floor(offset/width);for(let i=first;i<=first+1;i++){ctx.save();ctx.translate(i*width-offset,-cameraY);if(i%2){ctx.translate(width,0);ctx.scale(-1,1);}ctx.drawImage(bg,0,0,width,H);ctx.restore();}}
    if(cameraY<0){ctx.fillStyle='#b7dcf1';ctx.fillRect(0,0,W,Math.max(0,-cameraY));for(let i=0;i<5;i++){let x=((i*310-camera*.09)% (W+300)+W+300)%(W+300)-100;ctx.globalAlpha=.5;ctx.beginPath();ctx.ellipse(x,80+i%2*65,75,17,0,0,Math.PI*2);ctx.fillStyle='#fffbed';ctx.fill();ctx.globalAlpha=1;}}
    const gy=ground-cameraY;
    if(gy<H+100){ctx.fillStyle='rgba(238,219,178,.38)';ctx.fillRect(0,gy-6,W,38);ctx.strokeStyle='#c2b995';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,gy+7);ctx.lineTo(W,gy+7);ctx.stroke();}
    // Ground decorations scroll independently of the distant painted scenery.
    for(let i=Math.floor(camera/110);i<(camera+W)/110+1;i++){const x=i*110-camera;ctx.fillStyle='#aba57d';ctx.globalAlpha=.55;ctx.beginPath();ctx.ellipse(x+37,gy+14,4,1.5,.2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(x+73,gy+24,3,1,-.2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
    for(const r of regions){const x=180+r.at*8-camera;if(r.at&&x>-100&&x<W+100){roundRect(x,gy-86,8,85,3,'#a38c63');roundRect(x-37,gy-103,102,34,6,'#e7d4ab');ctx.fillStyle='#75684b';ctx.font='bold 13px sans-serif';ctx.fillText(r.short+' →',x-24,gy-81);}}
    for(const o of objects)drawPad(o);
    for(let i=Math.floor((camera+100)/140);i<(camera+W)/140;i++){if(i>2&&!usedCoins.has(i))drawCoin(i*140,ground-93-Math.sin(i*.75)*22);}
    if(camera<350)drawLauncher();
    if(stage==='angle'||stage==='power'||stage==='combo'){
      const rad=angle*Math.PI/180;ctx.setLineDash([5,10]);ctx.beginPath();const v=480;for(let t=0;t<1.5;t+=.06){const x=turtle.x+v*Math.cos(rad)*t,y=turtle.y-v*Math.sin(rad)*t+225*t*t;if(t===0)ctx.moveTo(x-camera,y-cameraY);else ctx.lineTo(x-camera,y-cameraY);if(y>ground-20)break;}ctx.strokeStyle='rgba(102,115,103,.65)';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
    }
    if(stage==='flight'&&trail.length>3){ctx.beginPath();trail.forEach((p,i)=>i?ctx.lineTo(p.x-camera,p.y-cameraY):ctx.moveTo(p.x-camera,p.y-cameraY));ctx.strokeStyle='rgba(255,249,222,.6)';ctx.lineWidth=4;ctx.stroke();}
    const tx=turtle.x-camera,ty=turtle.y-cameraY;
    ctx.globalAlpha=clamp(1-(ground-turtle.y)/650,.12,.3);ctx.beginPath();ctx.ellipse(tx,gy+2,26,5,0,0,Math.PI*2);ctx.fillStyle='#6c7151';ctx.fill();ctx.globalAlpha=1;
    if(turtle.face){ctx.beginPath();ctx.ellipse(tx+25,ty+3,16,12,.2,0,Math.PI*2);ctx.fillStyle='#a9bf7c';ctx.fill();ctx.strokeStyle='#6e7151';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.arc(tx+32,ty,2,0,Math.PI*2);ctx.fillStyle='#4f5740';ctx.fill();}
    ctx.save();ctx.translate(tx,ty);ctx.rotate(turtle.rolling||stage==='flight'?turtle.rot:-.25);ctx.scale(1+turtle.squash,1-turtle.squash*.65);
    if(shell.complete&&shell.naturalWidth)ctx.drawImage(shell,-38,-33,76,66);else{ctx.beginPath();ctx.arc(0,0,27,0,Math.PI*2);ctx.fillStyle='#88a16d';ctx.fill();ctx.strokeStyle='#596546';ctx.lineWidth=3;ctx.stroke();}ctx.restore();
    if(stage==='flight'&&!turtle.rolling){ctx.strokeStyle='rgba(95,105,75,.6)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(tx,ty,43,turtle.rot,turtle.rot+.55);ctx.stroke();ctx.beginPath();ctx.arc(tx,ty,39,turtle.rot+Math.PI,turtle.rot+Math.PI+.45);ctx.stroke();}
    if(stage==='flight'&&turtle.vy>0&&ground-turtle.y<110&&run.charges>0){ctx.setLineDash([4,5]);ctx.strokeStyle='#98b780';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(tx,gy-3,39,9,0,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);}
    for(const p of particles){ctx.globalAlpha=clamp(p.life,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x-camera,p.y-cameraY,p.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
    ctx.textAlign='center';for(const f of floaters){ctx.globalAlpha=Math.min(1,f.life);ctx.font='bold 20px "Malgun Gothic",sans-serif';ctx.strokeStyle='#fff9e8';ctx.lineWidth=5;ctx.strokeText(f.text,f.x-camera,f.y-cameraY);ctx.fillStyle=f.color;ctx.fillText(f.text,f.x-camera,f.y-cameraY);}ctx.globalAlpha=1;ctx.textAlign='left';
  }
  function frame(time) {
    const dt=Math.min((time-last)/1000||.016,.05);last=time;
    // Small fixed substeps keep collision timing consistent across phone and desktop refresh rates.
    const steps=Math.ceil(dt/.008);for(let i=0;i<steps;i++)update(dt/steps);
    if(time-lastUI>40){updateUI();lastUI=time;}draw();requestAnimationFrame(frame);
  }
  function pauseToggle() {if(stage==='result')return;paused=!paused;$('pauseOverlay').hidden=!paused;$('pauseButton').textContent=paused?'▶':'Ⅱ';}
  for(const id of ['angleButton','powerButton','comboButton','landButton'])$(id).addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();if(!$(id).disabled)action();});
  // Keyboard activation keeps all buttons usable without a pointer.
  for(const id of ['angleButton','powerButton','comboButton','landButton'])$(id).addEventListener('click',e=>{if(e.detail===0&&!$(id).disabled)action();});
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!(e.target instanceof HTMLButtonElement)){e.preventDefault();action();}else if(e.code==='Escape'){if(!$('helpOverlay').hidden){$('helpOverlay').hidden=true;helpPaused=false;}else pauseToggle();}});
  $('pauseButton').onclick=pauseToggle;$('resumeButton').onclick=pauseToggle;$('restartButton').onclick=reset;$('retryButton').onclick=reset;
  $('helpButton').onclick=()=>{helpPaused=true;$('helpOverlay').hidden=false;};$('closeHelpButton').onclick=()=>{helpPaused=false;$('helpOverlay').hidden=true;};
  $('soundButton').onclick=()=>{sound=!sound;$('soundButton').setAttribute('aria-pressed',String(sound));$('soundButton').setAttribute('aria-label',sound?'효과음 끄기':'효과음 켜기');tone(600);};
  for(const [kind,id] of [['launch','Launch'],['shell','Shell']])$('upgrade'+id).onclick=()=>{const cost=80+save[kind]*70;if(stage==='flight'||save[kind]>=5||save.coins<cost)return;save.coins-=cost;save[kind]++;persist();syncSave();say('장비 강화! 다음 여행이 더 기대돼요.',2);tone(900,.16);};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&stage==='flight'&&!paused){paused=true;$('pauseOverlay').hidden=false;$('pauseButton').textContent='▶';}});
  reset();persist();
  Promise.all([bg.decode().catch(()=>null),shell.decode().catch(()=>null)]).then(()=>{$('loading').hidden=true;requestAnimationFrame(frame);});
  // Read-only diagnostics make game state inspectable during QA, without affecting play.
  window.turtleGame = {get state(){return {stage,paused,angle,power,combo,comboLeft,distance:distance(),x:turtle.x,y:turtle.y,vx:turtle.vx,vy:turtle.vy,charges:run.charges,perfect:run.perfect,save:{...save},assetsReady:!!(bg.naturalWidth&&shell.naturalWidth)};}};
})();
