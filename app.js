let DATA=null, POEMS=[];
const SECTIONS = [
  {id:1,name:'壱の巻',range:'第一首〜第十首',from:1,to:10},
  {id:2,name:'弐の巻',range:'第十一首〜第二十首',from:11,to:20},
  {id:3,name:'参の巻',range:'第二十一首〜第三十首',from:21,to:30},
  {id:4,name:'四の巻',range:'第三十一首〜第四十首',from:31,to:40},
  {id:5,name:'通し',range:'第一首〜第四十首',from:1,to:40}
];
const MODES = [
  {id:'view',stage:1,name:'閲覧',desc:'一首ずつ読んで覚える',pass:'最後の首まで読む'},
  {id:'choice',stage:2,name:'下の句選び',desc:'上の句に続く下の句を4択で選ぶ',pass:'正答率90%以上'},
  {id:'order',stage:4,name:'並べ替え',desc:'文節の札を正しい順に取る',pass:'ミス2回以内'},
  {id:'chain',stage:5,name:'連鎖',desc:'最初の首から順に組み続ける（ミス3回で終了）',pass:'最後までノーミス'},
  {id:'recall',stage:6,name:'抜き打ち',desc:'順不同の上の句から、下の句を思い出す',pass:'すべて「言えた」'}
];
const KANJI = ['〇','一','二','三','四','五','六','七','八','九','十'];
const STAGE_KANJI = {1:'一',2:'二',4:'四',5:'五',6:'六'};
const INTERVAL = [0,0,1,3,7,14];
const LV_NAME = ['未学習','学習中','学習中','学習中','定着','習得'];
let TITLES = [];
function ruleTest(r){
  switch(r.type){
    case 'played': return S.history.length>0;
    case 'countLv': return countLv(r.level)>=r.count;
    case 'passed': return r.all.every(x=>passed(x[0],x[1]));
    case 'streak': return streak()>=r.days;
    case 'chainRun': return Object.values(S.chainBest).some(v=>v>=r.min);
    default: return false;
  }
}
const KEY = 'hyakusokuden.v1';

function defState(){return {poems:{},joints:{},stages:{},best:{},chainBest:{},days:[],titles:[],history:[],exportedAt:null,
  settings:{ruby:true,vertical:true,sound:true,mix:2,lock:true,similar:false}}}
function load(){
  try{const r=localStorage.getItem(KEY);if(r){const o=JSON.parse(r);const d=defState();return Object.assign(d,o,{settings:Object.assign(d.settings,o.settings||{})});}}catch(e){}
  return defState();
}
let S = load();
function save(){try{localStorage.setItem(KEY,JSON.stringify(S));}catch(e){}}

/* ---------- 日付・習熟度 ---------- */
function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function addDays(s,n){const [y,m,d]=s.split('-').map(Number);const t=new Date(y,m-1,d+n);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');}
function pget(n){return S.poems[n]||{lv:0,ok:0,ng:0,last:null,due:null};}
function setLv(n,lv){const p=pget(n);p.lv=lv;p.last=today();p.due=addDays(today(),INTERVAL[lv]);S.poems[n]=p;}
function grade(n,result,cap){ // result: 'ok' | 'keep' | 'ng'
  const p=pget(n);
  if(result==='ok'){p.ok++;S.poems[n]=p;setLv(n,p.lv<cap?Math.max(p.lv+1,1):p.lv);}
  else if(result==='keep'){S.poems[n]=p;setLv(n,Math.max(p.lv,1));}
  else {p.ng++;S.poems[n]=p;setLv(n,1);}
}
function countLv(min){let c=0;for(let n=1;n<=40;n++)if(pget(n).lv>=min)c++;return c;}
function dueList(){const t=today();const r=[];for(let n=1;n<=40;n++){const p=pget(n);if(p.lv>=1&&p.due&&p.due<=t)r.push(n);}return r;}
function markDay(){const t=today();if(!S.days.includes(t))S.days.push(t);}
function streak(){let d=today();if(!S.days.includes(d))d=addDays(d,-1);let c=0;while(S.days.includes(d)){c++;d=addDays(d,-1);}return c;}
function passed(sec,stage){return !!(S.stages[sec]&&S.stages[sec][stage]);}
function setPassed(sec,stage){S.stages[sec]=S.stages[sec]||{};const was=!!S.stages[sec][stage];S.stages[sec][stage]=true;return !was;}
function unlocked(sec){
  if(!S.settings.lock||sec===1)return true;
  if(sec===5)return [1,2,3,4].every(k=>passed(k,6));
  return passed(sec-1,4);
}
function lockReason(sec){return sec===5?'四つの巻すべてを段階6まで合格すると解放':SECTIONS[sec-2].name+'の並べ替えに合格すると解放';}
function checkTitles(){const got=[];for(const t of TITLES){if(!S.titles.includes(t.id)&&t.test(S)){S.titles.push(t.id);got.push(t);}}return got;}
function currentTitle(){let last=null;for(const t of TITLES)if(S.titles.includes(t.id))last=t;return last;}

/* ---------- 表示部品 ---------- */
function esc(s){return String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function plain(c){return c.replace(/\{([^|}]+)\|[^}]+\}/g,'$1');}
function chunkHTML(c){const ruby=S.settings.ruby;return esc(c).replace(/\{([^|}]+)\|([^}]+)\}/g,(m,a,b)=>ruby?'<ruby>'+a+'<rt>'+b+'</rt></ruby>':a);}
function kuHTML(chunks){return chunks.map(chunkHTML).join('');}
function num(n){if(n<=10)return KANJI[n];const t=Math.floor(n/10),o=n%10;return (t>1?KANJI[t]:'')+'十'+(o?KANJI[o]:'');}
function poemHTML(p,o={}){
  const v=o.vertical??S.settings.vertical;
  const shimo=o.hide?'<span class="hidden-shimo">'+esc(p.shimo)+'</span>':kuHTML(p.shimoChunks);
  return '<div class="poem-wrap"><div class="poem '+(v?'v':'h')+'"><p class="ku kami">'+kuHTML(p.kamiChunks)+'</p><p class="ku shimo">'+(o.noShimo?'':shimo)+'</p></div></div>';
}
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function secPoems(sec){const s=SECTIONS[sec-1];const r=[];for(let n=s.from;n<=s.to;n++)r.push(n);return r;}
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>{t.hidden=true;},2200);}
let AC=null;
function tone(freqs,dur=0.09,type='sine'){
  if(!S.settings.sound)return;
  try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();let t=AC.currentTime;
    for(const f of freqs){const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.15,t+0.01);g.gain.exponentialRampToValueAtTime(0.0001,t+dur);o.connect(g).connect(AC.destination);o.start(t);o.stop(t+dur+0.02);t+=dur*0.9;}
  }catch(e){}
}
const sGood=()=>tone([660,880]),sBad=()=>{tone([180],0.16,'square');try{navigator.vibrate&&navigator.vibrate(40);}catch(e){}},sClear=()=>tone([523,659,784,1046],0.12);
function speak(p){try{const u=new SpeechSynthesisUtterance(p.speechKami.replace(/ /g,'')+'、'+p.speechShimo.replace(/ /g,''));u.lang='ja-JP';u.rate=0.8;speechSynthesis.cancel();speechSynthesis.speak(u);}catch(e){toast('この環境では読み上げが使えません');}}

