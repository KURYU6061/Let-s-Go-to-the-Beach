(function(root){
  'use strict';
  const meter=8, origin=180, end=12000;
  const x=m=>origin+m*meter;
  const regions=[
    {name:'햇살 마을',short:'마을',at:0,end:250,index:0,color:'#8ea66f',ground:'#dcc79b',description:'천막과 봄꽃, 토끼가 사는 여행의 출발점'},
    {name:'바람 도로',short:'도로',at:250,end:650,index:1,color:'#92a1a4',ground:'#bebeb1',description:'경사판과 바람 장치로 속력을 이어가는 길'},
    {name:'지붕 도시',short:'도시',at:650,end:1150,index:2,color:'#c79e7d',ground:'#d1b998',description:'카페 차양과 옥상 사이를 넘나드는 도시'},
    {name:'통통 공장',short:'공장',at:1150,end:1750,index:3,color:'#a9997b',ground:'#c6bba4',description:'컨베이어와 재발사 장치가 연결된 공장'},
    {name:'증기 발전소',short:'발전소',at:1750,end:2200,index:4,color:'#86a6a5',ground:'#b8c6b3',description:'수압과 상승 기류로 크게 솟구치는 구간'},
    {name:'푸른 바다',short:'바다',at:2200,end:2400,index:5,color:'#79b5c5',ground:'#e5d3a3',description:'갈매기와 부표가 안내하는 마지막 해안'}
  ];
  const types={
    trampoline:{name:'통통 트램펄린',sprite:0,w:155,h:77,surface:55,kind:'surface'},
    water:{name:'수압 분수관',sprite:1,w:115,h:131,kind:'water'},
    cannon:{name:'별빛 재발사대',sprite:2,w:150,h:138,kind:'capture'},
    fan:{name:'상승 바람 선풍기',sprite:3,w:122,h:155,kind:'fan'},
    conveyor:{name:'가속 컨베이어',sprite:4,w:173,h:69,surface:51,kind:'surface'},
    awning:{name:'카페 반동 차양',sprite:5,w:178,h:145,surface:135,kind:'surface'},
    steam:{name:'증기 솟음관',sprite:6,w:118,h:132,kind:'steam'},
    flower:{name:'스프링 꽃',sprite:7,w:105,h:125,surface:105,kind:'surface'},
    seesaw:{name:'통통 시소',sprite:8,w:176,h:102,surface:63,kind:'surface'},
    blower:{name:'고속 바람 송풍기',sprite:9,w:137,h:150,kind:'blower'},
    ramp:{name:'슝 경사판',sprite:10,w:174,h:115,surface:35,kind:'surface'},
    buoy:{name:'바다 반동 부표',sprite:11,w:115,h:117,surface:75,kind:'surface'}
  };
  // Explicit authored placements. Replays reset state; they never create a new layout.
  const layouts=[
    [[35,'flower'],[57,'trampoline'],[83,'water'],[110,'seesaw'],[139,'awning'],[168,'cannon'],[199,'trampoline'],[227,'fan']],
    [[263,'ramp'],[294,'fan'],[325,'trampoline'],[357,'water'],[392,'ramp'],[426,'cannon'],[460,'blower'],[496,'seesaw'],[529,'trampoline'],[564,'fan'],[600,'ramp'],[630,'water']],
    [[670,'awning',38],[699,'flower'],[735,'cannon',80],[768,'awning',110],[803,'fan'],[834,'water'],[868,'awning',65],[902,'ramp'],[937,'cannon'],[971,'awning',95],[1005,'fan'],[1039,'seesaw'],[1074,'awning',45],[1110,'water']],
    [[1167,'conveyor'],[1198,'cannon'],[1231,'steam'],[1264,'conveyor'],[1297,'blower'],[1330,'trampoline'],[1365,'water'],[1400,'cannon'],[1435,'conveyor'],[1470,'steam'],[1505,'ramp'],[1540,'blower'],[1576,'cannon'],[1611,'conveyor'],[1646,'steam'],[1681,'water'],[1715,'fan']],
    [[1770,'water'],[1802,'steam'],[1835,'blower'],[1869,'cannon'],[1903,'fan'],[1938,'water'],[1973,'steam'],[2008,'cannon'],[2043,'blower'],[2077,'water'],[2112,'fan'],[2147,'steam'],[2178,'ramp']],
    [[2210,'buoy'],[2240,'water'],[2270,'trampoline'],[2300,'buoy'],[2329,'cannon'],[2358,'buoy'],[2384,'flower']]
  ];
  // Larger regions use deliberately spaced launch islands and low/high alternatives.
  regions.forEach(r=>{r.at*=5;r.end*=5;});
  layouts[0]=[[80,'flower'],[155,'trampoline'],[270,'water'],[420,'seesaw'],[610,'awning'],[835,'cannon'],[1030,'trampoline'],[1180,'fan']];
  for(let ri=1;ri<layouts.length;ri++) layouts[ri]=layouts[ri].map(([m,type,lift=0],i)=>[m*5+(i%3-1)*18,type,lift+(ri>=2&&ri<=4&&i%4===1?65:0)]);
  const supportTypes=[['flower','trampoline','awning'],['ramp','trampoline','fan'],['awning','ramp','awning'],['conveyor','blower','steam'],['steam','water','fan'],['buoy','flower','trampoline']];
  const authoredLayouts=layouts.map((rows,ri)=>{
    const filled=[...rows];
    for(let i=1;i<rows.length;i++){
      const gap=rows[i][0]-rows[i-1][0],count=gap>210?2:gap>125?1:0;
      for(let j=1;j<=count;j++)filled.push([Math.round(rows[i-1][0]+gap*j/(count+1)),supportTypes[ri][(i+j)%3],ri===2?[0,90,160][(i+j)%3]:0]);
    }
    return filled.sort((a,b)=>a[0]-b[0]);
  });
  authoredLayouts[5].push([11830,'ramp',0]);
  authoredLayouts[5].push([11990,'ramp',0]);
  const devices=authoredLayouts.flatMap((rows,regionIndex)=>rows.map(([m,type,lift=0],i)=>({id:'device-'+m,m,x:x(m),type,lift,region:regionIndex,tier:regionIndex,...types[type]})));
  const critters=[];
  const groundSets=[[21,0],[45,1],[74,3],[124,2],[183,0],[241,3],[282,1],[372,0],[448,1],[543,2],[621,3],[687,0],[786,1],[886,0],[1022,3],[1132,2],[1216,1],[1314,3],[1420,0],[1524,1],[1665,3],[1735,0],[1790,3],[1888,1],[2025,3],[2130,0],[2225,3],[2260,0],[2339,2]];
  groundSets.forEach(([oldM,sprite],i)=>{const m=oldM*5;critters.push({id:'animal-'+i,m,x:x(m),sprite,air:false,range:22+i%3*9,phase:i*.73,period:2.6+i%4*.45,interactive:i%4===0});});
  regions.forEach((r,ri)=>{
    const count=Math.floor((r.end-r.at)/61);
    for(let i=0;i<count;i++)critters.push({id:'bird-'+ri+'-'+i,m:r.at+25+i*61,x:x(r.at+25+i*61),sprite:ri===5?5:i%5===0?7:i%4===0?6:4,air:true,height:[205,355,550,790,1320,1880][i%6],range:55+i%3*25,phase:i*.89+ri*.6,period:4+i%3,interactive:i%11===0});
    for(let m=r.at+50,i=0;m<r.end;m+=137,i++)critters.push({id:'ambient-'+ri+'-'+i,m,x:x(m),sprite:i%4,air:false,range:18+i%3*9,phase:ri+i*.81,period:3.2+i%3*.3,interactive:false});
  });
  const air=[];
  regions.forEach((r,ri)=>{for(let m=r.at+185,i=0;m<r.end-35;m+=265+ri*12,i++)air.push({id:'air-'+ri+'-'+i,m,x:x(m),height:[440,850,1350,650][i%4],type:i%2?'balloon':'thermal',phase:ri*.7+i*.8});});
  const landmarks=[
    [0,'바다를 향한 첫 여행'],[250,'바람 도로에 오신 걸 환영해요'],[650,'카페와 지붕 사이로'],[1150,'통통 공장 · 안전 운행'],[1750,'힘찬 증기의 언덕'],[2200,'바닷바람이 느껴져요'],[2400,'드디어, 바다!']
  ].map(([oldM,text])=>{const m=oldM*5;return {m,x:x(m),text};});
  const coins=[];
  devices.forEach((d,i)=>{for(let j=0;j<5;j++)coins.push({id:'coin-'+i+'-'+j,x:d.x-70+j*48,height:120+d.lift+Math.sin(j/4*Math.PI)*100});});
  air.forEach((a,i)=>{for(let j=0;j<4;j++)coins.push({id:'skycoin-'+i+'-'+j,x:a.x-65+j*44,height:a.height+30+Math.sin(j)*35});});
  const regionAt=m=>regions.find(r=>m>=r.at&&m<r.end)||regions[regions.length-1];
  const terrain=[[0,510],[250,510],[500,503],[1000,512],[2180,510],[3200,506],[4600,512],[5380,510],[6800,505],[7800,510],[9340,510],[10700,505],[12000,512],[14180,510],[15500,506],[16900,512],[17780,510],[19380,510],[19800,510]].map(([px,y])=>[px*5,y]);
  function groundAt(px){for(let i=1;i<terrain.length;i++)if(px<=terrain[i][0]){const a=terrain[i-1],b=terrain[i],t=Math.max(0,(px-a[0])/(b[0]-a[0]));return a[1]+(b[1]-a[1])*(t*t*(3-2*t));}return 510;}
  // Speeds are peak world pixels/second. Patrol paths and phases are authored,
  // independent of display frame rate, and reset to the same state each run.
  const animalProfiles=[
    {name:'토끼',speed:42,range:50,fps:7},
    {name:'고슴도치',speed:17,range:34,fps:4.5},
    {name:'양',speed:25,range:42,fps:5},
    {name:'개구리',speed:33,range:46,fps:6},
    {name:'제비',speed:84,range:110,fps:9},
    {name:'갈매기',speed:52,range:96,fps:6},
    {name:'꿀벌',speed:66,range:74,fps:12},
    {name:'펠리컨',speed:38,range:88,fps:5}
  ];
  critters.forEach((c,i)=>{
    const profile=animalProfiles[c.sprite];
    c.featured=c.interactive;
    c.interactive=true;
    c.strength=c.featured?1:.28;
    c.axis=c.air&&i%3===1?'y':'x';
    c.range=profile.range*(.9+(i%3)*.1);
    // Keep the low-altitude vertical path comfortably above the ground.
    if(c.axis==='y')c.range=Math.min(c.range,c.height-100);
    c.speed=profile.speed*(.94+(i%3)*.06);
    c.period=2*Math.PI*c.range/c.speed;
    c.fps=profile.fps;
  });
  const maxPatrolRange=Math.max(...critters.map(c=>c.range));
  function animalPosition(c,time){
    const t=time*2*Math.PI/c.period+c.phase,offset=Math.sin(t)*c.range;
    const velocity=Math.cos(t)*c.speed;
    return {x:c.x+(c.axis==='x'?offset:0),
      y:groundAt(c.x)-(c.air?c.height:24)+(c.axis==='y'?offset:0),
      facing:c.axis==='x'?(velocity>=0?1:-1):1,velocity};
  }
  function animalFrame(c,time){
    // Four real drawings per cycle; each animal has its own fixed phase.
    if(c.air)return Math.floor(Math.max(0,time)*c.fps+c.phase*4) % 4;
    // Walking cadence follows distance traveled, slowing at each turnaround.
    const t=Math.max(0,time)*2*Math.PI/c.period+c.phase;
    const turns=Math.floor(t/Math.PI),part=t-turns*Math.PI;
    const travel=(turns*2+(part<=Math.PI/2?Math.sin(part):2-Math.sin(part)))*c.range;
    return Math.floor(travel*c.fps/c.speed) % 4;
  }
  for(const items of [devices,critters,air,coins])items.sort((a,b)=>a.x-b.x);
  function nearby(items,left,right){let lo=0,hi=items.length;while(lo<hi){const mid=(lo+hi)>>>1;if(items[mid].x<left)lo=mid+1;else hi=mid;}const start=lo;while(lo<items.length&&items[lo].x<=right)lo++;return items.slice(start,lo);}
  const map={version:5,meter,origin,end,regions,devices,critters,air,landmarks,coins,types,x,groundAt,animalPosition,animalFrame,animalProfiles,maxPatrolRange,regionAt,nearby};
  root.TurtleMap=map;if(typeof module!=='undefined')module.exports=map;
})(typeof window!=='undefined'?window:globalThis);
