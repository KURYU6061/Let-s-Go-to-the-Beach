'use strict';
(() => {
  const $=id=>document.getElementById(id), map=window.TurtleMap, Flight=window.TurtleFlight;
  const canvas=$('gameCanvas'),ctx=canvas.getContext('2d');
  const images={};for(const [key,file]of Object.entries({regions:'regions-v2.png',devices:'devices-v2.png',groundCritters:'critters-ground-v4.png',airCritters:'critters-air-v4.png',shell:'turtle.png'})){images[key]=new Image();images[key].src='assets/'+file;}
  const resultArtSources={rest:'assets/result-rest-v7.png',clear:'assets/result-beach-v7.png'};
  const resultArtPreloads=Object.values(resultArtSources).map(src=>{const img=new Image();img.src=src;return img;});
  let save={best:0,coins:0,launch:0,shell:0,runs:0,boostReady:false},storage=true;
  try{
    const old=JSON.parse(localStorage.getItem('turtle-bounce-v1')||'null');
    if(old){for(const key of ['best','coins','launch','shell','runs'])if(Number.isFinite(old[key])&&old[key]>=0)save[key]=Math.floor(old[key]);save.boostReady=old.boostReady===true;}
    save.launch=Math.min(5,save.launch);save.shell=Math.min(10,save.shell);
  }catch{storage=false;}
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let W=1280,H=600,stage='angle',flight,front,paused=false,help=false,inspect=false,inspectM=0;
  let elapsed=0,phase=0,angle=45,power=.5,combo=0,comboLeft=3,comboStarted=false;
  let camera=0,cameraY=0,viewX=0,viewY=0,viewTime=0,ambientTime=0,inspectTime=0,particles=[],floaters=[],trail=[],last=0,lastUI=0,hintUntil=0;
  const fx=new window.TurtleEffects({reduced:window.matchMedia('(prefers-reduced-motion: reduce)').matches});
  const soundscape=new window.TurtleAudio();let resultReward=0,animalReactions=new Map(),comboPunch=0;
  document.querySelector('.game').appendChild($('mapBar'));
  function persist(){try{localStorage.setItem('turtle-bounce-v1',JSON.stringify(save));}catch{storage=false;}if(!storage)$('saveNote').textContent='저장이 제한돼 이번 접속 동안 기록이 유지됩니다.';}
  function resize(){W=Math.round(600*$('viewport').clientWidth/$('viewport').clientHeight);canvas.width=W;canvas.height=600;}new ResizeObserver(resize).observe($('viewport'));resize();
  function syncSave(){
    $('best').textContent=save.best.toLocaleString();$('wallet').textContent=(save.coins+(stage==='flight'?flight.coins:0)).toLocaleString();
    for(const [kind,id]of [['launch','Launch'],['shell','Shell']]){const level=save[kind],cost=80+level*70,maxLevel=kind==='shell'?10:5;$(kind+'Level').textContent=(kind==='launch'?'발사·장치 추진력':'마찰 감소')+' · Lv. '+level;$(kind+'Cost').textContent=level>=maxLevel?'최고 단계':cost+' ◎';$('upgrade'+id).disabled=stage==='flight'||level>=maxLevel||save.coins<cost;}
    $('buyBoost').disabled=stage==='flight'||save.boostReady||save.coins<1000;
    $('buyBoost').classList.toggle('is-ready',save.boostReady);
    $('boostDetail').textContent=save.boostReady?'다음 발사에 최고속력 자동 사용':stage==='flight'?'비행 종료 후 다시 구매할 수 있어요':'다음 발사 1회 · 최고속력 출발';
    $('boostCost').textContent=save.boostReady?'준비 완료':stage==='flight'?'비행 중':'1,000 ◎';
  }
  function setStage(next){stage=next;for(const kind of ['angle','power','combo']){$(kind+'Card').classList.toggle('active',stage===kind);$(kind+'Card').classList.toggle('done',['angle','power','combo','flight','result'].indexOf(stage)>['angle','power','combo'].indexOf(kind));$(kind+'Button').disabled=stage!==kind;}$('flightTools').hidden=stage!=='flight';$('deviceStatus').hidden=stage!=='flight';document.querySelector('.game').classList.toggle('is-flying',stage==='flight');document.querySelector('.game').classList.toggle('is-result',stage==='result');$('powerCard').classList.toggle('power-locked',stage==='combo');if(stage==='combo')$('powerCard').style.setProperty('--power-outline',window.TurtleEffects.powerColor(power));syncSave();}
  function say(text,duration=1.8){$('stageHint').textContent=text;$('stageHint').hidden=false;hintUntil=elapsed+duration;$('announcement').textContent=text;}

  function burst(x,y,color,n=14){for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*210,vy:-40-Math.random()*160,life:.45+Math.random()*.45,r:2+Math.random()*3,color});}
  function label(text,x,y,color='#618b75'){floaters.push({text,x,y,color,life:1.7});}
  function reset(){flight=new Flight(save);paused=help=inspect=false;document.querySelector('.game').classList.remove('is-inspecting','game-paused');elapsed=phase=camera=cameraY=ambientTime=inspectTime=0;angle=45;power=.5;combo=0;comboLeft=3;comboStarted=false;particles=[];floaters=[];trail=[];animalReactions.clear();comboPunch=0;fx.reset();for(const id of ['pauseOverlay','resultOverlay','helpOverlay','mapBar'])$(id).hidden=true;$('pauseButton').textContent='Ⅱ';$('comboValue').textContent='×0';$('powerValue').textContent='—';$('powerFill').style.width='0%';$('comboFill').style.width='0%';$('comboTime').textContent='힘을 정하면 시작해요';$('angleButton').innerHTML='각도 결정 <span>SPACE</span>';$('powerButton').innerHTML='힘 결정 <span>SPACE</span>';$('comboButton').innerHTML='연타하기 <span>TAP!</span>';$('comboCaption').textContent='3초 동안 빠르게 탭!';setStage('angle');say('같은 여행길, 이번에는 더 멀리!',3);updateUI();}
  function action(){if(front?.active||paused||help||inspect||!$('loading').hidden)return;soundscape.unlock();
    if(stage==='angle'){setStage('power');phase=0;$('angleButton').innerHTML='각도 확정 <span>✓</span>';say('힘 게이지가 높을 때 멈춰요!',3);fx.angleSet();soundscape.play('angle');}
    else if(stage==='power'){setStage('combo');comboLeft=3;comboStarted=false;$('powerButton').innerHTML='힘 확정 <span>✓</span>';$('comboTime').textContent='첫 탭부터 3초 시작!';say('탭으로 힘을 모은 뒤 장치를 타고 여행해요.',4);fx.powerSet();soundscape.play('power',{power});}
    else if(stage==='combo'){comboStarted=true;combo++;$('comboValue').textContent='×'+combo;soundscape.play('combo',{combo});comboPunch=.13;fx.hit(flight.t.x,flight.t.y,combo);}
    else if(stage==='flight'){if(flight.action())soundscape.play('tap');}
    else if(stage==='result')reset();
  }
  function launch(){
    const boosted=save.boostReady;
    if(!flight.launch(angle,power,combo,{boost:boosted}))return;
    if(boosted){save.boostReady=false;persist();}
    setStage('flight');$('comboButton').innerHTML='발사 완료 <span>✓</span>';$('comboTime').textContent=boosted?'부스터로 최고속력 출발!':'장치와 생명체를 만나 보세요';
    say(boosted?'최고속력 부스터! 바다를 향해 힘껏 출발!':'출발! 장치에 닿으면 자동으로 다시 날아요.',3);fx.launch(flight.t.x,flight.t.y,angle,combo);soundscape.play(window.TurtleEffects.tier(flight.launchSpeed)===4?'maxLaunch':'launch',{combo,boosted});
  }
  function setResultArtwork(clear){
    $('resultOverlay').dataset.outcome=clear?'clear':'rest';
    $('resultArt').src=clear?resultArtSources.clear:resultArtSources.rest;
    $('resultArt').alt=clear?'바닷가 파라솔 아래 선베드에 누워 시원한 음료를 마시는 행복한 거북이':'바닥에 엎드려 아쉬워하며 다음 도전을 기다리는 거북이';
    $('retryButton').textContent=clear?'바다에 한 번 더 놀러 갈까?':'한 번 더 날아볼까?';
  }
  function finish(){if(stage!=='flight')return;ambientTime=flight.time;const d=Math.min(map.end,flight.distance),newBest=d>save.best;if(flight.clear){flight.t.x=map.x(map.end);flight.t.y=map.groundAt(flight.t.x)-flight.t.r;flight.t.vx=flight.t.vy=0;camera=flight.t.x-W*.42;cameraY=0;}resultReward=Math.max(12,Math.floor(d*.18)+flight.coins+flight.deviceHits*4+flight.longestChain*3);save.best=Math.max(save.best,d);save.coins+=resultReward;save.runs++;persist();setResultArtwork(flight.clear);setStage('result');$('resultOverlay').hidden=false;$('resultTag').textContent=flight.clear?'바다에 도착했어요!':newBest?'새로운 최고 기록!':'같은 길, 새로운 여행';$('resultTitle').textContent=flight.clear?'드디어, 푸른 바다!':newBest?'멋진 장치 연결!':'여기까지 잘 날아왔어요';$('resultDistance').textContent=d.toLocaleString();$('resultPerfect').textContent=flight.deviceHits+'번';$('resultAnimals').textContent=flight.animalHits+'번';$('resultCoins').textContent='+'+resultReward+' ◎';$('resultChain').textContent='최장 연결 '+flight.longestChain+'개 · 방문 지역 '+flight.visited.size+'/6';const next=map.regions.find(r=>r.at>d);$('resultDetail').textContent=flight.clear?'파도 소리와 함께 여행을 마쳤어요. 같은 길에서 더 좋은 연결에 도전해요!':next?next.short+'까지 '+(next.at-d)+' m. 다음에는 다른 장치를 노려봐요.':'바다까지 '+Math.max(0,map.end-d)+' m. 조금만 더!';$('stageHint').hidden=true;syncSave();soundscape.play(flight.clear?'clear':'result');}
  function processEvents(){
    for(const e of flight.events){
      if(['device','animal','air','fire'].includes(e.kind)){
        label(e.text,e.x,e.y-48,e.kind==='fire'?'#cd8c55':e.kind==='animal'?'#b28353':'#638e75');
        burst(e.x,e.y,e.kind==='fire'?'#f5ce77':e.kind==='animal'?'#f6dc96':'#b8d6c2',e.kind==='fire'?25:13);
        if(e.kind==='animal')animalReactions.set(e.id,{until:flight.time+.42,direction:e.direction,effect:e.effect});
        say(e.text+(flight.chain>1?' · '+flight.chain+'개 연결!':''),1.8);
        soundscape.play(e.kind,e);
      }else if(e.kind==='ground'){burst(e.x,map.groundAt(e.x),'#d4bb95',7);soundscape.play('ground');}
      else if(e.kind==='coin')soundscape.play('coin');
      else if(e.kind==='tap'){label(e.text,e.x,e.y-35);burst(e.x,e.y,'#d6e8db',6);}
      else if(e.kind==='finish')finish();
    }
    flight.events=[];
  }
  function updateUI(){const d=inspect?inspectM:flight.distance,r=map.regionAt(d),next=map.regions.find(r=>r.at>d);$('distance').textContent=(inspect?inspectM:flight.distance).toLocaleString();$('distanceLabel').textContent=inspect?'지도':'거리';$('speed').textContent=inspect?0:Math.round(Math.hypot(flight.t.vx,flight.t.vy)/map.meter);$('chargeCount').textContent='공중 도움 '+flight.charges+'회';$('landButton').disabled=flight.charges<=0||inspect;$('landButton').innerHTML=flight.capture?'출발<br>탭<span>SPACE</span>':'공중<br>탭<span>SPACE</span>';$('landButton').classList.toggle('ready',!!flight.capture);$('regionName').textContent=r.name;$('nextRegion').textContent=next?'다음: '+next.short+' '+Math.max(0,next.at-d)+' m':'마지막 해안';$('deviceCount').textContent=flight.deviceHits;$('animalCount').textContent=flight.animalHits;$('chainCount').textContent=flight.chain;$('journeyFill').style.width=(clamp(d/map.end,0,1)*100)+'%';$('journeyText').textContent='바다까지 '+Math.max(0,map.end-d).toLocaleString()+' m';$('altitude').textContent=Math.max(0,Math.round((map.groundAt(flight.t.x)-flight.t.y)/map.meter));$('angleValue').textContent=Math.round(angle)+'°';$('angleNeedle').setAttribute('x2',20+140*Math.cos(angle*Math.PI/180));$('angleNeedle').setAttribute('y2',70-140*Math.sin(angle*Math.PI/180));if(stage==='power'){$('powerValue').textContent=Math.round(power*100)+'%';$('powerFill').style.width=power*100+'%';$('powerCaption').textContent=save.boostReady?'부스터가 최고속력을 보장해요':power>.85?'지금! 힘껏 날아요':'게이지가 높을 때 멈춰요';}if(stage==='combo'){$('comboTime').textContent=comboStarted?comboLeft.toFixed(1)+'초 남았어요':'첫 탭부터 3초 시작!';$('comboFill').style.width=(comboStarted?(3-comboLeft)/3*100:0)+'%';}if(stage==='flight')syncSave();if(inspect){$('mapLocation').textContent=r.name+' · '+inspectM+' m';return;}if(elapsed>hintUntil){$('stageHint').hidden=stage!=='flight';if(stage==='flight'){$('stageHint').textContent=flight.capture?(flight.capture.type==='cannon'?'재발사 준비 '+Math.ceil(flight.capture.left)+'…':'펠리컨과 함께 가는 중'):flight.t.rolling?'바닥에서는 금방 느려져요. 가까운 장치를 노려요.':flight.chain>1?flight.chain+'개 장치 연결 중 · 다음 장치를 찾아봐요!':(()=>{const n=map.devices.find(o=>o.x>flight.t.x&&!flight.used.has(o.id));return n?'다음 '+n.name+' · '+Math.ceil((n.x-flight.t.x)/map.meter)+' m 앞':'마지막 해안! 바다까지 조금만 더.';})();}}}
  function update(dt){soundscape.setBlocked(paused||help||document.hidden);if(paused||help)return;comboPunch=Math.max(0,comboPunch-dt);if(inspect){inspectTime+=dt;return;}if(stage!=='flight')ambientTime+=dt;elapsed+=dt;phase+=dt;if(stage==='angle')angle=17+(Math.sin(phase*4.2)+1)*27;else if(stage==='power')power=save.boostReady?1:.16+(Math.sin(phase*5.4)+1)*.42;else if(stage==='combo'&&comboStarted){comboLeft=Math.max(0,comboLeft-dt);if(comboLeft<=0)launch();}else if(stage==='flight'){flight.step(dt);processEvents();const t=flight.t;camera+=(Math.max(0,t.x-W*.3)-camera)*Math.min(1,dt*5);cameraY+=(Math.min(0,t.y-190)-cameraY)*Math.min(1,dt*8);cameraY=Math.min(0,clamp(cameraY,t.y-(H-140),t.y-140));trail.push({x:t.x,y:t.y});if(trail.length>40)trail.shift();}fx.update(dt,{stage,t:flight.t,combo,capture:!!flight.capture});for(const p of particles){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=160*dt;}particles=particles.filter(p=>p.life>0);for(const f of floaters){f.life-=dt;f.y-=26*dt;}floaters=floaters.filter(f=>f.life>0);}
  const deviceRects=[[0,.12,.284,.225],[.287,.04,.219,.319],[.518,.036,.23,.323],[.768,0,.232,.367],[0,.54,.285,.145],[.287,.445,.282,.25],[.552,.375,.237,.312],[.801,.376,.199,.317],[0,.75,.309,.25],[.324,.689,.224,.311],[.534,.725,.263,.275],[.803,.73,.197,.27]];
  function sprite(img,rect,x,y,w,h,flip=1){if(!img.complete||!img.naturalWidth)return;ctx.save();ctx.translate(x,y);ctx.scale(flip,1);ctx.drawImage(img,rect[0]*img.naturalWidth,rect[1]*img.naturalHeight,rect[2]*img.naturalWidth,rect[3]*img.naturalHeight,-w/2,-h/2,w,h);ctx.restore();}
  function rr(x,y,w,h,r,fill,stroke='#847354',line=1.5){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}}
  function line(points,color,width=2){ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(...p):ctx.moveTo(...p));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();}
  const sceneryCache=new Map();
  function scenery(r){
    if(sceneryCache.has(r.index))return sceneryCache.get(r.index);
    const img=images.regions,c=document.createElement('canvas');
    c.width=Math.round(img.naturalWidth/2);c.height=Math.round(img.naturalHeight/3);
    const sc=c.getContext('2d');
    sc.drawImage(img,(r.index%2)*img.naturalWidth/2,Math.floor(r.index/2)*img.naturalHeight/3,img.naturalWidth/2,img.naturalHeight/3,0,0,c.width,c.height);
    // Feather the painted sky edge into an unbounded sky rather than stacking crops.
    sc.globalCompositeOperation='destination-in';const fade=sc.createLinearGradient(0,0,0,c.height*.19);
    fade.addColorStop(0,'rgba(0,0,0,0)');fade.addColorStop(1,'rgba(0,0,0,1)');sc.fillStyle=fade;sc.fillRect(0,0,c.width,c.height);
    sceneryCache.set(r.index,c);return c;
  }
  function drawSky(){
    const gradient=ctx.createLinearGradient(0,-2600-viewY,0,180-viewY);
    gradient.addColorStop(0,'#407daf');gradient.addColorStop(.48,'#79b5db');gradient.addColorStop(.85,'#a5d4ee');gradient.addColorStop(1,'#b6dfee');
    ctx.fillStyle=gradient;ctx.fillRect(0,0,W,H);
    // Soft, fixed world cloud positions stay continuous at every altitude.
    for(let row=Math.floor((viewY-160)/350);row<(viewY+H+160)/350;row++){
      for(let col=Math.floor(viewX*.28/520)-1;col<(viewX*.28+W)/520+2;col++){
        const wx=col*520+Math.sin(row+col*1.7)*115,wy=row*350-130+Math.sin(col*1.4)*43;
        if(wy>100)continue;
        const x=wx-viewX*.28,y=wy-viewY;
        ctx.save();ctx.globalAlpha=.5;
        for(let j=0;j<5;j++){
          const px=x+j*32,py=y-Math.sin(j*.8)*15,rx=45+j%2*10,ry=18+j%3*5;
          ctx.save();ctx.translate(px,py);ctx.scale(rx,ry);const mist=ctx.createRadialGradient(0,0,.08,0,0,1);
          mist.addColorStop(0,'rgba(255,252,241,.9)');mist.addColorStop(.68,'rgba(255,252,241,.6)');mist.addColorStop(1,'rgba(255,252,241,0)');
          ctx.fillStyle=mist;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();
        }
        ctx.restore();
      }
    }
  }
  function background(r,alpha=1){
    if(!images.regions.naturalWidth)return;
    const img=scenery(r),tileW=Math.max(W,1280),offset=(viewX-map.x(r.at))*.14,first=Math.floor(offset/tileW);
    ctx.globalAlpha=alpha;
    for(let i=first;i<=first+1;i++){
      ctx.save();ctx.translate(i*tileW-offset,-viewY);
      if(Math.abs(i)%2){ctx.translate(tileW,0);ctx.scale(-1,1);}
      ctx.drawImage(img,0,0,tileW,H);ctx.restore();
    }
    ctx.globalAlpha=1;
  }
  function foreground(){const r=map.regionAt((viewX+W*.4-map.origin)/map.meter),g=r.ground;ctx.beginPath();ctx.moveTo(0,H);for(let px=0;px<=W+20;px+=20)ctx.lineTo(px,map.groundAt(viewX+px)-viewY+4);ctx.lineTo(W,H);ctx.closePath();ctx.fillStyle=g;ctx.globalAlpha=.4;ctx.fill();ctx.globalAlpha=1;for(let k=Math.floor(viewX/105);k<(viewX+W)/105+1;k++){const x=k*105-viewX,y=map.groundAt(k*105)-viewY;if(y>H+60||y<-80)continue;ctx.fillStyle='#9f9978';ctx.globalAlpha=.45;ctx.beginPath();ctx.ellipse(x+23,y+16,4,1.5,.2,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;if(k%3===0){for(let j=0;j<3;j++){line([[x+j*7,y+42],[x+j*7-4,y+25]],'#789464',2);ctx.beginPath();ctx.arc(x+j*7-4,y+25,4,0,Math.PI*2);ctx.fillStyle=j%2?'#f2db9e':'#e8bd9c';ctx.fill();}}if(r.index===1&&k%2===0)rr(x,y+24,38,4,1,'#eee9d5',null);if(r.index===2)line([[x,y+10],[x+20,y+8],[x+24,y+22]],'#b39f87',1);}
    for(let k=Math.floor(viewX/620);k<(viewX+W)/620+1;k++){const x=k*620+420-viewX,y=map.groundAt(k*620+420)-viewY,ri=map.regionAt((k*620+420-map.origin)/8).index;if(x<-120||x>W+120||y>H+200)continue;if(ri===2){rr(x-3,y-165,6,165,3,'#8b8a72');rr(x-16,y-174,32,22,6,'#f4e5bd');ctx.beginPath();ctx.arc(x,y-171,19,0,Math.PI*2);ctx.strokeStyle='rgba(243,227,179,.4)';ctx.lineWidth=12;ctx.stroke();}else if(ri===3||ri===4){rr(x-42,y-65,84,65,4,'#b8bca4');line([[x-30,y-53],[x+30,y-53],[x+30,y-10]],'#7e9085',6);for(let j=0;j<3;j++)rr(x-27+j*20,y-40,12,14,2,'#e4d9b6');}else if(ri===5){rr(x-50,y-5,100,9,3,'#aa8a65');rr(x-34,y-28,7,31,2,'#b69365');rr(x+29,y-28,7,31,2,'#b69365');}else{rr(x-48,y-28,96,8,3,'#bca279');rr(x-40,y-19,6,22,2,'#947b59');rr(x+34,y-19,6,22,2,'#947b59');}}
  }
  function jet(d,type,base){const x=d.x-viewX,y=base-viewY,used=!inspect&&flight.used.has(d.id),active=type!=='steam'||((viewTime+d.m*.007)%4.2)<1.8;const height=type==='water'?290:type==='steam'?300:type==='fan'?330:205;ctx.save();ctx.globalAlpha=used?.18:active?.45:.1;
    if(type==='water'){for(let j=0;j<4;j++){ctx.beginPath();ctx.moveTo(x+35+j*5,y-87);ctx.bezierCurveTo(x+75,y-180,x-40+j*16,y-height,x+12+j*10,y-height+20);ctx.strokeStyle=j%2?'#d8f0ea':'#6aacc1';ctx.lineWidth=4-j*.6;ctx.stroke();}for(let j=0;j<9;j++){const a=(viewTime*90+j*39)%height;ctx.fillStyle='#d5eff2';ctx.beginPath();ctx.ellipse(x+18+Math.sin(j+viewTime)*30,y-92-a,3,7,-.25,0,Math.PI*2);ctx.fill();}}
    else if(type==='steam'){for(let j=0;j<6;j++){const a=(viewTime*65+j*57)%height;ctx.fillStyle='#fffaf0';ctx.beginPath();ctx.ellipse(x+Math.sin(j+viewTime*.7)*25,y-105-a,22+a*.035,19+a*.05,0,0,Math.PI*2);ctx.fill();}}
    else {for(let j=0;j<7;j++){const a=(viewTime*100+j*60)%height;ctx.beginPath();ctx.ellipse(type==='blower'?x+35+a*.65:x+Math.sin(j)*25,y-100-(type==='blower'?a*.36:a),24,8,.3,0,Math.PI*1.5);ctx.strokeStyle='#eef5e0';ctx.lineWidth=3;ctx.stroke();}}
    ctx.restore();if(inspect){ctx.setLineDash([5,7]);ctx.strokeStyle='rgba(90,143,146,.35)';ctx.strokeRect(type==='blower'?x-25:x-(type==='water'?45:type==='steam'?48:65),y-height,type==='blower'?205:type==='water'?90:type==='steam'?96:130,height-35);ctx.setLineDash([]);}
  }
  function drawDevice(d){const x=d.x-viewX,base=map.groundAt(d.x)-d.lift,y=base-viewY;if(x<-250||x>W+300||y<-170||y>H+520)return;const used=!inspect&&flight.used.has(d.id);if(d.lift){rr(x-d.w*.52,y,d.w*1.04,d.lift,4,'#c4ac8c');for(let i=0;i<d.lift;i+=22)line([[x-d.w*.5,y+i],[x+d.w*.5,y+i]],'#a68f75',1);rr(x-d.w*.55,y-4,d.w*1.1,8,3,'#d8c59f');}
    if(['water','steam','fan','blower'].includes(d.type))jet(d,d.type,base);
    const bob=used?Math.sin(viewTime*7)*1.5:Math.sin(viewTime*2+d.m)*1;
    const sy=y-d.h*.5+bob;sprite(images.devices,deviceRects[d.sprite],x,sy,d.w,d.h);
    if(d.type==='fan'){ctx.save();ctx.translate(x,y-d.h*.67);ctx.rotate(viewTime*7);for(let i=0;i<3;i++){ctx.rotate(Math.PI*2/3);ctx.beginPath();ctx.ellipse(0,-20,5,16,0,0,Math.PI*2);ctx.fillStyle='rgba(227,239,221,.37)';ctx.fill();}ctx.restore();}
    if(d.type==='conveyor'){for(let j=0;j<8;j++){const xx=x-d.w*.4+((j*20+viewTime*40)% (d.w*.8));ctx.beginPath();ctx.moveTo(xx,y-55);ctx.lineTo(xx+8,y-52);ctx.strokeStyle='#eadbb1';ctx.lineWidth=2;ctx.stroke();}}
    if(d.type==='seesaw'||d.type==='flower'){ctx.beginPath();ctx.arc(x,y-d.h-12,4,0,Math.PI*2);ctx.fillStyle='#edce85';ctx.fill();}
    if(used){ctx.globalAlpha=.8;ctx.fillStyle='#fff8de';ctx.font='bold 16px sans-serif';ctx.textAlign='center';ctx.fillText('✓',x,y-d.h-7);ctx.textAlign='left';ctx.globalAlpha=1;}
    if(inspect){const text=d.name;ctx.font='11px "Malgun Gothic",sans-serif';const w=ctx.measureText(text).width+16;rr(x-w/2,y+11,w,23,7,'rgba(255,249,230,.93)','#b7aa8c',1);ctx.fillStyle='#736955';ctx.textAlign='center';ctx.fillText(text,x,y+27);ctx.textAlign='left';}
    if(flight.capture?.type==='cannon'&&flight.capture.device.id===d.id&&!inspect){ctx.fillStyle='#fcf2ce';ctx.strokeStyle='#89704b';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y-d.h-20,23,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#91784b';ctx.font='bold 21px sans-serif';ctx.textAlign='center';ctx.fillText(Math.ceil(flight.capture.left),x,y-d.h-13);ctx.textAlign='left';}
  }
  // Measured cutouts avoid neighboring poses bleeding across generated grid cells.
  const animalArt=[
    [[20,21,313,292],[365,31,657,291],[689,20,1001,295],[1027,22,1363,283]],
    [[13,319,319,555],[355,318,668,554],[702,322,1012,555],[1049,320,1356,554]],
    [[18,576,325,846],[356,576,657,844],[700,576,1001,845],[1037,577,1342,845]],
    [[38,887,293,1106],[386,891,628,1106],[676,883,985,1090],[1016,887,1354,1094]],
    [[29,15,351,305],[378,77,693,300],[727,145,1046,305],[1072,67,1387,299]],
    [[46,304,360,562],[381,342,717,561],[732,431,1077,576],[1117,321,1400,561]],
    [[54,579,339,828],[405,594,688,830],[754,633,1040,827],[1126,588,1374,831]],
    [[36,836,338,1087],[392,876,695,1084],[731,924,1045,1109],[1095,836,1385,1081]]
  ];
  const airBodyAnchors=[
    [[228,234],[574,230],[923,228],[1268,221]],
    [[223,506],[577,505],[924,505],[1285,499]],
    [[192,749],[543,761],[920,755],[1228,755]],
    [[184,1010],[537,1009],[881,1009],[1222,1009]]
  ];
  function animalSprite(c,time,x,y,w,h,facing,reaction=0){
    const frame=reaction>0?(c.air?2:3):map.animalFrame(c,time),rect=animalArt[c.sprite][frame];
    const img=c.air?images.airCritters:images.groundCritters;
    if(!img.naturalWidth)return;
    const scale=w/340;
    const anchor=c.air?airBodyAnchors[c.sprite-4][frame]:[(rect[0]+rect[2])/2,rect[3]-26/scale];
    ctx.save();ctx.translate(x,y);ctx.scale(facing*(1+reaction*.14),1+reaction*.1);ctx.rotate(reaction*.08);
    ctx.drawImage(img,rect[0],rect[1],rect[2]-rect[0],rect[3]-rect[1],
      (rect[0]-anchor[0])*scale,(rect[1]-anchor[1])*scale,(rect[2]-rect[0])*scale,(rect[3]-rect[1])*scale);
    ctx.restore();
  }
  function drawAnimal(c){
    if(!inspect&&flight.capture?.type==='pelican'&&flight.capture.device.id===c.id)return;
    const p=map.animalPosition(c,viewTime),x=p.x-viewX,y=p.y-viewY;
    if(x<-130||x>W+130||y<-130||y>H+130)return;
    const used=!inspect&&flight.used.has(c.id);
    const w=c.air?c.sprite===7?108:81:64,h=c.air?w*.81:57;
    const reaction=inspect?null:animalReactions.get(c.id);
    const pulse=reaction?Math.sin(Math.PI*clamp((reaction.until-viewTime)/.42,0,1)):0;
    animalSprite(c,viewTime,x,y,w,h,p.facing,pulse);
    if(pulse>0){ctx.beginPath();ctx.ellipse(x,y,38+(1-pulse)*17,25+(1-pulse)*9,0,0,Math.PI*2);ctx.strokeStyle='rgba(233,174,65,'+pulse*.65+')';ctx.lineWidth=2;ctx.stroke();}
    if(reaction&&viewTime>reaction.until)animalReactions.delete(c.id);
    if(used||c.featured){ctx.font='13px sans-serif';ctx.fillStyle=used?'#c5bda3':'#d7a841';ctx.fillText(used?'✓':'✦',x+20,y-22);}
    if(inspect&&c.interactive){ctx.fillStyle='rgba(255,248,228,.9)';ctx.font='10px sans-serif';ctx.textAlign='center';ctx.fillText(map.animalProfiles[c.sprite].name+(c.featured?' · 큰 도움 ✦':' · 통통 도움'),x,y+35);ctx.textAlign='left';}
  }
  function drawAir(a){const x=a.x-viewX,y=map.groundAt(a.x)-a.height-viewY;if(x<-160||x>W+160||y<-140||y>H+150)return;const used=!inspect&&flight.used.has(a.id);ctx.save();ctx.globalAlpha=used?.35:.8;
    if(a.type==='thermal'){for(let j=0;j<4;j++){const yy=y+75-((viewTime*60+j*35)%145);ctx.beginPath();ctx.ellipse(x,yy,35+j*5,9,0,0,Math.PI*1.8);ctx.strokeStyle='#d1e8dc';ctx.lineWidth=3;ctx.stroke();}for(let j=0;j<3;j++){ctx.beginPath();ctx.ellipse(x-45+j*35,y+70,40,12,0,0,Math.PI*2);ctx.fillStyle='#f8f5e9';ctx.fill();}}
    else{const yy=y+Math.sin(viewTime*1.8+a.phase)*6;rr(x-27,yy-10,54,29,8,'#dec29a');for(let j=0;j<3;j++){line([[x-19+j*19,yy],[x-34+j*34,yy-80]],'#a9a68b',1);ctx.beginPath();ctx.ellipse(x-34+j*34,yy-95-j%2*9,24,32,.08,0,Math.PI*2);ctx.fillStyle=['#deaba0','#edcf95','#9fbeb6'][j];ctx.fill();ctx.strokeStyle='#927e64';ctx.lineWidth=1.5;ctx.stroke();}line([[x-24,yy+7],[x+24,yy+7]],'#a58b65',2);}
    ctx.restore();if(inspect){ctx.font='11px sans-serif';ctx.fillStyle='#6e927f';ctx.textAlign='center';ctx.fillText(a.type==='thermal'?'상승 기류':'풍선 반동 부표',x,y+95);ctx.textAlign='left';}
  }
  function drawLandmarks(){for(const l of map.landmarks){const x=l.x-viewX,y=map.groundAt(l.x)-viewY;if(x<-180||x>W+180||y>H+130)continue;rr(x-3,y-125,7,125,2,'#b59971');ctx.font='bold 11px "Malgun Gothic",sans-serif';const w=ctx.measureText(l.text).width+24;rr(x-w/2,y-136,w,35,5,'#eedab1');ctx.fillStyle='#7d694c';ctx.textAlign='center';ctx.fillText(l.text,x,y-114);ctx.textAlign='left';}}
  function drawLauncher(){const x=100-viewX,y=map.groundAt(180)-viewY;if(x<-200||x>W+200)return;rr(x-30,y-12,160,12,5,'#ab885e');rr(x-10,y-67,12,61,4,'#b5946b');rr(x+111,y-90,12,83,4,'#b5946b');for(let i=0;i<2;i++)line([[x+30+i*45,y-16],[x+20+i*45,y-28],[x+42+i*45,y-40],[x+22+i*45,y-50]],'#7b7c61',3);line([[x-25,y-4],[x+115,y-92]],'#987344',13);line([[x-25,y-4],[x+115,y-92]],'#d1aa76',7);line([[x-6,y-64],[x+50,y-56],[x+120,y-87]],'#f5e9cc',13);line([[x-6,y-64],[x+22,y-60]],'#dd9e88',12);line([[x+52,y-59],[x+80,y-70]],'#dd9e88',12);}
  function drawCoins(){for(const c of map.coins){if(!inspect&&flight.collected.has(c.id))continue;const x=c.x-viewX,y=map.groundAt(c.x)-c.height-viewY;if(x<-20||x>W+20||y<-20||y>H+20)continue;ctx.beginPath();ctx.ellipse(x,y,6+Math.abs(Math.cos(viewTime*2+c.x)) *2,9,0,0,Math.PI*2);ctx.fillStyle='#efd581';ctx.fill();ctx.strokeStyle='#bfa064';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#bc9d56';ctx.font='11px sans-serif';ctx.textAlign='center';ctx.fillText('·',x,y+3);ctx.textAlign='left';}}
  function drawTurtle(){if(inspect)return;const t=flight.t,kick=stage==='combo'?fx.kick():{x:0,y:0},x=t.x-viewX+kick.x,y=t.y-viewY+kick.y;if(!flight.capture||flight.capture.type!=='cannon'){ctx.globalAlpha=.2;ctx.beginPath();ctx.ellipse(x,map.groundAt(t.x)-viewY+2,25,5,0,0,Math.PI*2);ctx.fillStyle='#7e805e';ctx.fill();ctx.globalAlpha=1;ctx.save();ctx.translate(x,y);ctx.rotate(stage==='flight'?t.rot+fx.launchSpin:stage==='combo'?-.2+fx.spin:-.2);const punch=Math.sin(comboPunch/.13*Math.PI)*.11;ctx.scale(1+t.squash+punch,1-t.squash*.5-punch*.6);ctx.drawImage(images.shell,-37,-32,74,64);ctx.restore();}if(flight.capture?.type==='pelican'){animalSprite(flight.capture.device,viewTime,x+18,y-44,126,102,flight.capture.direction||1);}if(stage==='flight'&&!t.rolling&&!flight.capture){ctx.strokeStyle='rgba(94,106,75,.5)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,42,t.rot,t.rot+.55);ctx.stroke();ctx.beginPath();ctx.arc(x,y,40,t.rot+Math.PI,t.rot+Math.PI+.45);ctx.stroke();}if(stage==='result'){ctx.beginPath();ctx.ellipse(x+25,y+3,15,12,.2,0,Math.PI*2);ctx.fillStyle='#adc286';ctx.fill();ctx.strokeStyle='#65724f';ctx.lineWidth=2;ctx.stroke();ctx.beginPath();ctx.arc(x+32,y,2,0,Math.PI*2);ctx.fillStyle='#4e5d42';ctx.fill();}}
  function draw(){viewX=inspect?Math.max(0,map.x(inspectM)-W*.28):camera;viewY=inspect?0:cameraY;viewTime=inspect?inspectTime:stage==='flight'?flight.time:ambientTime;ctx.clearRect(0,0,W,H);ctx.fillStyle='#b8ddeb';ctx.fillRect(0,0,W,H);const distance=(viewX+W*.3-map.origin)/map.meter,r=map.regionAt(Math.max(0,distance));drawSky();background(r);if(r.index>0&&distance-r.at<65){const a=clamp((distance-r.at)/65,0,1);background(map.regions[r.index-1],1-a);}foreground();drawLandmarks();for(const a of map.air)drawAir(a);for(const d of map.devices)drawDevice(d);for(const c of map.critters)drawAnimal(c);drawCoins();if(viewX<350)drawLauncher();
    if(!inspect&&['angle','power','combo'].includes(stage)){const rad=angle*Math.PI/180;ctx.setLineDash([4,10]);ctx.beginPath();for(let t=0;t<2.4;t+=.07){const x=flight.t.x+650*Math.cos(rad)*t,y=flight.t.y-650*Math.sin(rad)*t+137.5*t*t;if(!t)ctx.moveTo(x-viewX,y-viewY);else ctx.lineTo(x-viewX,y-viewY);if(y>map.groundAt(x)-20)break;}ctx.strokeStyle='rgba(100,125,104,.6)';ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);}
    if(!inspect&&stage==='flight'&&trail.length>3){ctx.beginPath();trail.forEach((p,i)=>i?ctx.lineTo(p.x-viewX,p.y-viewY):ctx.moveTo(p.x-viewX,p.y-viewY));ctx.strokeStyle='rgba(255,250,226,.5)';ctx.lineWidth=3;ctx.stroke();}if(!inspect)fx.drawBack(ctx,{stage,t:flight.t,viewX,viewY,capture:!!flight.capture,shell:images.shell});drawTurtle();if(!inspect){fx.drawFront(ctx,{stage,t:flight.t,viewX,viewY,angle,power});for(const p of particles){ctx.globalAlpha=clamp(p.life,0,1);ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x-viewX,p.y-viewY,p.r,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;ctx.textAlign='center';for(const f of floaters){ctx.globalAlpha=Math.min(1,f.life);ctx.font='bold 19px "Malgun Gothic",sans-serif';ctx.strokeStyle='#fff8e9';ctx.lineWidth=5;ctx.strokeText(f.text,f.x-viewX,f.y-viewY);ctx.fillStyle=f.color;ctx.fillText(f.text,f.x-viewX,f.y-viewY);}ctx.globalAlpha=1;ctx.textAlign='left';}
    if(inspect){ctx.fillStyle='rgba(255,250,236,.91)';ctx.font='bold 13px "Malgun Gothic",sans-serif';ctx.fillText('고정 맵 · '+r.description,20,H-20);}else if(stage==='flight'&&flight.t.y<map.groundAt(flight.t.x)-600){ctx.fillStyle='rgba(255,251,235,.9)';ctx.font='12px "Malgun Gothic",sans-serif';ctx.fillText('↓ 지면까지 '+Math.round((map.groundAt(flight.t.x)-flight.t.y)/8)+' m',W*.48,H-25);}
  }
  function frame(time){const dt=Math.min((time-last)/1000||.016,.05);last=time;if(front?.active){soundscape.setBlocked(paused||help||document.hidden);requestAnimationFrame(frame);return;}const n=Math.ceil(dt/.008);for(let i=0;i<n;i++)update(dt/n);if(time-lastUI>45){updateUI();lastUI=time;}draw();requestAnimationFrame(frame);}
  function pauseToggle(){
    if(stage==='result'||inspect)return;
    paused=!paused;soundscape.setBlocked(paused||help||document.hidden);$('pauseOverlay').hidden=!paused;
    $('pauseButton').textContent=$('frontPauseButton').textContent=paused?'▶':'Ⅱ';
    document.querySelector('.game').classList.toggle('game-paused',paused);
    $('restartButton').hidden=!!front?.active;syncAudioSettings();
  }
  for(const id of ['angleButton','powerButton','comboButton','landButton']){$(id).addEventListener('pointerdown',e=>{if(e.button!==undefined&&e.button!==0)return;e.preventDefault();if(!$(id).disabled)action();});$(id).addEventListener('click',e=>{if(e.detail===0&&!$(id).disabled)action();});}
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.repeat&&!(e.target instanceof HTMLButtonElement)&&!(e.target instanceof HTMLInputElement)){e.preventDefault();action();}else if(e.code==='Escape'){if(inspect)closeMap();else if(help){help=false;soundscape.setBlocked(paused||document.hidden);$('helpOverlay').hidden=true;}else pauseToggle();}});
  $('frontPauseButton').onclick=pauseToggle;$('pauseButton').onclick=pauseToggle;$('resumeButton').onclick=pauseToggle;$('restartButton').onclick=reset;$('retryButton').onclick=reset;$('helpButton').onclick=()=>{help=true;soundscape.setBlocked(true);$('helpOverlay').hidden=false;};$('closeHelpButton').onclick=()=>{help=false;soundscape.setBlocked(paused||document.hidden);$('helpOverlay').hidden=true;};$('soundButton').onclick=()=>{soundscape.unlock();soundscape.setEffects(!soundscape.effects);syncAudioUI();};
  $('musicButton').onclick=()=>{soundscape.unlock();soundscape.setMusic(!soundscape.music);syncAudioUI();};
  function syncAudioUI(){
    for(const [id,enabled,label]of [['musicButton',soundscape.music,'배경음악'],['soundButton',soundscape.effects,'효과음']]){
      $(id).setAttribute('aria-pressed',String(enabled));$(id).setAttribute('aria-label',label+(enabled?' 끄기':' 켜기'));$(id).title=label+(enabled?' 켜짐':' 꺼짐');
    }
    $('soundButton').textContent=soundscape.effects?'🔊':'🔇';syncAudioSettings();
  };
  const lastVolumes={...soundscape.volumes};
  function syncAudioSettings(){
    for(const [kind,id]of [['master','Master'],['bgm','Bgm'],['se','Se']]){
      const value=Math.round(soundscape.volumes[kind]*100),enabled=value>0&&(kind==='bgm'?soundscape.music:kind==='se'?soundscape.effects:true);
      $('volume'+id).value=value;$('value'+id).textContent=value+'%';
      $('mute'+id).setAttribute('aria-pressed',String(enabled));$('mute'+id).setAttribute('aria-label',(kind==='master'?'전체':kind==='bgm'?'배경음악':'효과음')+(enabled?' 음소거':' 음소거 해제'));
    }
  }
  function applyAudioVolume(kind,value){soundscape.setVolume(kind,value);if(kind==='bgm')soundscape.setMusic(value>0);if(kind==='se')soundscape.setEffects(value>0);syncAudioUI();}
  for(const [kind,id]of [['master','Master'],['bgm','Bgm'],['se','Se']]){
    $('volume'+id).oninput=e=>{const value=Number(e.target.value)/100;if(value>0)lastVolumes[kind]=value;applyAudioVolume(kind,value);};
    $('mute'+id).onclick=()=>{const current=soundscape.volumes[kind],enabled=current>0&&(kind==='bgm'?soundscape.music:kind==='se'?soundscape.effects:true);if(current>0)lastVolumes[kind]=current;applyAudioVolume(kind,enabled?0:lastVolumes[kind]||1);};
  }
  for(const [kind,id]of [['launch','Launch'],['shell','Shell']])$('upgrade'+id).onclick=()=>{const cost=80+save[kind]*70,maxLevel=kind==='shell'?10:5;if(stage==='flight'||save[kind]>=maxLevel||save.coins<cost)return;save.coins-=cost;save[kind]++;flight.upgrades=save;persist();syncSave();say('강화 완료! 같은 길에서 새로운 궤도를 찾아봐요.',2);soundscape.unlock();soundscape.play('upgrade');};
  $('buyBoost').onclick=()=>{
    if(stage==='flight'||save.boostReady||save.coins<1000)return;
    save.coins-=1000;save.boostReady=true;if(stage==='power')power=1;persist();syncSave();updateUI();
    say('부스터 준비 완료! 다음 발사는 최고속력으로 출발해요.',3);soundscape.unlock();soundscape.play('upgrade');
  };
  function openMap(){inspect=true;document.querySelector('.game').classList.add('is-inspecting');inspectM=flight.distance;$('mapRange').value=inspectM;$('mapBar').hidden=false;$('stageHint').hidden=true;$('flightTools').hidden=true;$('deviceStatus').hidden=true;$('resultOverlay').hidden=true;$('pauseOverlay').hidden=true;updateUI();}
  function closeMap(){inspect=false;document.querySelector('.game').classList.remove('is-inspecting');$('mapBar').hidden=true;$('resultOverlay').hidden=stage!=='result';$('pauseOverlay').hidden=!paused;$('flightTools').hidden=stage!=='flight';$('deviceStatus').hidden=stage!=='flight';updateUI();}
  $('mapButton').onclick=openMap;$('closeMapButton').onclick=closeMap;$('mapRange').oninput=e=>{inspectM=Number(e.target.value);updateUI();};for(const button of document.querySelectorAll('[data-region]'))button.onclick=()=>{inspectM=Number(button.dataset.region);$('mapRange').value=inspectM;updateUI();};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&stage==='flight'&&!paused){paused=true;$('pauseOverlay').hidden=false;$('pauseButton').textContent='▶';}soundscape.setBlocked(document.hidden||paused||help);});
  document.addEventListener('pointerdown',()=>soundscape.unlock(),{capture:true});
  document.addEventListener('keydown',()=>soundscape.unlock(),{capture:true});
  front=new window.BeachIntro({onEnter:()=>{reset();},onCue:(kind,data)=>soundscape.play(kind,data),isPaused:()=>paused||help});
  syncAudioSettings();syncAudioUI();reset();persist();Promise.all(Object.values(images).map(img=>img.decode().catch(()=>null))).then(()=>{$('loading').hidden=true;requestAnimationFrame(frame);});
  window.turtleGame={get state(){return {stage,paused,inspect,angle,power,combo,comboLeft,distance:flight.distance,...flight.t,charges:flight.charges,launchBoosted:flight.launchBoosted,launchSpeed:flight.launchSpeed,animalHits:flight.animalHits,audio:soundscape.state,effects:fx.state,skyCameraY:cameraY,deviceHits:flight.deviceHits,chain:flight.chain,mapTime:flight.time,capture:flight.capture?.type,save:{...save},front:front?.state,assetsReady:Object.values(images).every(img=>img.naturalWidth),screenX:flight.t.x-camera,screenY:flight.t.y-cameraY,mapVersion:map.version,animalTime:viewTime,animationFrames:4,deviceCount:map.devices.length,creatureCount:map.critters.length};}};
})();