/* ---------- 画面切替 ---------- */
const app=document.getElementById('app');
const tabs=document.getElementById('tabs');
let TAB='home', G=null;
tabs.addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(b){G=null;go(b.dataset.tab);}});
function go(tab,arg){TAB=tab;render(arg);window.scrollTo(0,0);}
function render(arg){
  const playing=!!G;
  tabs.hidden=playing;
  tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.tab===TAB||(TAB==='modes'&&b.dataset.tab==='study')));
  if(playing){app.className='wrap play';PLAY[G.mode].render();return;}
  app.className='wrap';
  ({home:vHome,study:vStudy,modes:vModes,list:vList,records:vRecords,settings:vSettings,result:vResult})[TAB](arg);
}

/* ---------- ホーム ---------- */
function levelBarHTML(){
  const c=[0,0,0,0,0,0];for(let n=1;n<=40;n++)c[pget(n).lv]++;
  const seg=[[5,'var(--lv5)'],[4,'var(--lv4)'],[3,'var(--lv3)'],[2,'var(--lv2)'],[1,'var(--lv1)']];
  return '<div class="levelbar">'+seg.map(([l,col])=>c[l]?'<i style="width:'+(c[l]/40*100)+'%;background:'+col+'"></i>':'').join('')+'</div>'+
  '<div class="legend"><span style="--c:var(--lv5)">習得 '+c[5]+'</span><span style="--c:var(--lv4)">定着 '+c[4]+'</span><span style="--c:var(--lv2)">学習中 '+(c[1]+c[2]+c[3])+'</span><span style="--c:var(--lv0)">未学習 '+c[0]+'</span></div>';
}
function secCardHTML(s){
  const lock=!unlocked(s.id);
  const pips=secPoems(s.id).length===10?secPoems(s.id).map(n=>'<i style="background:var(--lv'+pget(n).lv+')"></i>').join(''):'';
  const badges=MODES.map(m=>'<b class="'+(passed(s.id,m.stage)?'on':'')+'">'+STAGE_KANJI[m.stage]+'</b>').join('');
  return '<button class="card sec'+(lock?' locked':'')+'" data-sec="'+s.id+'"'+(lock?' aria-disabled="true"':'')+'>'+
    '<div><div class="nm">'+s.name+'</div><div class="small muted">'+(lock?lockReason(s.id):s.range)+'</div></div>'+
    '<div class="stagebadges" aria-label="合格した段階">'+(lock?'<span class="small muted">未解放</span>':badges)+'</div>'+
    (pips?'<div class="pips">'+pips+'</div>':'')+'</button>';
}
function bindSecs(){app.querySelectorAll('[data-sec]').forEach(b=>b.addEventListener('click',()=>{const id=+b.dataset.sec;if(!unlocked(id)){toast(lockReason(id));return;}go('modes',id);}));}
function vHome(){
  const t=currentTitle(), due=dueList();
  const needExport=S.history.length>0&&(!S.exportedAt||addDays(S.exportedAt,30)<=today());
  app.innerHTML='<div class="stack">'+
   '<div class="row between"><div><div class="eyebrow">無外流居合（自鏡流居合）</div><h1>百足伝</h1></div>'+(t?'<span class="title-chip">'+t.name+'</span>':'<span class="small muted">称号なし</span>')+'</div>'+
   '<div class="card stats"><div class="stat"><b>'+streak()+'</b><span>連続稽古日数</span></div><div class="stat"><b>'+S.days.length+'</b><span>稽古した日</span></div><div class="stat"><b>'+countLv(5)+'<small class="muted" style="font-size:.7em">/40</small></b><span>習得した首</span></div></div>'+
   '<div class="card stack" style="gap:8px"><div class="row between"><h2>四十首の習熟</h2></div>'+levelBarHTML()+'</div>'+
   '<div class="card stack" style="gap:8px"><div class="row between"><h2>今日の復習</h2><span class="small muted">'+(due.length?due.length+'首':'なし')+'</span></div>'+
     '<p class="small muted" style="margin:0">'+(due.length?'出題日が来た首を、抜き打ちの形で復習します。':'復習の出題日が来た首はありません。学習を進めると、ここに出てきます。')+'</p>'+
     '<button class="btn primary block" id="review"'+(due.length?'':' disabled')+'>復習を始める</button></div>'+
   (needExport?'<div class="card small">記録の書き出しから30日以上たっています（または未実施）。設定の「記録の書き出し」で控えを取っておくと安心です。</div>':'')+
   '<h2 style="margin-top:6px">巻を選ぶ</h2>'+SECTIONS.map(secCardHTML).join('')+'</div>';
  bindSecs();
  const rv=document.getElementById('review');if(rv)rv.addEventListener('click',()=>startGame('recall',0,{review:true}));
}
function vStudy(){
  app.innerHTML='<div class="stack"><h1>学習</h1><p class="small muted" style="margin:0">巻を選ぶと、段階ごとのモードに進みます。丸の数字は合格済みの段階です。</p>'+SECTIONS.map(secCardHTML).join('')+'</div>';
  bindSecs();
}
function vModes(sec){
  const s=SECTIONS[sec-1];G=null;
  app.innerHTML='<div class="stack"><div class="row"><button class="btn ghost" id="back">‹ 戻る</button></div>'+
   '<div><div class="eyebrow">'+s.range+'</div><h1>'+s.name+'</h1></div>'+
   MODES.map(m=>{const best=S.best[m.id+':'+sec];const extra=m.id==='chain'&&S.chainBest[sec]?'最長 '+S.chainBest[sec]+'首':'';
     return '<button class="card mode'+(passed(sec,m.stage)?' passed':'')+'" data-mode="'+m.id+'"><span class="num">'+STAGE_KANJI[m.stage]+'</span><span class="nm">'+m.name+'</span><span class="best">'+(best!=null?'最高 '+best+'点':'')+(extra?'<br>'+extra:'')+'</span><span class="small muted">'+m.desc+'<br>合格：'+m.pass+(passed(sec,m.stage)?'（合格済み）':'')+'</span></button>';}).join('')+
   '<p class="small muted">段階三（穴埋め）は第2版で追加します。</p></div>';
  document.getElementById('back').addEventListener('click',()=>go('study'));
  app.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>startGame(b.dataset.mode,sec)));
}

