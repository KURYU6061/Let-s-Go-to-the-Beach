(function(root){
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const thresholds=[0,260,550,900,1350];
  const palettes=[[],['#efca50','#fff2a6'],['#71b975','#dbf2b0'],['#e6ce4d','#79bc72'],['#ea6849','#ffe16a']];
  class TurtleEffects {
    constructor({reduced=false}={}){this.reduced=reduced;this.stamps=null;this.reset();}
    static tier(speed){let tier=0;for(let i=1;i<5;i++)if(speed>=thresholds[i])tier=i;return tier;}
    static powerColor(power){const p=clamp(power,0,1);return `rgb(${Math.round(199+36*p)},${Math.round(172-101*p)},${Math.round(88-23*p)})`;}
    reset(){this.time=0;this.tier=0;this.speed=0;this.strength=0;this.heading=0;this.spin=0;this.spinSpeed=0;this.launchSpin=0;this.hits=[];this.dust=[];this.afterimages=[];this.ghostSample=0;this.muzzle=null;this.angleFlash=0;this.powerFlash=0;this.launched=false;this.launchCount=0;this.heavyLaunch=false;this.seed=127;}
    random(){this.seed=(this.seed*16807)%2147483647;return (this.seed-1)/2147483646;}
    angleSet(){this.angleFlash=.38;}
    powerSet(){this.powerFlash=.4;}
    hit(x,y,combo){
      const theta=combo*2.399963-.6;
      this.hits.push({x,y,theta,age:0,life:.24,index:combo});
      if(this.hits.length>8)this.hits.shift();
    }
    launch(x,y,angle,combo){
      if(this.launched)return false;
      this.launched=true;this.launchCount++;this.launchSpin=this.spin;this.heavyLaunch=combo>20;
      const a=angle*Math.PI/180,count=this.reduced?10:this.heavyLaunch?38:14;
      for(let i=0;i<count;i++){
        const force=(this.heavyLaunch?130:65)+this.random()*(this.heavyLaunch?210:100);
        this.dust.push({x:x-24*Math.cos(a),y:y+14,age:0,life:.48+this.random()*.43,
          vx:-Math.cos(a)*force+(this.random()-.5)*80,vy:-28-this.random()*82+Math.sin(a)*force*.18,
          radius:(this.heavyLaunch?13:8)+this.random()*19,rotation:this.random()*6.28,stamp:i%3});
      }
      this.muzzle={x,y,a:-a,age:0,life:this.heavyLaunch?.24:.14};
      return true;
    }
    update(dt,{stage,t,combo=0,capture=false}){
      this.time+=dt;this.angleFlash=Math.max(0,this.angleFlash-dt);this.powerFlash=Math.max(0,this.powerFlash-dt);
      if(stage==='combo'&&combo>0){const target=Math.min(this.reduced?6:35,3+combo*.65);this.spinSpeed+=(target-this.spinSpeed)*(1-Math.exp(-dt*12));this.spin+=this.spinSpeed*dt;}
      this.speed=stage==='flight'&&!capture?Math.hypot(t.vx,t.vy):0;
      const next=TurtleEffects.tier(this.speed);
      if(next>this.tier||this.speed<(thresholds[this.tier]||0)-35||this.speed===0)this.tier=next;
      if(this.tier===4&&stage==='flight'&&!capture&&!this.reduced){
        for(const ghost of this.afterimages)ghost.age+=dt;
        this.afterimages=this.afterimages.filter(ghost=>ghost.age<.105);
        this.ghostSample+=dt;
        if(this.ghostSample>=.024){
          this.ghostSample%=.024;
          this.afterimages.push({x:t.x,y:t.y,rotation:(t.rot||0)+this.launchSpin,squash:t.squash||0,age:0});
          if(this.afterimages.length>4)this.afterimages.shift();
        }
      }else{this.afterimages=[];this.ghostSample=0;}
      this.strength+=(Math.min(1,this.speed/1350)-this.strength)*(1-Math.exp(-dt*12));
      if(this.speed>100){const angle=Math.atan2(t.vy,t.vx),delta=Math.atan2(Math.sin(angle-this.heading),Math.cos(angle-this.heading));this.heading+=delta*(1-Math.exp(-dt*18));}
      for(const h of this.hits)h.age+=dt;
      this.hits=this.hits.filter(h=>h.age<h.life);
      for(const d of this.dust){d.age+=dt;d.x+=d.vx*dt;d.y+=d.vy*dt;d.vy+=55*dt;d.vx*=Math.exp(-dt*1.5);}
      this.dust=this.dust.filter(d=>d.age<d.life);
      if(this.muzzle){this.muzzle.age+=dt;if(this.muzzle.age>=this.muzzle.life)this.muzzle=null;}
    }
    kick(){
      if(this.reduced||!this.hits.length)return {x:0,y:0};
      const h=this.hits[this.hits.length-1],k=Math.sin(clamp((h.age-.035)/.12,0,1)*Math.PI)*2.7;
      return {x:-Math.cos(h.theta)*k,y:-Math.sin(h.theta)*k};
    }
    makeStamps(ctx){
      if(this.stamps)return;
      this.stamps=['#d9be96','#ead4ad','#eee0bf'].map(color=>{
        const c=ctx.canvas.ownerDocument.createElement('canvas');c.width=c.height=96;const g=c.getContext('2d');
        for(let j=0;j<5;j++){
          const x=48+Math.cos(j*1.4)*14,y=48+Math.sin(j*1.7)*10,r=23+j%2*7;
          const fade=g.createRadialGradient(x,y,0,x,y,r);fade.addColorStop(0,color+'c0');fade.addColorStop(.58,color+'99');fade.addColorStop(1,color+'00');g.fillStyle=fade;g.fillRect(x-r,y-r,r*2,r*2);
        }
        return c;
      });
    }
    drawBack(ctx,{stage,t,viewX,viewY,capture=false,shell=null}){
      if(stage!=='flight')return;
      const x=t.x-viewX,y=t.y-viewY;
      if(this.tier===4&&!capture&&shell?.naturalWidth)this.drawAfterimages(ctx,shell,t,viewX,viewY);
      if(this.tier&&!capture)this.wind(ctx,x,y);
      if(this.dust.length){
        this.makeStamps(ctx);
        for(const d of this.dust){const p=d.age/d.life,r=d.radius*(.7+p*1.65);ctx.save();ctx.globalAlpha=Math.sin(Math.min(1,p*5)*Math.PI/2)*(1-p)*.72;ctx.translate(d.x-viewX,d.y-viewY);ctx.rotate(d.rotation);ctx.drawImage(this.stamps[d.stamp],-r,-r,r*2,r*2);ctx.restore();}
      }
      if(this.muzzle){
        const m=this.muzzle,p=m.age/m.life;ctx.save();ctx.translate(m.x-viewX,m.y-viewY);ctx.rotate(m.a);
        ctx.globalAlpha=(1-p)*.55;ctx.strokeStyle=this.heavyLaunch?'#fff0a1':'#efe0ad';ctx.lineWidth=2.2;
        ctx.beginPath();ctx.ellipse(-23-p*28,0,10+p*15,27+p*34,0,-1.45,1.45);ctx.stroke();
        if(this.heavyLaunch&&!this.reduced){ctx.fillStyle='rgba(255,232,155,.48)';ctx.beginPath();ctx.moveTo(-22,-13);ctx.lineTo(-72-p*32,-4);ctx.lineTo(-50-p*28,0);ctx.lineTo(-76-p*24,8);ctx.lineTo(-22,14);ctx.closePath();ctx.fill();}
        ctx.restore();
      }
    }
    drawAfterimages(ctx,shell,t,viewX,viewY){
      // Use actual previous world poses, so the trail follows curves and camera motion.
      const visible=this.afterimages.filter(ghost=>Math.hypot(t.x-ghost.x,t.y-ghost.y)>12).slice(-3);
      for(const ghost of visible){
        const fade=clamp(1-ghost.age/.105,0,1),scale=.91+fade*.07;
        ctx.save();ctx.globalAlpha=.19*Math.pow(fade,1.35);ctx.translate(ghost.x-viewX,ghost.y-viewY);ctx.rotate(ghost.rotation);
        ctx.scale(scale*(1+ghost.squash),scale*(1-ghost.squash*.5));ctx.drawImage(shell,-37,-32,74,64);ctx.restore();
      }
    }
    wind(ctx,x,y){
      const tier=this.tier,colors=palettes[tier],time=this.time,energy=clamp(this.strength,.28,1);
      ctx.save();ctx.translate(x,y);ctx.rotate(this.heading);ctx.lineCap='round';ctx.lineJoin='round';
      const length=75+tier*25,count=this.reduced?3:3+tier;
      if(tier>=3){
        const fade=ctx.createLinearGradient(-length-40,0,36,0);fade.addColorStop(0,colors[0]+'00');fade.addColorStop(.7,colors[0]+'16');fade.addColorStop(1,colors[0]+'35');ctx.fillStyle=fade;
        ctx.beginPath();ctx.moveTo(35,-8);ctx.quadraticCurveTo(-35,-29,-length-35,-12);ctx.lineTo(-length-35,12);ctx.quadraticCurveTo(-35,29,35,8);ctx.closePath();ctx.fill();
      }
      for(const side of [-1,1]){
        const wash=ctx.createLinearGradient(-length,0,43,0);
        wash.addColorStop(0,colors[0]+'00');wash.addColorStop(.45,colors[tier===3&&side>0?1:0]+'66');wash.addColorStop(1,colors[0]+'c0');
        ctx.strokeStyle=wash;ctx.globalAlpha=.8;ctx.lineWidth=2+tier*.35;
        ctx.beginPath();ctx.moveTo(40,side*9);ctx.bezierCurveTo(19,side*42,-37,side*39,-length,side*16);ctx.stroke();
      }
      for(let i=0;i<count;i++){
        const p=(time*(2.1+tier*.5)+i*.173)%1,side=i%2?1:-1,yy=side*(18+(i%3)*8);
        const head=12-p*length,tail=head-29-tier*8;
        ctx.globalAlpha=Math.sin(p*Math.PI)*(.48+energy*.18);ctx.strokeStyle=colors[i%2];ctx.lineWidth=i%3===0?3.2:1.8;
        ctx.beginPath();ctx.moveTo(head,yy);ctx.quadraticCurveTo((head+tail)/2,yy+side*5,tail,yy+side*3);ctx.stroke();
      }
      ctx.globalAlpha=.45+energy*.25;ctx.strokeStyle=colors[0];ctx.lineWidth=2.2+tier*.28;
      ctx.beginPath();ctx.ellipse(5,0,43+Math.sin(time*8)*1.5,34,0,-1.05,1.05);ctx.stroke();
      ctx.globalAlpha=.48;ctx.strokeStyle=colors[1];ctx.lineWidth=1.2;ctx.beginPath();ctx.ellipse(6,0,48,38,0,-.65,.65);ctx.stroke();
      if(tier===4){
        const tick=this.reduced?0:Math.floor(time*14);
        for(let j=0;j<(this.reduced?1:3);j++){
          ctx.globalAlpha=.78;ctx.strokeStyle='#ffe77c';ctx.lineWidth=j===0?2.1:1.45;ctx.beginPath();
          for(let k=0;k<7;k++){const px=25-k*19,py=(j-1)*24+Math.sin(k*2.3+tick*1.7+j)*6;(k?ctx.lineTo:ctx.moveTo).call(ctx,px,py);}
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    drawFront(ctx,{stage,t,viewX,viewY,angle,power}){
      if(stage!=='power'&&stage!=='combo')return;
      const x=t.x-viewX,y=t.y-viewY;
      ctx.save();ctx.translate(x,y);
      if(stage==='combo'){
        const color=TurtleEffects.powerColor(power),pulse=this.reduced?0:Math.sin(this.time*6)*.6;
        ctx.strokeStyle=color;ctx.globalAlpha=.68+this.powerFlash*.45;ctx.lineWidth=2+power*2;
        ctx.beginPath();ctx.ellipse(0,0,42+pulse,37+pulse,0,0,Math.PI*2);ctx.stroke();
        if(power>.85){ctx.globalAlpha=.25;ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(0,0,48,43,0,-.7,.7);ctx.stroke();}
      }
      // The direction arrow is independent of the shell's combo rotation.
      ctx.save();ctx.rotate(-angle*Math.PI/180);ctx.translate(0,this.reduced?0:Math.sin(this.time*3)*1.1);
      const tip=106+this.angleFlash*14;
      ctx.globalAlpha=.9;ctx.fillStyle='#f0d184';ctx.strokeStyle='#8b7952';ctx.lineWidth=1.4;
      ctx.beginPath();ctx.moveTo(53,-4);ctx.lineTo(tip-15,-4);ctx.lineTo(tip-15,-11);ctx.lineTo(tip+2,0);ctx.lineTo(tip-15,11);ctx.lineTo(tip-15,4);ctx.lineTo(53,4);ctx.closePath();ctx.strokeStyle='rgba(255,251,230,.95)';ctx.lineWidth=6;ctx.stroke();ctx.fill();ctx.strokeStyle='#8b7952';ctx.lineWidth=1.4;ctx.stroke();
      ctx.strokeStyle='#fff2bb';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(56,-1.5);ctx.lineTo(tip-17,-1.5);ctx.stroke();ctx.restore();ctx.restore();
      if(stage==='combo')for(const h of this.hits)this.drawHit(ctx,h,viewX,viewY);
    }
    drawHit(ctx,h,viewX,viewY){
      const p=h.age/h.life,approach=clamp(h.age/.05,0,1),retract=clamp((h.age-.07)/.17,0,1),r=85-48*approach+retract*25;
      const x=h.x-viewX,y=h.y-viewY,alpha=1-Math.pow(p,2);
      ctx.save();ctx.translate(x,y);ctx.rotate(h.theta);ctx.globalAlpha=alpha;
      if(h.age>.035){
        const flash=Math.max(0,1-(h.age-.035)/.12);ctx.save();ctx.translate(34,0);ctx.rotate(h.index*.4);ctx.fillStyle='#fff4c2';ctx.strokeStyle='#dfb457';ctx.lineWidth=1.1;
        ctx.beginPath();for(let j=0;j<12;j++){const a=j*Math.PI/6,rr=(j%2?5:13)*flash;(j?ctx.lineTo:ctx.moveTo).call(ctx,Math.cos(a)*rr,Math.sin(a)*rr);}ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
      }
      ctx.translate(r,0);ctx.rotate(Math.PI);ctx.lineWidth=1.25;ctx.strokeStyle='#8b7757';
      ctx.fillStyle=h.index%2?'#b5c9a0':'#e8bd85';ctx.beginPath();ctx.roundRect(-20,-7,10,14,3);ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff0cf';ctx.beginPath();ctx.roundRect(-12,-10,24,20,6);ctx.fill();ctx.stroke();
      for(let j=0;j<3;j++){ctx.beginPath();ctx.moveTo(4,-6+j*6);ctx.lineTo(10,-6+j*6);ctx.stroke();}
      ctx.beginPath();ctx.ellipse(-4,8,7,4,-.3,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.globalAlpha=alpha*.45;ctx.beginPath();ctx.moveTo(-27,-6);ctx.lineTo(-35,-6);ctx.moveTo(-26,5);ctx.lineTo(-38,5);ctx.stroke();ctx.restore();
    }
    get state(){return {tier:this.tier,speed:this.speed,spin:this.spin,spinSpeed:this.spinSpeed,hits:this.hits.length,dust:this.dust.length,afterimages:this.afterimages.length,launchCount:this.launchCount,heavyLaunch:this.heavyLaunch,reduced:this.reduced};}
  }
  root.TurtleEffects=TurtleEffects;
  if(typeof module!=='undefined')module.exports=TurtleEffects;
})(typeof window!=='undefined'?window:globalThis);
