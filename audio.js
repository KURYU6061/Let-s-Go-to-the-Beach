(function(root){
  'use strict';
  const hz=n=>440*Math.pow(2,(n-69)/12);
  const melodies=[
    [76,0,79,0,81,0,79,0,76,0,74,0,72,0,74,0],
    [76,0,79,0,84,0,83,0,81,0,79,0,76,0,0,0],
    [77,0,81,0,84,0,81,0,79,0,77,0,76,0,77,0],
    [79,0,83,0,86,0,83,0,81,0,79,0,74,0,0,0],
    [84,0,0,79,81,0,79,0,76,0,74,0,76,0,79,0],
    [81,0,84,0,86,0,84,0,81,0,79,0,77,0,0,0],
    [77,0,81,0,84,0,86,0,84,0,81,0,79,0,77,0],
    [79,0,81,0,83,0,79,0,76,0,74,0,72,0,0,0]
  ];
  const chords=[[48,52,55],[45,48,52],[41,45,48],[43,47,50],[48,52,55],[41,45,48],[50,53,57],[43,47,50]];
  class TurtleAudio {
    constructor(){
      this.music=true;this.effects=true;this.context=null;this.blocked=false;this.timer=null;
      this.stepIndex=0;this.nextBeat=0;this.voices=new Set();this.musicVoices=new Set();
      this.stats={effects:{},musicSteps:0,maxVoices:0};this.lastCoin=-10;this.volumes={master:1,bgm:1,se:1};
      try{const s=JSON.parse(localStorage.getItem('turtle-audio-v5')||'null');if(s){this.music=s.music!==false;this.effects=s.effects!==false;for(const k of ['master','bgm','se'])if(Number.isFinite(s.volumes?.[k]))this.volumes[k]=Math.max(0,Math.min(1,s.volumes[k]));}}catch{}
    }
    unlock(){
      try{
        if(!this.context){
          const C=root.AudioContext||root.webkitAudioContext;if(!C)return;
          this.context=new C({latencyHint:'interactive'});
          const c=this.context;this.master=c.createDynamicsCompressor();
          this.master.threshold.value=-14;this.master.knee.value=18;this.master.ratio.value=4;
          this.master.attack.value=.003;this.master.release.value=.12;
          // +6 dB makeup raises quiet passages; a separate limiter catches stacked effects.
          this.outputBoost=c.createGain();this.outputBoost.gain.value=2;
          this.outputLimiter=c.createDynamicsCompressor();this.outputLimiter.threshold.value=-2;
          this.outputLimiter.knee.value=0;this.outputLimiter.ratio.value=20;
          this.outputLimiter.attack.value=.001;this.outputLimiter.release.value=.08;
          this.masterGain=c.createGain();this.masterGain.gain.value=this.volumes.master;
          this.master.connect(this.outputBoost);this.outputBoost.connect(this.outputLimiter);
          this.outputLimiter.connect(this.masterGain);this.masterGain.connect(c.destination);
          this.musicBus=c.createGain();this.musicBus.gain.value=.42*this.volumes.bgm;this.musicBus.connect(this.master);
          this.fxBus=c.createGain();this.fxBus.gain.value=this.effects?.68*this.volumes.se:0;this.fxBus.connect(this.master);
          this.noise=c.createBuffer(1,c.sampleRate,c.sampleRate);const data=this.noise.getChannelData(0);
          let seed=731;for(let i=0;i<data.length;i++){seed=(seed*16807)%2147483647;data[i]=seed/1073741824-1;}
        }
        if(this.context.state==='suspended')this.context.resume().then(()=>this.syncMusic()).catch(()=>{});
        this.syncMusic();
      }catch{}
    }
    remember(){try{localStorage.setItem('turtle-audio-v5',JSON.stringify({music:this.music,effects:this.effects,volumes:this.volumes}));}catch{}}
    setMusic(value){this.music=!!value;this.remember();this.syncMusic();}
    setEffects(value){this.effects=!!value;this.remember();if(this.context){const t=this.context.currentTime,g=this.fxBus.gain;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(this.effects?.68*this.volumes.se:0,t+.015);}}
    setVolume(kind,value){
      if(!Object.hasOwn(this.volumes,kind)||!Number.isFinite(value))return;
      this.volumes[kind]=Math.max(0,Math.min(1,value));this.remember();
      if(this.context){
        const t=this.context.currentTime,node=kind==='master'?this.masterGain:kind==='bgm'?this.musicBus:this.fxBus;
        const target=kind==='master'?this.volumes.master:kind==='bgm'?.42*this.volumes.bgm:this.effects?.68*this.volumes.se:0;
        if(node){node.gain.cancelScheduledValues(t);node.gain.setValueAtTime(node.gain.value,t);node.gain.linearRampToValueAtTime(target,t+.02);}
        this.syncMusic();
      }
    }
    setBlocked(value){if(this.blocked===!!value)return;this.blocked=!!value;this.syncMusic();}
    connectVoice(source,gain,bus,end){
      source.connect(gain);gain.connect(bus);this.voices.add(source);
      if(bus===this.musicBus)this.musicVoices.add(source);
      this.stats.maxVoices=Math.max(this.stats.maxVoices,this.voices.size);
      source.onended=()=>{source.disconnect();gain.disconnect();this.voices.delete(source);this.musicVoices.delete(source);};
      source.stop(end);
    }
    note(freq,duration,volume,type='sine',time=this.context.currentTime,bus=this.fxBus,endFreq=freq,hold=0){
      const c=this.context,o=c.createOscillator(),g=c.createGain();o.type=type;
      o.frequency.setValueAtTime(Math.max(25,freq),time);
      if(endFreq!==freq)o.frequency.exponentialRampToValueAtTime(Math.max(25,endFreq),time+duration);
      g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(volume,time+.004);
      if(hold>.004)g.gain.setValueAtTime(volume,time+hold);
      g.gain.exponentialRampToValueAtTime(.0001,time+duration);
      o.start(time);this.connectVoice(o,g,bus,time+duration+.018);
    }
    hiss(duration,volume,frequency=1800,time=this.context.currentTime,bus=this.fxBus,kind='bandpass'){
      const c=this.context,n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();n.buffer=this.noise;
      f.type=kind;f.frequency.value=frequency;f.Q.value=.8;n.connect(f);f.connect(g);
      g.gain.setValueAtTime(volume,time);g.gain.exponentialRampToValueAtTime(.0001,time+duration);
      g.connect(bus);this.voices.add(n);if(bus===this.musicBus)this.musicVoices.add(n);
      this.stats.maxVoices=Math.max(this.stats.maxVoices,this.voices.size);
      n.onended=()=>{n.disconnect();f.disconnect();g.disconnect();this.voices.delete(n);this.musicVoices.delete(n);};
      n.start(time);n.stop(time+duration+.01);
    }
    duck(){const g=this.musicBus.gain,t=this.context.currentTime,base=.42*this.volumes.bgm;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.linearRampToValueAtTime(base*.52,t+.012);g.linearRampToValueAtTime(base,t+.22);}
    vocal(freq,duration,volume,formant,time,endFreq=freq){
      const c=this.context,o=c.createOscillator(),f=c.createBiquadFilter(),g=c.createGain();
      const vibrato=c.createOscillator(),depth=c.createGain();
      o.type='sawtooth';o.frequency.setValueAtTime(freq,time);o.frequency.exponentialRampToValueAtTime(endFreq,time+duration);
      f.type='bandpass';f.Q.value=1.8;f.frequency.setValueAtTime(formant*.8,time);f.frequency.linearRampToValueAtTime(formant,time+.05);
      vibrato.frequency.value=11;depth.gain.value=freq*.035;vibrato.connect(depth);depth.connect(o.frequency);
      o.connect(f);f.connect(g);g.connect(this.fxBus);
      g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(volume,time+.008);g.gain.setValueAtTime(volume*.7,time+duration*.4);g.gain.exponentialRampToValueAtTime(.0001,time+duration);
      this.voices.add(o);this.stats.maxVoices=Math.max(this.stats.maxVoices,this.voices.size);
      o.onended=()=>{o.disconnect();f.disconnect();g.disconnect();vibrato.disconnect();depth.disconnect();this.voices.delete(o);};
      o.start(time);vibrato.start(time);vibrato.stop(time+duration);o.stop(time+duration+.01);
    }
    play(kind,data={}){
      const c=this.context;if(!c||c.state==='closed'||!this.effects||this.blocked||!this.volumes.master||!this.volumes.se)return;
      this.stats.effects[kind]=(this.stats.effects[kind]||0)+1;
      const t=c.currentTime;this.duck();
      switch(kind){
        case 'start':[72,76,79].forEach((n,i)=>this.note(hz(n),.12,.1,'triangle',t+i*.035));break;
        case 'introReveal':{
          const panel=data.panel||1;
          this.note(520+panel*95,.09,.09,'sine',t,this.fxBus,760+panel*90);
          if(panel===2)this.note(980,.04,.07,'triangle',t,this.fxBus,360,.006);
          else this.note(1040+panel*90,.065,.045,'sine',t+.025);
          break;
        }
        case 'pageTurn':[340,275,210].forEach((f,i)=>this.note(f,.085,.07,'triangle',t+i*.035,this.fxBus,f*.72));break;
        case 'introDeparture':[60,67,72,76].forEach((n,i)=>this.note(hz(n),.2,.085,'triangle',t+i*.055));break;
        case 'angle':this.hiss(.018,.1,2600);this.note(620,.055,.14,'triangle',t,this.fxBus,780,.009);this.note(1109,.055,.07,'sine',t+.025);break;
        case 'power':this.note(180,.075,.19,'triangle',t,this.fxBus,90,.014);this.note(730+(data.power||0)*450,.085,.1,'sine',t+.018);this.hiss(.022,.11,1900);break;
        case 'combo':{
          const pitch=1+Math.min(data.combo||0,32)*.012;
          this.hiss(.028,.32,1900+((data.combo||0)%3)*500);this.note(220*pitch,.085,.36,'triangle',t,this.fxBus,68*pitch,.02);
          this.note(85,.065,.18,'sine',t,this.fxBus,45,.012);
          this.note(900*pitch,.025,.09,'square',t,this.fxBus,360*pitch);break;
        }
        case 'launch':{
          // A clean physical launch pop, without the former air-noise tail.
          const heavy=data.combo>20;
          this.note(heavy?160:140,heavy?.18:.13,heavy?.29:.22,'sine',t,this.fxBus,48,.014);
          this.note(280,.075,.09,'triangle',t,this.fxBus,105);
          break;
        }
        case 'maxLaunch':this.maxLaunch(t);break;
        case 'fire':this.hiss(.16,.19,1500);this.note(125,.2,.25,'sine',t,this.fxBus,38);this.note(470,.12,.1,'triangle',t+.04,this.fxBus,1050);break;
        case 'animal':this.animal(data.sprite||0,t);break;
        case 'device':{
          const type=data.type||'';
          if(type==='water'||type==='steam'){this.hiss(.19,.12,2400);this.note(500,.1,.075,'sine',t,this.fxBus,950);}
          else if(['fan','blower','conveyor'].includes(type)){this.hiss(.14,.1,700);this.note(120,.12,.09,'triangle',t,this.fxBus,230);}
          else{this.note(200,.17,.15,'sine',t,this.fxBus,680);this.note(880,.09,.06,'triangle',t+.025);}
          break;
        }
        case 'air':this.hiss(.13,.085,1200);this.note(600,.13,.08,'sine',t,this.fxBus,1100);break;
        case 'ground':this.hiss(.025,.1,600);this.note(100,.065,.13,'sine',t,this.fxBus,50);break;
        case 'coin':if(t-this.lastCoin>.075){this.note(1568,.06,.06,'sine');this.note(2093,.06,.04,'sine',t+.025);this.lastCoin=t;}break;
        case 'tap':this.hiss(.045,.09,1000);this.note(520,.1,.09,'sine',t,this.fxBus,950);break;
        case 'upgrade':case 'clear':[72,76,79,84].forEach((n,i)=>this.note(hz(n),.18,.11,'triangle',t+i*.08));break;
        case 'result':[79,76,72].forEach((n,i)=>this.note(hz(n),.15,.09,'triangle',t+i*.07));break;
      }
    }
    maxLaunch(time){
      // A pitched thrust: a short body hit plus a harmonic rise, with no noise source.
      this.note(155,.17,.34,'sine',time,this.fxBus,43,.018);
      this.note(1250,.028,.045,'triangle',time,this.fxBus,460,.006);
      const c=this.context;
      const wave=c.createPeriodicWave(new Float32Array(5),new Float32Array([0,1,.28,.11,.035]));
      for(let layer=0;layer<2;layer++){
        const o=c.createOscillator(),filter=c.createBiquadFilter(),g=c.createGain();
        if(layer===0)o.setPeriodicWave(wave);else o.type='triangle';
        const ratio=layer===0?1:.502;
        o.frequency.setValueAtTime(105*ratio,time);
        o.frequency.exponentialRampToValueAtTime(330*ratio,time+.045);
        o.frequency.exponentialRampToValueAtTime(850*ratio,time+.145);
        o.frequency.exponentialRampToValueAtTime(420*ratio,time+.29);
        filter.type='lowpass';filter.Q.value=.65;filter.frequency.setValueAtTime(900,time);
        filter.frequency.exponentialRampToValueAtTime(3400,time+.13);filter.frequency.exponentialRampToValueAtTime(1200,time+.30);
        g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(layer===0?.17:.075,time+.008);
        g.gain.setValueAtTime(layer===0?.135:.05,time+.075);g.gain.exponentialRampToValueAtTime(.0001,time+.30);
        o.connect(filter);filter.connect(g);g.connect(this.fxBus);this.voices.add(o);
        this.stats.maxVoices=Math.max(this.stats.maxVoices,this.voices.size);
        o.onended=()=>{o.disconnect();filter.disconnect();g.disconnect();this.voices.delete(o);};
        o.start(time);o.stop(time+.32);
      }
    }
    animal(sprite,t){
      // Brief stylized, rounded animal voices, designed to stay cute at contact.
      switch(sprite){
        case 0:[0,.075].forEach((d,i)=>this.note(1350+i*140,.075,.12,'sine',t+d,this.fxBus,980+i*100));break;
        case 1:this.note(760,.12,.15,'triangle',t,this.fxBus,430,.016);this.hiss(.035,.035,900);break;
        case 2:this.vocal(220,.19,.22,1400,t,195);this.note(440,.1,.05,'sine',t,this.fxBus,390);break;
        case 3:this.vocal(150,.13,.25,580,t,95);this.note(310,.065,.06,'sine',t+.055,this.fxBus,410);break;
        case 4:[0,.065,.125].forEach((d,i)=>this.note(1450+i*160,.05,.09,'sine',t+d,this.fxBus,2100-i*120));break;
        case 5:this.note(1250,.13,.11,'sine',t,this.fxBus,700);this.note(1130,.09,.09,'sine',t+.105,this.fxBus,810);break;
        case 6:this.vocal(250,.14,.12,750,t,330);this.note(1000,.07,.06,'sine',t+.025,this.fxBus,1600);break;
        case 7:this.vocal(260,.115,.23,1000,t,190);this.vocal(285,.09,.18,1050,t+.105,220);break;
      }
    }
    musicStep(index,time){
      const beat=60/132/4,bar=Math.floor(index/16)%16,step=index%16,chord=chords[bar%8];
      const melody=melodies[bar%8][step];
      if(melody){const n=melody+(bar>=8&&step===0?12:0);this.note(hz(n),beat*1.8,.105,'triangle',time,this.musicBus);this.note(hz(n+12),beat*1.1,.018,'sine',time,this.musicBus);}
      if(step%4===0)this.note(hz(chord[0]-12+(step===8?12:0)),beat*2.6,.15,'sine',time,this.musicBus);
      if(step%2===1)this.note(hz(chord[(step>>1)%3]+12),beat*1.35,.045,'sine',time,this.musicBus);
      if(step===0||step===8)this.note(125,.12,.16,'sine',time,this.musicBus,43);
      if(step===4||step===12){this.hiss(.045,.075,1900,time,this.musicBus);this.note(190,.05,.035,'triangle',time,this.musicBus,90);}
      if(step%2===0)this.hiss(.024,.024,6200,time,this.musicBus,'highpass');
      this.stats.musicSteps++;
    }
    syncMusic(){
      if(!this.context)return;
      const active=this.music&&!this.blocked&&this.volumes.master>0&&this.volumes.bgm>0&&this.context.state==='running';
      if(!active){if(this.timer){clearInterval(this.timer);this.timer=null;}for(const voice of this.musicVoices){try{voice.stop();}catch{}}return;}
      if(this.timer)return;
      this.nextBeat=this.context.currentTime+.045;
      const schedule=()=>{
        if(this.nextBeat<this.context.currentTime-.1)this.nextBeat=this.context.currentTime+.02;
        while(this.nextBeat<this.context.currentTime+.16){this.musicStep(this.stepIndex++,this.nextBeat);this.nextBeat+=60/132/4;}
      };
      schedule();this.timer=setInterval(schedule,25);
    }
    get state(){return {music:this.music,effects:this.effects,volumes:{...this.volumes},unlocked:!!this.context&&this.context.state==='running',blocked:this.blocked,musicPlaying:!!this.timer,voices:this.voices.size,musicSteps:this.stats.musicSteps,effectCounts:{...this.stats.effects},maxVoices:this.stats.maxVoices};}
  }
  root.TurtleAudio=TurtleAudio;
})(typeof window!=='undefined'?window:globalThis);