/* ---------- ゲーム共通 ---------- */
function startGame(mode,sec,opt={}){
  G={mode,sec,score:0,combo:0,maxCombo:0,i:0,log:[],opt,startAt:Date.now()};
  PLAY[mode].init(opt);
  render();window.scrollTo(0,0);
}
function addScore(base,elapsedMs){
  G.combo++;G.maxCombo=Math.max(G.maxCombo,G.combo);
  const mult=G.combo>=10?2:G.combo>=5?1.5:1;
  let bonus=0;if(elapsedMs!=null){const s=elapsedMs/1000;bonus=s<=3?5:s>=10?0:Math.round(5*(10-s)/7);}
  G.score+=Math.round(base*mult)+bonus;
}
function breakCombo(){G.combo=0;}
function secLabel(){return G.opt.review?'今日の復習':SECTIONS[G.sec-1].name;}
function playbarHTML(cur,total,extra=''){
  const m=MODES.find(x=>x.id===G.mode);
  return '<div class="playbar"><button class="x" id="quit" aria-label="やめる">×</button><div class="meta"><b>'+(G.opt.review?'復習':m.name)+'</b><div>'+secLabel()+'　'+cur+' / '+total+'</div></div>'+
   (G.mode==='view'?'':'<div class="score"><b>'+G.score+'</b><span class="small muted"> 点</span><div class="combo">'+(G.combo>=2?G.combo+' 連続':'')+'</div></div>')+extra+'</div>'+
   '<div class="progress"><i style="width:'+(total?cur/total*100:0)+'%"></i></div>';
}
function bindQuit(){document.getElementById('quit').addEventListener('click',()=>{const sec=G.sec,rv=G.opt.review;G=null;if(rv)go('home');else go('modes',sec);});}
function finish(summary){
  const sec=G.sec, mode=G.mode, review=G.opt.review;
  markDay();
  S.history.unshift({date:today(),mode,sec:review?0:sec,score:G.score});S.history=S.history.slice(0,100);
  let newBest=false;
  if(mode!=='view'&&!review){const k=mode+':'+sec;if(S.best[k]==null||G.score>S.best[k]){newBest=S.best[k]!=null||G.score>0;S.best[k]=G.score;}}
  let stageNew=false;
  if(summary.pass&&!review){stageNew=setPassed(sec,MODES.find(m=>m.id===mode).stage);}
  const titles=checkTitles();
  save();
  const res=Object.assign({mode,sec,review,score:G.score,maxCombo:G.maxCombo,newBest,stageNew,titles},summary);
  G=null;go('result',res);
  if(summary.pass||titles.length)sClear();
}
function vResult(r){
  const m=MODES.find(x=>x.id===r.mode);
  const unlockedNext=r.stageNew&&m.stage===4&&r.sec<4&&S.settings.lock;
  app.innerHTML='<div class="stack"><div class="eyebrow">'+(r.review?'今日の復習':SECTIONS[r.sec-1].name+'・'+m.name)+'</div><h1>結果</h1>'+
   (r.mode==='view'?'':'<div class="card result-big"><b>'+r.score+'</b> 点'+(r.newBest?'<div class="newtitle">自己ベスト更新</div>':'')+'<div class="small muted">最大 '+r.maxCombo+' 連続正解</div></div>')+
   '<div class="card stack" style="gap:6px">'+r.lines.map(l=>'<div>'+l+'</div>').join('')+
     (r.review?'':(r.pass?'<div><span class="stamp">合格</span> '+(r.stageNew?'段階'+STAGE_KANJI[m.stage]+'に合格しました。':'（合格済み）')+'</div>':(r.mode==='view'?'':'<div class="small muted">合格条件：'+m.pass+'</div>')))+
     (unlockedNext?'<div class="newtitle">'+SECTIONS[r.sec].name+'が解放されました</div>':'')+'</div>'+
   (r.titles.length?'<div class="card">'+r.titles.map(t=>'<div class="newtitle">称号「'+t.name+'」を得ました</div><div class="small muted">'+t.from+'より。'+t.cond+'</div>').join('')+'</div>':'')+
   (r.weak&&r.weak.length?'<div class="card"><h3>見直したい首</h3>'+r.weak.map(n=>'<div class="small">第'+num(n)+'首　'+esc(POEMS[n-1].kami)+'</div>').join('')+'</div>':'')+
   '<div class="row" style="gap:10px"><button class="btn primary" id="again" style="flex:1">もう一度</button><button class="btn" id="tomodes" style="flex:1">'+(r.review?'ホームへ':'モード選択へ')+'</button></div></div>';
  document.getElementById('again').addEventListener('click',()=>startGame(r.mode,r.sec,r.review?{review:true}:{}));
  document.getElementById('tomodes').addEventListener('click',()=>r.review?go('home'):go('modes',r.sec));
}

