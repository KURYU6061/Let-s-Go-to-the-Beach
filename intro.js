(function(root){
  'use strict';
  const key='turtle-beach-intro-seen-v1';
  const descriptions=['새벽, 거북이는 꿈나라에 있어요.','톡! 바다 엽서가 얼굴에 떨어졌어요.','이 바다는… 어디일까?','Freedom! 꿈꾸던 바다가 기다려요.'];
  class BeachIntro {
    constructor({onEnter,onCue,isPaused}){
      this.onEnter=onEnter;this.onCue=onCue;this.isPaused=isPaused;
      this.mode='title';this.visible=0;this.seen=false;this.busy=false;this.switching=false;this.lockUntil=0;
      this.$=id=>document.getElementById(id);
      try{this.seen=localStorage.getItem(key)==='1';}catch{}
      this.panels=[...document.querySelectorAll('.comic-panel')];
      this.atlas=new Image();this.atlas.src='assets/intro-comic-v11.png';
      this.poster=new Image();this.poster.src='assets/intro-departure-v11.png';
      this.ready=Promise.all([this.atlas.decode(),this.poster.decode()]).catch(()=>{});
      document.querySelector('.page').classList.add('is-front');
      this.$('startButton').onclick=()=>this.start();
      this.$('storyNext').onclick=e=>{e.stopPropagation();this.advance();};
      this.$('departureNext').onclick=e=>{e.stopPropagation();this.advance();};
      this.$('storySheet').addEventListener('click',e=>{if(!e.target.closest('button'))this.advance();});
      this.$('departureScreen').addEventListener('click',e=>{if(!e.target.closest('button'))this.advance();});
      this.resizeObserver=new ResizeObserver(()=>this.drawPanels());this.resizeObserver.observe(this.$('comicGrid'));
      document.addEventListener('keydown',e=>{
        if(!this.active||this.isPaused()||e.target.closest('button,input'))return;
        if(['Space','Enter','ArrowRight'].includes(e.code)){e.preventDefault();if(this.mode==='title')this.start();else this.advance();}
      });
    }
    get active(){return this.mode!=='game';}
    async start(){
      if(this.mode!=='title'||this.busy||this.isPaused())return;
      if(this.seen){this.onCue('start');this.enter();return;}
      this.busy=true;this.$('startButton').disabled=true;this.$('startButton').textContent='준비 중…';
      await this.ready;
      this.busy=false;this.mode='comic';this.$('frontScreen').dataset.mode='comic';
      this.$('titleScreen').hidden=true;this.$('storySheet').hidden=false;this.visible=1;
      this.drawPanels();this.reveal();
    }
    reveal(){
      this.lockUntil=performance.now()+260;
      this.panels.forEach((panel,i)=>{panel.classList.toggle('is-visible',i<this.visible);panel.classList.toggle('is-current',i===this.visible-1);panel.setAttribute('aria-hidden',String(i>=this.visible));});
      this.$('storyProgress').textContent=this.visible+' / 4';
      this.$('storyNext').innerHTML=(this.visible===4?'페이지 넘기기':'다음 컷')+' <span aria-hidden="true">→</span>';
      this.$('frontAnnouncement').textContent=descriptions[this.visible-1];
      this.onCue('introReveal',{panel:this.visible});
    }
    advance(){
      if(this.isPaused()||this.busy||this.switching||performance.now()<this.lockUntil)return;
      if(this.mode==='comic'){
        if(this.visible<4){this.visible++;this.reveal();}
        else this.depart();
      }else if(this.mode==='departure')this.enter();
    }
    depart(){
      this.mode='departure';this.switching=true;this.$('frontScreen').dataset.mode='departure';
      this.$('departureScreen').hidden=false;this.$('storySheet').classList.add('is-turning');
      this.onCue('pageTurn');
      const done=()=>{
        if(!this.switching)return;
        this.switching=false;this.$('storySheet').hidden=true;clearTimeout(this.turnFallback);
        this.lockUntil=performance.now()+180;this.$('frontAnnouncement').textContent="Let's Go to the Beach! 한 번 더 누르면 여행을 시작해요.";
        this.onCue('introDeparture');
      };
      this.$('storySheet').addEventListener('animationend',done,{once:true});
      this.turnFallback=setTimeout(()=>{if(!this.isPaused())done();},1100);
    }
    enter(){
      if(this.isPaused())return;
      if(!this.seen){this.seen=true;try{localStorage.setItem(key,'1');}catch{}}
      this.mode='game';this.$('frontScreen').hidden=true;document.querySelector('.page').classList.remove('is-front');this.onEnter();
    }
    drawPanels(){
      if(!this.atlas.naturalWidth)return;
      const sw=this.atlas.naturalWidth/2,sh=this.atlas.naturalHeight/2,ratio=Math.min(window.devicePixelRatio||1,2);
      this.panels.forEach((panel,index)=>{
        const canvas=panel.querySelector('canvas'),box=panel.getBoundingClientRect();
        if(!box.width||!box.height)return;
        canvas.width=Math.round(box.width*ratio);canvas.height=Math.round(box.height*ratio);
        const ctx=canvas.getContext('2d'),scale=Math.max(canvas.width/sw,canvas.height/sh),dw=sw*scale,dh=sh*scale;
        ctx.drawImage(this.atlas,index%2*sw,Math.floor(index/2)*sh,sw,sh,(canvas.width-dw)*(index<3?.58:.5),(canvas.height-dh)/2,dw,dh);
      });
    }
    get state(){return {mode:this.mode,visiblePanels:this.visible,seen:this.seen,transitioning:this.switching};}
  }
  root.BeachIntro=BeachIntro;
})(window);
