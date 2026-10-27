(function(root){
  'use strict';
  const map=root.TurtleMap||(typeof require!=='undefined'?require('./map.js'):null);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const segmentDistance=(px,py,ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,t=clamp(((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy||1),0,1);return Math.hypot(px-ax-t*dx,py-ay-t*dy);};
  class Flight {
    constructor(upgrades={}){this.upgrades=upgrades;this.reset();}
    get shellLevel(){return clamp(this.upgrades.shell||0,0,10);}
    get airDrag(){const level=this.shellLevel;return level<=5?.034-level*.005:.009-(level-5)*.0014;}
    reset(){this.t={x:map.origin,y:map.groundAt(map.origin)-88,vx:0,vy:0,r:26,rot:-.2,rolling:false,squash:0};this.time=0;this._carry=0;this.ended=false;this.clear=false;this.started=false;this.launchBoosted=false;this.launchSpeed=0;this.speedLimit=1250;this.charges=3;this.perfect=0;this.coins=0;this.chain=0;this.longestChain=0;this.deviceHits=0;this.animalHits=0;this.groundHits=0;this.events=[];this.used=new Set();this.collected=new Set();this.cooldown=0;this.capture=null;this.glide=0;this.rest=0;this.lastDevice='';this.visited=new Set([0]);}
    get distance(){return Math.max(0,Math.floor((this.t.x-map.origin)/map.meter));}
    emit(kind,detail={}){this.events.push({kind,x:this.t.x,y:this.t.y,...detail});}
    launch(angle,power,combo,{boost=false}={}){if(this.started)return false;this.launchBoosted=!!boost;this.speedLimit=boost?1800:1250;const speed=boost?1800:(570+clamp(power,0,1)*270+Math.min(combo,28)*6)*(1+clamp(this.upgrades.launch||0,0,5)*.085),a=angle*Math.PI/180;this.launchSpeed=speed;this.t.vx=speed*Math.cos(a);this.t.vy=-speed*Math.sin(a);this.charges=3+Math.min(3,Math.floor(combo/8));this.started=true;this.emit('launch',{boosted:!!boost});return true;}
    action(){if(!this.started||this.ended||this.charges<=0||this.cooldown>0)return false;this.cooldown=.65;this.charges--;if(this.capture){this.capture.left=Math.min(this.capture.left,.08);this.emit('tap',{text:'조금 더 빨리 출발!'});return true;}this.t.rolling=false;this.t.vy=Math.min(this.t.vy-105,-145);this.t.vx=Math.min(Math.max(1300,this.speedLimit),this.t.vx+35);this.emit('tap',{text:'살짝 띄우기'});return true;}
    recordLink(){this.chain++;this.deviceHits++;this.longestChain=Math.max(this.longestChain,this.chain);if(this.chain%5===0&&this.charges<6){this.charges++;this.emit('tap',{text:'5개 연결! 공중 도움 +1'});}}
    boost(d){const t=this.t;this.used.add(d.id);this.recordLink();this.lastDevice=d.name||d.type;t.rolling=false;t.squash=.2;this.rest=0;this.emit('device',{id:d.id,type:d.type,text:d.name||d.type,chain:this.chain});}
    hitDevice(d){const t=this.t,base=map.groundAt(d.x)-d.lift,eff=.88+(this.upgrades.launch||0)*.105,incoming=t.vx;this.boost(d);
      switch(d.type){
        case 'trampoline':t.vx=Math.max(150,t.vx*.94+40*eff);t.vy=-clamp(Math.abs(t.vy)*.78,430,720)*eff;break;
        case 'flower':t.vx=t.vx*.9+20*eff;t.vy=-500*eff;break;
        case 'awning':t.vx=t.vx*.97+35*eff;t.vy=-440*eff;break;
        case 'water':t.vx=t.vx*.95+70*eff;t.vy=-780*eff;break;
        case 'steam':t.vx=t.vx*.95+40*eff;t.vy=-700*eff;break;
        case 'fan':t.vx=t.vx*.95+35*eff;t.vy=Math.min(t.vy,-500*eff);this.glide=.75;break;
        case 'blower':t.vx=t.vx*.97+135*eff;t.vy=Math.min(t.vy,-280*eff);this.glide=1;break;
        case 'ramp':t.vx=t.vx*.96+180*eff;t.vy=-380*eff;break;
        case 'conveyor':t.vx=t.vx*.9+130*eff;t.vy=-250*eff;break;
        case 'seesaw':t.vx=t.vx*.95+50*eff;t.vy=-610*eff;break;
        case 'buoy':t.vx=t.vx*.95+50*eff;t.vy=-490*eff;break;
        case 'cannon':this.capture={type:'cannon',device:d,incoming,left:1.25,total:1.25};t.x=d.x+15;t.y=base-80;t.vx=0;t.vy=0;break;
      }
      t.vx=Math.min(this.speedLimit,t.vx);if(d.kind==='surface')t.y=Math.min(t.y,base-d.surface-t.r-2);
    }
    hitAnimal(c,p){
      const t=this.t,strength=c.strength??1,direction=p.facing||1;
      this.used.add(c.id);this.animalHits++;if(c.featured)this.recordLink();
      t.rolling=false;t.squash=.16;this.rest=0;
      let text='',effect='bounce';const before=t.vx;
      switch(c.sprite){
        case 0:t.vx=t.vx*.98+direction*26*strength;t.vy=-(160+210*strength);text='토끼가 통통!';break;
        case 1:t.vx*=.9;t.vy=-(145+175*strength);text='고슴도치의 말랑 쿠션!';break;
        case 2:t.vx+=direction*(30+65*strength);t.vy=-(160+310*strength);text=direction>0?'양이 앞으로 톡!':'양이 뒤로 톡!';effect='kick';break;
        case 3:t.vx+=direction*18*strength;t.vy=-(205+335*strength);text='개구리와 폴짝!';break;
        case 4:t.vx+=direction*(18+27*strength);t.vy=Math.min(t.vy,-70-80*strength);text=direction>0?'제비의 앞바람!':'제비의 반대 바람!';effect='push';break;
        case 5:this.glide=.35+.55*strength;t.vx+=direction*(12+23*strength);t.vy=Math.min(t.vy,-65-35*strength);text='갈매기와 가볍게 활공!';effect='glide';break;
        case 6:this.coins+=c.featured?8:3;t.vy=Math.min(t.vy,-60-50*strength);text='꿀벌의 통통 선물 +'+(c.featured?8:3);effect='buzz';break;
        case 7:this.capture={type:'pelican',device:c,incoming:t.vx,direction,left:c.featured?1.05:.45,total:c.featured?1.05:.45};t.vy=0;text=direction>0?'펠리컨이 앞으로 휙!':'펠리컨이 뒤로 휙!';effect='carry';break;
      }
      t.vx=clamp(t.vx,70,this.speedLimit);
      this.emit('animal',{id:c.id,sprite:c.sprite,text,effect,direction,featured:c.featured,animalX:p.x,animalY:p.y,impulse:t.vx-before});
    }
    step(dt){
      if(!this.started||this.ended)return;
      this._carry+=Math.max(0,dt);
      const tick=1/120;
      while(this._carry+1e-10>=tick&&!this.ended){this._carry=Math.max(0,this._carry-tick);this.advance(tick);}
    }
    advance(dt){if(!this.started||this.ended)return;this.time+=dt;this.cooldown=Math.max(0,this.cooldown-dt);this.glide=Math.max(0,this.glide-dt);const t=this.t;
      if(this.capture){const cap=this.capture;cap.left-=dt;if(cap.type==='pelican'){t.x+=Math.max(150,cap.incoming*.86)*(cap.direction||1)*dt;}if(cap.left<=0){if(cap.type==='cannon'){t.vx=(570+Math.min(cap.incoming,700)*.22)*(1+(this.upgrades.launch||0)*.095);t.vy=-670*(1+(this.upgrades.launch||0)*.065);t.x=cap.device.x+50;t.y=map.groundAt(cap.device.x)-cap.device.lift-105;this.emit('fire',{text:'펑! 다시 출발!'});}else{t.vx=Math.max(120,cap.incoming*.92+(cap.direction||1)*45);t.vy=-155;this.glide=.55;this.emit('fire',{text:'고마워, 펠리컨!'});}this.capture=null;}this.finishCheck();return;}
      const old={x:t.x,y:t.y};t.vx*=Math.exp(-this.airDrag*dt);
      if(t.rolling){t.vx=Math.max(0,t.vx-(245-this.shellLevel*20)*dt);t.y=map.groundAt(t.x)-t.r;this.rest+=dt;}else{t.vy+=(this.glide>0?95:275)*dt;t.y+=t.vy*dt;this.rest=0;}
      t.x+=t.vx*dt;if(t.rolling)t.y=map.groundAt(t.x)-t.r;t.rot+=t.vx*dt/55;t.squash=Math.max(0,t.squash-dt*2.5);
      const candidates=map.nearby(map.devices,old.x-160,t.x+180).filter(d=>!this.used.has(d.id));
      for(const d of candidates){const base=map.groundAt(d.x)-d.lift,dx=Math.abs(t.x-d.x);let hit=false;
        if(d.kind==='surface'){const surface=d.type==='ramp'?25+clamp((t.x-d.x+d.w/2)/d.w,0,1)*65:d.surface;const sy=base-surface-t.r;hit=t.vy>0&&old.y<=sy+8&&t.y>=sy&&dx<d.w*.43+t.r*.3; if(['conveyor','ramp','trampoline','flower','buoy'].includes(d.type))hit ||= t.rolling&&!d.lift&&dx<d.w*.36;}
        else if(d.kind==='capture')hit=segmentDistance(d.x+40,base-95,old.x,old.y,t.x,t.y)<t.r+30;
        else if(d.kind==='water')hit=dx<45&&t.y>base-290&&t.y<base-35;
        else if(d.kind==='fan')hit=dx<65&&t.y>base-330&&t.y<base-45;
        else if(d.kind==='blower')hit=t.x>d.x-25&&t.x<d.x+180&&t.y>base-205&&t.y<base-35;
        else if(d.kind==='steam')hit=dx<48&&t.y>base-300&&t.y<base-35&&((this.time+d.m*.007)%4.2)<1.8;
        if(hit){this.hitDevice(d);break;}
      }
      if(!this.capture){for(const c of map.nearby(map.critters,Math.min(old.x,t.x)-map.maxPatrolRange-60,Math.max(old.x,t.x)+map.maxPatrolRange+60)){
        if(!c.interactive||this.used.has(c.id))continue;
        const p=map.animalPosition(c,this.time),previous=map.animalPosition(c,this.time-dt);
        // Sweep both participants, so a fast wingbeat/path never skips a hit.
        if(segmentDistance(0,0,old.x-previous.x,old.y-previous.y,t.x-p.x,t.y-p.y)<t.r+(c.air?26:22)){this.hitAnimal(c,p);break;}
      }}
      if(!this.capture){for(const a of map.nearby(map.air,t.x-80,t.x+80)){if(this.used.has(a.id))continue;const y=map.groundAt(a.x)-a.height;if(segmentDistance(a.x,y,old.x,old.y,t.x,t.y)<(a.type==='thermal'?48:45)){this.used.add(a.id);this.recordLink();t.rolling=false;t.vx+=25;t.vy=Math.min(t.vy,a.type==='thermal'?-230:-185);this.glide=.5;this.emit('air',{id:a.id,text:a.type==='thermal'?'상승 기류를 탔어요!':'풍선 부표, 통통!',chain:this.chain});break;}}}
      const g=map.groundAt(t.x)-t.r;
      if(!this.capture&&!t.rolling&&t.y>=g&&t.vy>=0){t.y=g;this.groundHits++;this.chain=0;this.glide=0;t.squash=.2;t.vx*=.57+this.shellLevel*.025;t.vy=-Math.abs(t.vy)*(.19+this.shellLevel*.008);this.emit('ground');if(Math.abs(t.vy)<95){t.vy=0;t.rolling=true;}}
      for(const c of map.nearby(map.coins,old.x-48,t.x+48)){if(this.collected.has(c.id))continue;if(segmentDistance(c.x,map.groundAt(c.x)-c.height,old.x,old.y,t.x,t.y)<t.r+11){this.collected.add(c.id);this.coins+=2;this.emit('coin');}}
      this.visited.add(map.regionAt(this.distance).index);this.finishCheck();
    }
    finishCheck(){if(this.distance>=map.end){this.clear=true;this.ended=true;this.emit('finish',{clear:true});}else if(!this.capture&&this.t.rolling&&(this.t.vx<18||this.rest>2.2+Math.max(0,this.shellLevel-5)*.22)){this.ended=true;this.emit('finish',{clear:false});}else if(this.time>420){this.ended=true;this.emit('finish',{clear:false});}}
  }
  root.TurtleFlight=Flight;if(typeof module!=='undefined')module.exports=Flight;
})(typeof window!=='undefined'?window:globalThis);