/* ---------- 各モード ---------- */
const PLAY={};

/* 閲覧 */
PLAY.view={
  init(opt){G.list=secPoems(G.sec);G.i=opt.start?G.list.indexOf(opt.start):0;G.hide=false;if(G.i<0)G.i=0;},
  render(){
    const n=G.list[G.i],p=POEMS[n-1],lv=pget(n).lv;
    if(lv===0)setLv(n,1),save();
    const notes=p.notes.map(x=>x.target+'（'+x.note+'）').join('、');
    app.innerHTML=playbarHTML(G.i+1,G.list.length)+
     '<div class="card"><div class="row between"><span class="label">'+p.label+'</span><span class="small muted">'+LV_NAME[pget(n).lv]+'</span></div>'+poemHTML(p,{hide:G.hide})+(notes?'<div class="notes">注記：'+notes+'</div>':'')+'</div>'+
     '<div class="row" style="margin-top:12px;gap:8px"><button class="btn" id="hide" style="flex:1">'+(G.hide?'下の句を見せる':'下の句を隠す')+'</button><button class="btn" id="say" style="flex:1">読み上げ</button></div>'+
     '<div class="bottom-actions"><div class="row" style="gap:10px"><button class="btn" id="prev" style="flex:1"'+(G.i===0?' disabled':'')+'>‹ 前の首</button><button class="btn primary" id="next" style="flex:1">'+(G.i===G.list.length-1?'読み終える':'次の首 ›')+'</button></div><p class="small muted" style="text-align:center;margin:6px 0 0">左右にスワイプでもめくれます</p></div>';
    bindQuit();
    document.getElementById('hide').onclick=()=>{G.hide=!G.hide;render();};
    document.getElementById('say').onclick=()=>speak(p);
    document.getElementById('prev').onclick=()=>{if(G.i>0){G.i--;render();}};
    document.getElementById('next').onclick=()=>PLAY.view.next();
    const card=app.querySelector('.card');let x0=null;
    card.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;},{passive:true});
    card.addEventListener('touchend',e=>{if(x0==null)return;const dx=e.changedTouches[0].clientX-x0;x0=null;
      // ボタン（次の首 ›）と同じ向き：指を左へ払うと次の首、右へ払うと前の首
      if(dx<-50)PLAY.view.next();else if(dx>50&&G.i>0){G.i--;render();}});
  },
  next(){if(G.i<G.list.length-1){G.i++;render();}else finish({pass:true,lines:[G.list.length+'首を読みました。']});}
};

/* 下の句選び */
function similarPoems(n,pool){
  const first=plain(POEMS[n-1].kamiChunks[0]);
  const pair={32:33,33:32}[n];
  return pool.filter(m=>m!==n&&(plain(POEMS[m-1].kamiChunks[0])===first||m===pair));
}
PLAY.choice={
  init(){const pool=secPoems(G.sec);G.pool=pool;G.queue=shuffle(pool).slice(0,G.sec===5?20:10);G.correct=0;G.answered=null;this.makeQ();},
  makeQ(){
    const n=G.queue[G.i];
    let sim=shuffle(similarPoems(n,G.pool)).slice(0,2);
    const others=shuffle(G.pool.filter(m=>m!==n&&!sim.includes(m)));
    const wrong=sim.concat(others).slice(0,3);
    G.opts=shuffle([n].concat(wrong));G.answered=null;G.t0=Date.now();
  },
  render(){
    const n=G.queue[G.i],p=POEMS[n-1];
    app.innerHTML=playbarHTML(G.i,G.queue.length)+
     '<div class="card"><div class="label small">'+p.label+'　上の句</div>'+poemHTML(p,{vertical:false,noShimo:true})+'</div>'+
     '<p class="small muted">続く下の句を選んでください</p><div class="opts">'+
     G.opts.map(m=>{let cls='';if(G.answered!=null){if(m===n)cls=' good';else if(m===G.answered)cls=' bad';}
       return '<button class="opt'+cls+'" data-o="'+m+'"'+(G.answered!=null?' disabled':'')+'>'+kuHTML(POEMS[m-1].shimoChunks)+'</button>';}).join('')+'</div>'+
     (G.answered!=null&&G.answered!==n?'<div class="bottom-actions"><button class="btn primary block" id="nx">次へ</button></div>':'');
    bindQuit();
    app.querySelectorAll('[data-o]').forEach(b=>b.addEventListener('click',()=>this.answer(+b.dataset.o)));
    const nx=document.getElementById('nx');if(nx)nx.onclick=()=>this.advance();
  },
  answer(m){
    if(G.answered!=null)return;
    const n=G.queue[G.i];G.answered=m;
    if(m===n){G.correct++;addScore(10,Date.now()-G.t0);grade(n,'ok',3);sGood();G.log.push({n,ok:true});render();setTimeout(()=>this.advance(),800);}
    else{breakCombo();grade(n,'ng',3);sBad();G.log.push({n,ok:false});render();}
    save();
  },
  advance(){
    if(!G||G.mode!=='choice')return;
    G.i++;if(G.i>=G.queue.length){const rate=G.correct/G.queue.length;
      finish({pass:rate>=0.9,lines:['正解 '+G.correct+' / '+G.queue.length+'（正答率 '+Math.round(rate*100)+'%）'],weak:G.log.filter(x=>!x.ok).map(x=>x.n)});return;}
    this.makeQ();render();
  }
};

/* 並べ替え・連鎖の共通（札） */
function makeTiles(n,pool){
  const p=POEMS[n-1];const all=p.kamiChunks.concat(p.shimoChunks);
  const own=new Set(all.map(plain));
  const cand=[];for(const m of shuffle(pool.length>1?pool:secPoems(5))){if(m===n)continue;for(const c of POEMS[m-1].kamiChunks.concat(POEMS[m-1].shimoChunks)){if(!own.has(plain(c))&&!cand.some(x=>plain(x)===plain(c)))cand.push(c);}}
  const extra=shuffle(cand).slice(0,S.settings.mix);
  return {answer:all,kamiLen:p.kamiChunks.length,tiles:shuffle(all.concat(extra)).map((c,i)=>({id:i,c,used:false})),k:0,miss:0,firstTry:null};
}
function tilesHTML(T){
  let built='';
  T.answer.forEach((c,i)=>{if(i===T.kamiLen)built+='<span class="br"></span>　';built+=i<T.k?'<span class="done">'+chunkHTML(c)+'</span>':'';});
  if(T.k===0)built='<span class="slot">ここに札が並びます</span>';
  return '<div class="built" aria-live="polite">'+built+'</div><div class="tiles">'+T.tiles.map(t=>'<button class="tile'+(t.used?' used':'')+'" data-t="'+t.id+'"'+(t.used?' tabindex="-1"':'')+'>'+chunkHTML(t.c)+'</button>').join('')+'</div>';
}
function tapTile(T,id,el){ // returns 'ok' | 'bad' | 'done'
  const t=T.tiles.find(x=>x.id===id);if(!t||t.used)return null;
  if(plain(t.c)===plain(T.answer[T.k])){
    if(T.k===0&&T.firstTry==null)T.firstTry=true;
    t.used=true;T.k++;sGood();return T.k>=T.answer.length?'done':'ok';
  }
  if(T.k===0&&T.firstTry==null)T.firstTry=false;
  T.miss++;sBad();el.classList.remove('bad');void el.offsetWidth;el.classList.add('bad');return 'bad';
}

/* 並べ替え */
PLAY.order={
  init(){const pool=secPoems(G.sec);G.pool=pool;G.queue=shuffle(pool).slice(0,10);G.totalMiss=0;this.next();},
  next(){G.T=makeTiles(G.queue[G.i],G.pool);G.t0=Date.now();},
  render(){
    const n=G.queue[G.i],p=POEMS[n-1];
    app.innerHTML=playbarHTML(G.i,G.queue.length)+
     '<div class="row between"><span class="label">'+p.label+'</span><span class="small muted" id="missinfo">この巻のミス '+G.totalMiss+'（合格は2回まで）</span></div>'+tilesHTML(G.T);
    bindQuit();
    app.querySelectorAll('[data-t]').forEach(b=>b.addEventListener('click',()=>{
      const r=tapTile(G.T,+b.dataset.t,b);if(r==null)return;
      if(r==='bad'){G.totalMiss++;breakCombo();document.getElementById('missinfo').textContent='この巻のミス '+G.totalMiss+'（合格は2回まで）';return;}
      if(r==='done'){this.done();return;}
      render();
    }));
  },
  done(){
    const n=G.queue[G.i],clean=G.T.miss===0;
    if(clean)addScore(10,Date.now()-G.t0);
    grade(n,clean?'ok':'ng',4);G.log.push({n,ok:clean});save();
    render();
    setTimeout(()=>{if(!G||G.mode!=='order')return;G.i++;
      if(G.i>=G.queue.length){finish({pass:G.totalMiss<=2,lines:['ミス '+G.totalMiss+' 回','ノーミスで組めた首 '+G.log.filter(x=>x.ok).length+' / '+G.queue.length],weak:G.log.filter(x=>!x.ok).map(x=>x.n)});return;}
      this.next();render();},650);
  }
};

/* 連鎖 */
PLAY.chain={
  init(){G.pool=secPoems(G.sec);G.queue=G.pool.slice();G.lives=3;G.totalMiss=0;G.run=0;G.bestRun=0;this.next();},
  next(){G.T=makeTiles(G.queue[G.i],G.pool);G.t0=Date.now();},
  render(){
    const n=G.queue[G.i],p=POEMS[n-1];
    app.innerHTML=playbarHTML(G.i,G.queue.length,'')+
     '<div class="row between"><span class="label">'+p.label+(G.i>0?'<span class="small muted">（'+POEMS[G.queue[G.i-1]-1].label+'の次）</span>':'')+'</span><span class="lives" aria-label="残り '+G.lives+'">'+'●'.repeat(G.lives)+'<span class="muted">'+'○'.repeat(3-G.lives)+'</span></span></div>'+tilesHTML(G.T);
    bindQuit();
    app.querySelectorAll('[data-t]').forEach(b=>b.addEventListener('click',()=>{
      const r=tapTile(G.T,+b.dataset.t,b);if(r==null)return;
      if(r==='bad'){G.lives--;G.totalMiss++;breakCombo();G.run=0;
        if(G.lives<=0){this.end(false);return;}
        app.querySelector('.lives').innerHTML='●'.repeat(G.lives)+'<span class="muted">'+'○'.repeat(3-G.lives)+'</span>';return;}
      if(r==='done'){this.done();return;}
      render();
    }));
  },
  done(){
    const n=G.queue[G.i],clean=G.T.miss===0;
    if(clean){addScore(10,Date.now()-G.t0);G.run++;G.bestRun=Math.max(G.bestRun,G.run);}
    if(G.i>0){const key=String(G.queue[G.i-1]);const j=S.joints[key]||{ok:0,ng:0};G.T.firstTry?j.ok++:j.ng++;S.joints[key]=j;}
    grade(n,clean?'ok':'ng',4);G.log.push({n,ok:clean});save();
    render();
    setTimeout(()=>{if(!G||G.mode!=='chain')return;G.i++;if(G.i>=G.queue.length){this.end(true);return;}this.next();render();},600);
  },
  end(completed){
    const reached=G.log.length;
    S.chainBest[G.sec]=Math.max(S.chainBest[G.sec]||0,G.bestRun);
    finish({pass:completed&&G.totalMiss===0,lines:[completed?'最後の首まで組み終えました。':'ミスが3回になり、'+(G.queue[G.i]?POEMS[G.queue[G.i]-1].label+'で':'')+'終了しました。','組めた首 '+reached+' / '+G.queue.length+'、ノーミスでの最長 '+G.bestRun+'首'],weak:G.log.filter(x=>!x.ok).map(x=>x.n).concat(completed?[]:[G.queue[G.i]]).filter(Boolean)});
  }
};

/* 抜き打ち（今日の復習も同じ画面） */
PLAY.recall={
  init(opt){
    let list=opt.review?dueList():secPoems(G.sec);
    list=shuffle(list);
    if(S.settings.similar){const key=n=>plain(POEMS[n-1].kamiChunks[0]);const groups={};list.forEach(n=>{(groups[key(n)]=groups[key(n)]||[]).push(n);});list=shuffle(Object.values(groups)).flat();}
    G.queue=list;G.shown=false;G.results={ok:0,keep:0,ng:0};G.limit=10;
  },
  render(){
    if(!G.queue.length){G=null;go('home');toast('復習する首がありません');return;}
    const n=G.queue[G.i],p=POEMS[n-1];
    app.innerHTML=playbarHTML(G.i,G.queue.length)+
     '<div class="card"><div class="row between"><span class="label small">'+p.label+'</span><span class="small muted">'+(G.shown?'答え':'下の句を思い浮かべてください')+'</span></div>'+
     (G.shown?'':'<div class="timer"><i id="tm"></i></div>')+poemHTML(p,{noShimo:!G.shown})+'</div>'+
     '<div class="bottom-actions">'+(G.shown?
       '<div class="grade"><button class="btn ok" data-g="ok"><b>言えた</b></button><button class="btn mid" data-g="keep"><b>一部間違えた</b></button><button class="btn ng" data-g="ng"><b>言えなかった</b></button></div>':
       '<button class="btn primary block" id="show">答えを見る</button>')+'</div>';
    bindQuit();
    if(!G.shown){
      G.t0=Date.now();const bar=document.getElementById('tm');
      bar.animate?bar.animate([{transform:'scaleX(1)'},{transform:'scaleX(0)'}],{duration:G.limit*1000,fill:'forwards'}):null;
      clearTimeout(G.timer);G.timer=setTimeout(()=>{if(G&&G.mode==='recall'&&!G.shown){G.shown=true;render();}},G.limit*1000);
      document.getElementById('show').onclick=()=>{clearTimeout(G.timer);G.shown=true;render();};
    }else{
      app.querySelectorAll('[data-g]').forEach(b=>b.addEventListener('click',()=>this.answer(b.dataset.g)));
    }
  },
  answer(g){
    const n=G.queue[G.i];G.results[g]++;
    if(g==='ok'){addScore(10,null);sGood();}else if(g==='keep'){breakCombo();G.score+=5;}else{breakCombo();sBad();}
    grade(n,g,5);G.log.push({n,ok:g==='ok'});save();
    G.i++;G.shown=false;
    if(G.i>=G.queue.length){const r=G.results;
      finish({pass:!G.opt.review&&r.keep===0&&r.ng===0,lines:['言えた '+r.ok+'　一部間違えた '+r.keep+'　言えなかった '+r.ng],weak:G.log.filter(x=>!x.ok).map(x=>x.n)});return;}
    render();
  }
};

/* ---------- 一覧 ---------- */
function vList(){
  app.innerHTML='<div class="stack"><h1>一覧</h1><div class="legend">'+[0,1,2,3,4,5].map(l=>'<span style="--c:var(--lv'+l+')">'+(l===0?'未学習':l===4?'定着':l===5?'習得':'学習中'+l)+'</span>').join('')+'</div>'+
   SECTIONS.slice(0,4).map(s=>'<div class="card stack" style="gap:8px"><div class="row between"><h2>'+s.name+'</h2><span class="small muted">'+s.range+'</span></div><div class="grid10">'+
     secPoems(s.id).map(n=>{const lv=pget(n).lv;return '<button class="cell l'+lv+'" style="background:var(--lv'+lv+')" data-p="'+n+'" aria-label="'+POEMS[n-1].label+' '+LV_NAME[lv]+'"><b>'+num(n)+'</b><span>'+esc(plain(POEMS[n-1].kamiChunks[0]))+'</span></button>';}).join('')+'</div></div>').join('')+
   '<p class="small muted">首を押すと、その首から閲覧できます。</p></div>';
  app.querySelectorAll('[data-p]').forEach(b=>b.addEventListener('click',()=>{const n=+b.dataset.p;const sec=Math.ceil(n/10);startGame('view',sec,{start:n});}));
}

/* ---------- 記録 ---------- */
function vRecords(){
  const rows=SECTIONS.map(s=>'<tr><td>'+s.name+'</td>'+MODES.filter(m=>m.id!=='view').map(m=>{const v=S.best[m.id+':'+s.id];return '<td class="n">'+(v!=null?v:'—')+'</td>';}).join('')+'</tr>').join('');
  const joints=Object.entries(S.joints).map(([k,v])=>({n:+k,...v,rate:v.ng/(v.ok+v.ng)})).filter(j=>j.ng>0).sort((a,b)=>b.rate-a.rate||b.ng-a.ng).slice(0,5);
  const weak=[];for(let n=1;n<=40;n++){const p=pget(n);if(p.ng>0)weak.push({n,...p});}weak.sort((a,b)=>(b.ng-b.ok)-(a.ng-a.ok));
  app.innerHTML='<div class="stack"><h1>記録</h1>'+
   '<div class="card stats"><div class="stat"><b>'+streak()+'</b><span>連続稽古日数</span></div><div class="stat"><b>'+S.days.length+'</b><span>稽古した日</span></div><div class="stat"><b>'+S.history.length+'</b><span>プレイ回数</span></div></div>'+
   '<div class="card"><h2>自己ベスト</h2><div style="overflow-x:auto"><table class="t"><thead><tr><th>巻</th>'+MODES.filter(m=>m.id!=='view').map(m=>'<th style="text-align:right">'+m.name+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div></div>'+
   '<div class="card"><h2>称号</h2>'+TITLES.map(t=>'<div class="ttl '+(S.titles.includes(t.id)?'on':'off')+'"><b>'+t.name+'</b><span>'+t.cond+'（'+t.from+'）</span></div>').join('')+'</div>'+
   '<div class="card"><h2>つなぎ目の弱点</h2><p class="small muted" style="margin:4px 0">連鎖で、次の首の最初の札を取り違えた割合が高い順です。</p>'+
     (joints.length?joints.map(j=>'<div class="small">'+POEMS[j.n-1].label+' → '+(POEMS[j.n]?POEMS[j.n].label:'')+'　取り違え '+j.ng+' / '+(j.ok+j.ng)+'</div>').join(''):'<div class="small muted">まだ記録がありません。</div>')+'</div>'+
   '<div class="card"><h2>苦手な首</h2>'+(weak.length?weak.slice(0,8).map(w=>'<div class="small">'+POEMS[w.n-1].label+'　正解 '+w.ok+'・誤り '+w.ng+'　'+LV_NAME[w.lv]+'</div>').join(''):'<div class="small muted">まだ記録がありません。</div>')+'</div></div>';
}

/* ---------- 設定 ---------- */
function vSettings(){
  const st=S.settings;
  const sw=(id,label,on,note)=>'<div class="set"><label for="'+id+'">'+label+(note?'<div class="small muted">'+note+'</div>':'')+'</label><input type="checkbox" class="switch" id="'+id+'"'+(on?' checked':'')+'></div>';
  app.innerHTML='<div class="stack"><h1>設定</h1><div class="card">'+
   sw('s-ruby','ふりがなを表示',st.ruby)+sw('s-vert','歌を縦書きで表示',st.vertical,'閲覧と抜き打ちに適用')+sw('s-sound','効果音',st.sound)+
   sw('s-lock','巻の解放制',st.lock,'切ると、すべての巻をすぐに選べます')+sw('s-sim','抜き打ちで似た出だしを続けて出す',st.similar,'「稽古には」「兵法は」「我流を」など')+
   '<div class="set"><label for="s-mix">並べ替え・連鎖の混ぜ札<div class="small muted">ほかの首の文節を混ぜる数</div></label><select id="s-mix">'+[0,2,3].map(v=>'<option value="'+v+'"'+(st.mix===v?' selected':'')+'>'+(v?v+'枚':'なし')+'</option>').join('')+'</select></div></div>'+
   '<div class="card stack" style="gap:8px"><h2>記録の書き出し</h2><p class="small muted" style="margin:0">下の文字列をコピーして、メモやファイルに保存してください。'+(S.exportedAt?'前回：'+S.exportedAt:'まだ書き出していません。')+'</p><textarea id="exp" readonly>'+esc(JSON.stringify(S))+'</textarea><button class="btn" id="copy">コピーする</button></div>'+
   '<div class="card stack" style="gap:8px"><h2>記録の読み込み</h2><p class="small muted" style="margin:0">書き出した文字列を貼り付けて読み込みます。いまの記録は置き換わります。</p><textarea id="imp" placeholder="ここに貼り付け"></textarea><button class="btn" id="doimp">読み込む</button></div>'+
   '<div class="card stack" style="gap:8px"><h2>記録の消去</h2><p class="small muted" style="margin:0">学習記録・称号・自己ベストをすべて消します。設定は残ります。</p><button class="btn" id="reset">消去する…</button><div id="resetc" hidden><div class="row"><button class="btn" id="reset-yes" style="border-color:var(--shu);color:var(--shu)">本当に消去する</button><button class="btn ghost" id="reset-no">やめる</button></div></div></div>'+
   '<p class="small muted">歌データ：'+esc(DATA.source)+'（'+DATA.version+'版）。記録はこのiPhoneの中にだけ保存され、外部には送られません。</p></div>';
  const bind=(id,key)=>document.getElementById(id).addEventListener('change',e=>{st[key]=e.target.checked;save();toast('設定を保存しました');});
  bind('s-ruby','ruby');bind('s-vert','vertical');bind('s-sound','sound');bind('s-lock','lock');bind('s-sim','similar');
  document.getElementById('s-mix').addEventListener('change',e=>{st.mix=+e.target.value;save();toast('設定を保存しました');});
  document.getElementById('copy').addEventListener('click',()=>{
    const ta=document.getElementById('exp');S.exportedAt=today();save();ta.value=JSON.stringify(S);
    const ok=()=>toast('コピーしました');
    try{navigator.clipboard.writeText(ta.value).then(ok,()=>{ta.select();toast('選択しました。長押しでコピーしてください');});}catch(e){ta.select();toast('選択しました。長押しでコピーしてください');}
  });
  document.getElementById('doimp').addEventListener('click',()=>{
    try{const o=JSON.parse(document.getElementById('imp').value);if(!o||typeof o.poems!=='object')throw 0;const d=defState();S=Object.assign(d,o,{settings:Object.assign(d.settings,o.settings||{})});save();toast('読み込みました');go('home');}
    catch(e){toast('読み込めませんでした。書き出した文字列をそのまま貼り付けてください');}
  });
  document.getElementById('reset').addEventListener('click',()=>{document.getElementById('resetc').hidden=false;});
  document.getElementById('reset-no').addEventListener('click',()=>{document.getElementById('resetc').hidden=true;});
  document.getElementById('reset-yes').addEventListener('click',()=>{const keep=S.settings;S=defState();S.settings=keep;save();toast('記録を消去しました');go('home');});
}

async function boot(){
  try{
    const [d,t]=await Promise.all([fetch('data/poems.json').then(r=>r.json()),fetch('data/titles.json').then(r=>r.json())]);
    DATA=d;POEMS=d.poems;TITLES=t.titles.map(x=>Object.assign({},x,{test:()=>ruleTest(x.rule)}));
    go('home');
  }catch(e){app.innerHTML='<div class="card">歌データを読み込めませんでした。通信できる状態で、もう一度開いてください。</div>';}
  if('serviceWorker' in navigator){navigator.serviceWorker.register('sw.js').catch(()=>{});}
}
boot();
