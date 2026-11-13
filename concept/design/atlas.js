const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const num = value => Number(value).toLocaleString('ru-RU');
const btn = (act,label,cls='light',disabled=false) => '<button class="btn '+cls+'" data-act="'+act+'" '+(disabled?'disabled':'')+'>'+label+'</button>';
const jump = (id,label=VIEWS[id].title) => '<a class="jump" href="#'+id+'">'+label+' <span>↗</span></a>';
const tile = (act,title,sub='',icon='→',selected=false) => '<button data-act="'+act+'" class="tile '+(selected?'selected':'')+'"><span><strong>'+title+'</strong><small>'+sub+'</small></span><b>'+icon+'</b></button>';
const line = (a,b) => '<div class="listline"><span>'+a+'</span><b>'+b+'</b></div>';
const seg = (prefix,items,active) => '<div class="seg">'+items.map(([id,label])=>'<button data-act="'+prefix+':'+id+'" class="'+(id===active?'active':'')+'">'+label+'</button>').join('')+'</div>';
const stack = html => '<div class="stack">'+html+'</div>';
const notice = message => '<p class="notice">'+message+'</p>';
const progress = val => '<div class="progress"><i style="width:'+val+'%"></i></div>';
const eyes = '<i class="eyes" aria-hidden="true"></i>';
const back = '<span class="back">'+eyes+'</span>';
const face = id => id<4 ? '<span class="face f'+id+'"><i class="portrait"></i></span>' : '<span class="face other" style="--tone:'+['#ffcc6d','#c3ddab','#ffb5c7','#d0bded'][id%4]+'">'+NAMES[id][0]+'</span>';
const poster = (title,sub='',color='',art=back) => '<div class="poster '+color+'"><strong>'+title+'<small>'+sub+'</small></strong>'+art+'</div>';
const card = (c,act='',selected=false,large=false) => {
  const tag=act?'button':'span', name=RANKS[rankOf(c)]+SUITS[c%4];
  return '<'+tag+' class="card '+([1,2].includes(c%4)?'red ':'')+(selected?'selected ':'')+(large?'largecard flash':'')+'" data-pip="'+SUITS[c%4]+'" '+(act?'data-act="'+act+'" aria-pressed="'+selected+'" aria-label="'+name+'"':'')+'><b>'+RANKS[rankOf(c)]+'</b><small>'+SUITS[c%4]+'</small></'+tag+'>';
};
const namesOf = mode => mode==='quick'?'Быстрая игра':'На вылет';
const s={view:'screens',id:'table',wide:false,filter:'',balance:1250,mode:'quick',format:'match',fee:0,paid:false,
  roomSize:4,roomHumans:1,roomTimer:20,roomMode:'quick',invited:new Set(),company:'Пятничные',companies:['Пятничные','Работа'],roomCode:'BLF042',
  socialTab:'friends',scope:'all',
  settings:{sound:true,music:true,vibrate:true,mute:false,lang:'RU'},provider:'Гость',muted:new Set(),blocked:new Set(),
  lesson:null,series:[],party:1,table:Table.scene(),selected:new Set(),claim:null,roundResult:null,
  ledger:[],respect:new Set(),target:3,reactTab:'phrase',sent:[],reaction:null,roomBot:0,
  time:20,timed:false,skips:0,searchTime:0,txn:false,entryPaid:0};
const tableViews=['table','declare','transfer','check','reveal','draw'];
const source = (id,label=SOURCES[id]) => '<a href="../'+id+'.md" target="_blank" rel="noopener">'+label+' ↗</a>';
function toast(message){$('#toast').textContent=message;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').textContent='',2700);}
function modal(title,content){$('#modalContent').innerHTML='<h2>'+title+'</h2>'+content;if(!$('#modal').open)$('#modal').showModal();}
function closeModal(){if($('#modal').open)$('#modal').close();}
function money(delta,why){s.balance+=delta;s.ledger.unshift([why,delta]);}
function newState(t){
  s.table=t;s.selected.clear();s.claim=null;s.time=s.format==='friends'?s.roomTimer:20;s.skips=0;s.reaction=null;s.settleNotes=[];s.roundResult=null;
}
function resetRun(){
  s.party=1;s.series=[];s.respect.clear();s.txn=false;s.earned=0;s.entryPaid=0;s.lesson=null;s.timed=false;
}
function sample(kind='reply',count=4){
  resetRun();s.mode='quick';s.format=count===4?'match':'friends';s.paid=false;s.fee=0;
  newState(Table.scene(kind,count));
}
function finishDeal(){
  const t=s.table;
  let n=0;
  while(t.phase!=='done' && n++<20000){if(t.phase==='reveal')t.settle();else t.botTurn();}
  if(t.phase!=='done')throw Error('Раздача не завершилась');
  recordRound();
}
function recordRound(){
  if(s.roundResult)return;
  const t=s.table,sorted=t.standings(),worst=sorted.at(-1).minus.length;
  const out=sorted.filter(p=>p.minus.length===worst).map(p=>p.id);
  s.roundResult={sorted,out,alive:sorted.filter(p=>!out.includes(p.id)).map(p=>p.id)};
  if(s.mode==='series')s.series.unshift(out);
}
function placements(){
  const r=s.roundResult;
  if(!r)return [];
  return s.mode==='quick'?r.sorted.map(p=>[p.id]):[r.alive,...s.series].filter(a=>a.length);
}
function resultReward(){
  let start=0;
  for(const ids of placements()){
    if(ids.includes(0)){
      if(s.format!=='match')return {coins:0,pts:0,place:start+1};
      const quick=s.mode==='quick', total=quick?4:6;
      const free=quick?[30,15,5,5]:[120,60,30,10,10,10];
      const share=quick?[.7,.3]:[.55,.3,.15];
      const pts=quick?[12,4,-4,-8]:[30,15,5,-5,-10,-15];
      const positions=range(ids.length).map(i=>start+i);
      const pool=positions.reduce((sum,i)=>sum+(s.entryPaid?Math.round(s.entryPaid*total*(share[i]||0)):free[i]||0),0);
      const coins=Math.floor(pool/ids.length)+(ids.indexOf(0)<pool%ids.length?1:0);
      return {coins,pts:Math.round(positions.reduce((sum,i)=>sum+(pts[i]||0),0)/ids.length),place:start+1};
    }
    start+=ids.length;
  }
  return {coins:0,pts:0,place:0};
}
function payResult(){
  if(s.txn || !s.roundResult)return;
  s.txn=true;const reward=resultReward();s.earned=reward.coins;
  if(s.earned)money(s.earned,'Награда за стол');
}
function nextDeal(){
  const ids=s.table.players.map(p=>p.id).filter(id=>s.roundResult.alive.includes(id));
  const ordered=s.table.players.map(p=>p.id);
  let n=s.table.first;do{n=(n+1)%ordered.length;}while(!ids.includes(ordered[n]));
  s.party++;newState(new Table(ids,ids.indexOf(ordered[n])));go('table');
}
function demoResult(){
  sample('end');s.table.check(0);s.table.settle();recordRound();
}
function prep(id){
  // Direct links open a reproducer; in-game buttons preserve the current match.
  if(tableViews.includes(id)){
    sample(id==='declare'?'deal':'reply');
    if(id==='reveal'||id==='draw'){s.table.check(1);if(id==='draw')settle();}
  }
  if(id==='round'||id==='final')demoResult();
  if(id==='search'){resetRun();s.format='match';s.searchTime=0;s.searchStarted=Date.now();}
  if(id==='room')s.format='friends';
  if(id==='watch'){
    sample('end',4);const players=s.table.players;
    [players[0].id,players[1].id]=[players[1].id,players[0].id];
    players.forEach(p=>p.name=NAMES[p.id]);
  }
  if(id==='eliminated'){
    sample('end',4);s.mode='series';s.format='friends';
    const players=s.table.players;
    players[0].minus.push(players[1].minus.pop(),players[2].minus.pop());
    s.table.check(0);s.table.settle();recordRound();
  }
}
function go(id,preview=false,write=true){
  cancelTableMotion();
  if(id==='large'){sample('large');id='table';preview=false;}
  if(Object.hasOwn(MAP_DIALOGS,id)){
    const dialog=MAP_DIALOGS[id];
    go(dialog.host,true,false);
    if(write && location.hash!=='#'+id)history.pushState(null,'','#'+id);
    if(dialog.action)act(dialog.action);else dialog.open();
    return;
  }
  if(!Object.hasOwn(VIEWS,id) && !['map','style'].includes(id))id='home';
  closeModal();$('#catalog').classList.remove('open');
  if(preview)prep(id);
  if(id==='map'||id==='style'){s.view=id;}else{s.view='screens';s.id=id;}
  if(write && location.hash!=='#'+id)history.pushState(null,'','#'+id);
  render();
  if(s.view==='screens')$('#screen').classList.add('enter-room');
  window.scrollTo(0,0);
}
function catalog(){
  const filter=s.filter.toLocaleLowerCase();
  $('#catalog').innerHTML='<div class="catalog-title"><b>Каталог экранов</b><span class="count">'+Object.keys(VIEWS).length+'</span></div><input class="search" id="searchCatalog" aria-label="Найти экран" placeholder="Найти экран…" value="'+esc(s.filter)+'"><div id="navitems"></div>';
  navItems(filter);
}
function navItems(filter){
  let html='';
  for(const [group,label] of Object.entries(GROUPS)){
    const items=Object.entries(VIEWS).filter(([,v])=>v.group===group && v.title.toLocaleLowerCase().includes(filter));
    if(items.length)html+='<div class="grouphead">'+label+'</div>'+items.map(([id,v])=>'<a class="navlink '+(id===s.id&&s.view==='screens'?'active':'')+'" href="#'+id+'">'+v.title+'</a>').join('');
  }
  $('#navitems').innerHTML=html||'<p class="mini">Экран не найден.</p>';
}
function scenarioOptions(){
  return '<select id="scenario" class="mini-select" aria-label="Открыть сценарий"><option value="">Выбрать эпизод…</option>'+Object.entries({reply:'Три короля · стол на 4',large:'39 карт в руке',six:'Стол на 6',ten:'Компания на 10',deal:'Начало круга',last:'Обязательная проверка',end:'Последняя четвёрка',series:'Финал серии',miss:'Два пропущенных хода',disconnect:'Потеря связи'}).map(([k,v])=>'<option value="'+k+'">'+v+'</option>').join('')+'</select>';
}
function inspector(){
  const v=VIEWS[s.id];
  return '<aside class="inspector"><section class="inspect-block"><div class="eyebrow">Описание экрана</div><h3>'+v.title+'</h3><p>'+v.description+'</p><p class="padtop">'+v.rule+'</p></section><section class="inspect-block"><div class="eyebrow">Сценарии стола</div>'+scenarioOptions()+'<p class="doc-note padtop">Эпизоды открываются с заданной раздачей. Для следующего хода соперника нажми «Ход соперника».</p></section><section class="inspect-block"><div class="eyebrow">Переходы</div>'+v.links.map(id=>jump(id)).join('')+'</section><section class="inspect-block"><div class="eyebrow">Основание</div>'+source(v.source)+(s.id==='pro'||s.id==='final'?source('economy'):'')+(s.id==='table'?source('reactions'):'')+'</section></aside>';
}
function render(){
  if(clubMode && s.view==='screens'){
    $('#main').innerHTML='<div class="club-stage"><div class="screen" id="screen"></div></div><a class="atlas-return" href="index.html#map">Карта окон атласа ↗</a>';
    refreshScreen();return;
  }
  catalog();
  document.querySelectorAll('.mast nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===s.view));
  if(s.view==='map'){renderMap();return;}if(s.view==='style'){renderStyle();return;}
  const v=VIEWS[s.id];
  $('#main').innerHTML='<div class="topline"><div><div class="crumb"><a href="club.html">Войти в клуб ↗</a> &nbsp; / &nbsp; '+GROUPS[v.group]+'</div><h1>'+v.title+'</h1></div>'+seg('size',[['mobile','Телефон'],['desktop','ПК / веб']],s.wide?'desktop':'mobile')+'</div><div class="workbench '+(s.wide?'wide':'')+'"><div class="stage"><div class="screen" id="screen"></div></div>'+inspector()+'</div>';
  refreshScreen();
}
function renderStyle(){
  $('#main').innerHTML='<div class="topline"><div><div class="crumb">Атлас игры / Визуальная система</div><h1>Яркая настолка</h1></div></div><div class="style-board"><div><img src="club-lobby.webp" alt="Вечерний карточный клуб"><p class="padtop"><a href="club.html">Войти в клуб →</a></p></div><div class="stack"><section class="stylecard"><h3>Палитра стола</h3><div class="swatches">'+[['Сукно','#334e99'],['Карты','#fffdf4'],['Проверка','#ff8c49'],['Перевод','#ffc667'],['Быстрый стол','#256557'],['Профи','#903f49']].map(([n,c])=>'<span class="swatch"><b style="background:'+c+'"></b>'+n+'<br>'+c+'</span>').join('')+'</div></section><section class="stylecard"><h3>Номинал и рубашка</h3><div class="row">'+card(44)+card(21)+back+'</div><p class="padtop">Крупный индекс в углу читается в веере. Два глаза на мандариновой рубашке повторяются на каждой закрытой карте. Результат проверки обозначен номиналом, словом и цветом.</p></section><section class="stylecard"><h3>Персонажи и движение</h3><div class="row">'+[1,2,3].map(face).join('')+'</div><p class="padtop">В лобби зажигаются лампы. В поиске подсвечиваются свободные кресла, в финале над победителем появляется корона. Реплика привязана к автору заявки. Выбранная карта приподнимается, открытая переворачивается. При системной настройке уменьшения движения анимация отключается.</p></section><section class="stylecard"><h3>Телефон и ПК</h3><p>На телефоне рука и действия снизу. Карты лежат внахлёст и переходят на новый ряд по ширине экрана. В открытом углу видны номинал и масть. Касание выбирает конкретную карту, повторное — снимает выбор. На ПК рядом со столом открываются история ходов и реакции.</p></section><section class="stylecard"><h3>Источники концепта</h3><div class="source-list">'+Object.keys(SOURCES).map(k=>source(k)).join('')+'</div></section></div></div>';
}
function settle(){
  const n=s.table.log.length;
  s.table.settle();s.settleNotes=s.table.log.slice(n);s.selected.clear();s.claim=null;
  if(s.table.phase==='done')recordRound();
}
function controls(){
  const t=s.table,me=t.players[t.actor].id===0,action=s.id;
  if(action==='draw')return btn('afterDraw',t.phase==='done'?'Итог раздачи':'Продолжить','gold');
  if(t.phase==='done')return btn('openRound','Итог раздачи','gold');
  if(t.phase==='reveal')return btn('collect','Забрать стопку и добрать','gold');
  if(!me)return clubMode?'':btn('bot','Ход соперника →','gold');
  if(action==='check')return '';
  if(action==='transfer'||action==='declare'||t.phase==='open')return btn('submit',action==='transfer'?'Перевести · '+s.selected.size:'Объявить · '+s.selected.size,'gold',!s.selected.size||(t.phase==='open'&&s.claim===null))+(t.phase==='reply'?btn('go:table','Назад','light'):'');
  return btn('go:check','Не верю','hot')+(s.selected.size?btn('submit','Перевести '+s.selected.size,'gold'):btn('go:transfer','Перевести','gold',t.mandatory));
}
function tableHtml(){
  const t=s.table,me=t.players.find(p=>p.id===0),actor=t.players[t.actor],last=t.players[t.last],checking=s.id==='check';
  const mine=actor.id===0,selecting=mine && !checking && s.id!=='draw' && (t.phase==='open'||(t.phase==='reply'&&!t.mandatory));
  const revealed=t.phase==='reveal',drawing=s.id==='draw',r=t.reveal;
  const claim=t.rank===11 && t.packet.length===3?'Три короля':(RANKS[t.rank]||'')+' × '+t.packet.length;
  const statement=drawing?'Добор завершён':revealed?(r.truth?'✓ Правда':'✦ Поймали на блефе'):t.phase==='open'?'Новый круг':claim;
  const opp=t.players.filter(p=>p.id!==0);
  const seated=seatsAroundTable(opp,actor,last);
  let center='';
  if(revealed)center=card(r.card,'',false,true);
  else if(drawing)center='<div class="instruction">'+(s.settleNotes?.length?s.settleNotes.map(esc).join('<br>'):'Новых четвёрок в руках нет')+'</div>';
  else if(t.packet.length)center=range(checking?t.packet.length:Math.min(t.packet.length,5)).map(i=>checking?'<button class="back pick" aria-label="Открыть карту '+(i+1)+'" data-act="pick:'+i+'">'+(t.packet.length>7?i+1:eyes)+'</button>':back).join('');
  else center='<span class="token">Стопка пуста</span>';
  const status=revealed?'Стопку забирает '+t.players[r.loser].name+' · '+r.count:'В стопке <b data-pile-count>'+t.pile.length+'</b>';
  const instruction=checking?'Открой одну карту':t.mandatory&&t.phase==='reply'?'Последние карты! Проверка обязательна.':selecting&&t.phase==='open'?'Выбери карты и объяви номинал':s.id==='transfer'?'Выбери карты для перевода':'';
  const hand=me?[...me.hand].sort((a,b)=>a-b):[];
  const timer=s.time>0?' · <span id="clock">'+s.time+' с</span>':'';
  const ranks=RANKS.map((v,i)=>'<button data-act="rankinfo:'+i+'" class="'+(t.dead.includes(i)?'retired':t.rank===i?'claim':'')+'">'+v+'</button>').join('');
  const picker=selecting && t.phase==='open'?'<div class="ranksel">'+RANKS.map((v,i)=>'<button data-act="claim:'+i+'" '+(t.dead.includes(i)?'disabled':'')+' class="'+(s.claim===i?'active':'')+'">'+v+'</button>').join('')+'</div>':'';
  const subtitle=revealed?'Заявка · '+RANKS[r.rank]:t.phase==='reply'&&!drawing?last.name+' объявляет':'';
  return `<section class="game application club-table">
    <header class="gamebar"><div><span class="game-suit">♠</span> ${namesOf(s.mode)} <small>· ${t.players.length} мест</small></div><button class="iconbtn" data-act="menu" aria-label="Меню стола">···</button></header>
    <div class="gamegrid"><aside class="sidegame"><b>История ходов</b>${t.log.slice(-9).map(x=>'<p>'+esc(x)+'</p>').join('')}</aside>
    <div class="playing-area"><div class="rankstrip">${ranks}</div>
      <div class="felt ${opp.length>5?'dense':''} ${checking?'checking':''} ${checking&&t.packet.length>7?'spread-packet':''}">
        <span class="draw-deck" aria-label="Колода"><i>▧</i> <b data-deck-count>${t.deck.length}</b></span>
        <div class="seats">${seated}</div>
        <div class="trick"><small>${subtitle}</small><div class="claimtext">${statement}</div>
          <div class="backcards ${checking&&t.packet.length>3?'many':''}">${center}</div>
          <div class="pileline">${status}</div>${s.reaction?'<div class="reaction-bubble">'+esc(s.reaction)+'</div>':''}
        </div>
      </div>
      ${instruction?'<div class="instruction">'+instruction+'</div>':''}
      ${s.lesson!==null?'<div class="instruction">Миссия · проверь заявку Маши</div>':''}
      <div class="motion-status" role="status"></div>
      <div class="handzone"><div class="handhead"><span data-place="0" class="${mine && !revealed && !drawing?'my-turn':''}">${me?'Ваша рука · <b data-hand-count="0">'+hand.length+'</b> · −<b data-minus="0">'+me.minus.length+'</b>':'Вы наблюдаете'}</span>
        <span class="turn-label">${t.phase==='done'?'Раздача окончена':mine?'Ваш ход':'Ход · '+actor.name}${s.timed&&['open','reply'].includes(t.phase)?timer:''}</span><button data-act="go:reactions">Реакции</button></div>
        ${handMarkup(hand,selecting)}</div>${picker}<div class="gamefoot">${controls()}</div>
    </div><aside class="sidegame"><b>Реакции</b>${['Ну-ну','Проверяй, не бойся','Хорошая игра'].map(v=>'<p><button data-act="say:'+v+'">'+v+'</button></p>').join('')}</aside></div></section>`;
}
function handMarkup(hand,selecting){
  const cards=hand.map(c=>card(c,selecting?'select:'+c:'',s.selected.has(c))).join('');
  const longHand=hand.length>7;
  const toolbar=longHand&&selecting?'<div class="hand-tools"><strong aria-live="polite">Выбрано '+s.selected.size+'</strong>'+btn('selectAll','Выбрать все','light slim',s.selected.size===hand.length)+btn('clearHand','Сбросить','light slim',!s.selected.size)+'</div>':'';
  return toolbar+'<div id="player-hand" class="hand-spread'+(longHand?' hand-rows':'')+'" style="--count:'+hand.length+'">'+cards+'</div>';
}
function updateHandSelection(){
  const hand=$('#player-hand');
  for(const button of hand.querySelectorAll('button[data-act]')){
    const selected=s.selected.has(Number(button.dataset.act.split(':')[1]));
    button.classList.toggle('selected',selected);
    button.setAttribute('aria-pressed',String(selected));
  }
  const tools=$('.hand-tools');
  if(tools){
    tools.querySelector('strong').textContent='Выбрано '+s.selected.size;
    tools.querySelector('[data-act="selectAll"]').disabled=s.selected.size===hand.children.length;
    tools.querySelector('[data-act="clearHand"]').disabled=!s.selected.size;
  }
  $('.gamefoot').innerHTML=controls();
}
function appBody(id){
  const t=s.table;
  switch(id){
    case 'loading':return poster('BluffCards','Подключение','orange')+progress(65)+btn('go:home','В клуб','hot');
    case 'watch':return poster('Вы вышли из раздачи','Колода и рука пусты','pink',face(0))+line('Ваши минусы','−'+(t.players.find(p=>p.id===0)?.minus.length||0))+stack(btn('resume','Наблюдать за столом','hot')+(clubMode?'':btn('fastEnd','Показать итог раздачи')));
    case 'eliminated':return poster('Вы выбыли','Раздача '+s.party,'pink',face(0))+line('Продолжают',s.roundResult.alive.map(i=>NAMES[i]).join(', '))+stack(btn(s.roundResult.alive.length>1?'nextDeal':'endTable',s.roundResult.alive.length>1?'Наблюдать за следующей раздачей':'Итог серии','hot')+btn('go:home','На главную'));
    case 'welcome':return lobbyHtml();
    case 'home':return lobbyHtml();
    case 'pro':return proTables();
    case 'search':return searchClub();
    case 'friends':{
      const people=s.socialTab==='recent'?[4,5,6]:[1,2,3,4];
      return seg('social',[['friends','Друзья'],['groups','Компании'],['recent','Недавние']],s.socialTab)+stack((s.socialTab==='groups'?s.companies.map((name,i)=>tile('group:'+i,esc(name),'Постоянная ссылка компании')).join('')+btn('newGroup','Создать компанию'):people.map(friendSeat).join(''))+btn('createRoom',s.invited.size?'Позвать выбранных · '+s.invited.size:'Создать комнату','hot')+btn('go:join','Ввести код комнаты'));
    }
    case 'join':return '<label>Код комнаты<input id="roomInput" class="input chipinput padtop" maxlength="6" value="'+s.roomCode+'"></label><p class="mini padtop">Введи шесть символов из приглашения.</p>'+stack(btn('joinCode','Занять место','hot')+(clubMode?'':btn('go:queue','Показать занятую комнату')));
    case 'room':return roomSeats()+seg('roomMode',[['quick','Быстрая'],['series','На вылет']],s.roomMode)+'<div class="between"><label>Мест <select id="roomSize">'+range(9).map(i=>'<option '+(s.roomSize===i+2?'selected':'')+'>'+ (i+2)+'</option>').join('')+'</select></label><label>Таймер <select id="roomTimer">'+[20,60,0].map(i=>'<option value="'+i+'" '+(s.roomTimer===i?'selected':'')+'>'+(i?i+' с':'Выкл.')+'</option>').join('')+'</select></label></div>'+stack(btn('go:invite','Пригласить по ссылке')+btn('addBot','Добавить бота','light',s.roomHumans+s.roomBot>=s.roomSize)+btn('startRoom','Начать','hot',s.roomHumans+s.roomBot<2));
    case 'invite':return poster('Позвать за стол','Код · '+s.roomCode,'orange')+line('Комната',esc(s.company))+'<p class="mini">Локальная ссылка откроет этот пример в браузере с доступом к файлу.</p>'+stack(btn('copyInvite','Скопировать ссылку','hot')+btn('inviteAll','Позвать всех в компании')+btn('go:friends','Выбрать друзей')+btn('go:room','В комнату'));
    case 'queue':return poster('Партия идёт','Зритель · первый в очереди')+line('Компания',esc(s.company))+line('Следующая посадка','Между партиями')+stack(btn('seatReady','Показать освободившееся место','hot')+btn('go:friends','Выйти из очереди'));
    case 'reactions':{
      const lists={phrase:['Верю-верю…','Ну-ну','Проверяй, не бойся','Чистая правда!','Блефуешь!','Ой, зря','Быстрее!','Хорошая игра'],emoji:['😂','😏','😱','🤔','😎','😤','👏','🙈'],throw:['🍅','🌹','🥚','🍺','💋']};
      return seg('reactTab',[['phrase','Фразы'],['emoji','Эмоции'],['throw','Броски']],s.reactTab)+(s.reactTab==='throw'?'<label>Кому <select id="target">'+t.players.filter(p=>p.id!==0).map(p=>'<option value="'+p.id+'" '+(p.id===s.target?'selected':'')+'>'+p.name+'</option>').join('')+'</select></label>':'')+'<div class="row wrap padtop">'+lists[s.reactTab].map(v=>btn('say:'+v,v,'light slim')).join('')+'</div>'+btn('resume','Вернуться к столу','hot');
    }
    case 'player':{
      const p=t.players.find(x=>x.id===s.target)||t.players.find(x=>x.id!==0);
      return poster(p.name,'За столом','pink',face(p.id))+line('Карты в руке',p.hand.length)+line('Открытые минусы',p.minus.map(r=>RANKS[r]).join(' · ')||'0')+stack(btn('muteOne',s.muted.has(p.id)?'Включить реакции':'Заглушить реакции')+(s.format==='match'?btn('report','Пожаловаться')+btn('block','Заблокировать'):'')+btn('resume','К столу','hot'));
    }
    case 'round':case 'final':return resultHtml(id);
    case 'leaders':return leaderboard();
    case 'account':return line('Профиль',esc(s.provider))+stack(['Google','Apple','Telegram'].map(n=>btn('provider:'+n,n)).join('')+btn('tutorial','Учебная раздача')+btn('delete','Удалить аккаунт'));
    case 'offline':return poster('Связь потеряна','Возвращаемся к столу')+stack(btn('resume','Связь восстановлена','hot')+(clubMode?'':btn('go:away','Пропущено два хода')));
    case 'away':return poster('Вы отошли','За вас играет бот','pink')+notice('Два хода подряд пропущены. Управление вернётся после подтверждения.')+btn('return','Я тут','hot');
    case 'leave':return poster('Покинуть стол?',namesOf(s.mode),'pink')+notice(s.entryPaid?'Вход сгорает. Бот доиграет без выплаты выигрыша.':'Бот займёт ваше место до конца партии.')+stack(btn('resume','Остаться','hot')+btn('exitTable','Покинуть стол'));
  }
}
function resultHtml(id){
  if(!s.roundResult)demoResult();
  const r=s.roundResult;
  if(id==='round'){
    const series=s.mode==='series',canContinue=series&&r.alive.length>1;
    const lost=canContinue&&r.out.includes(0);
    return poster('Раздача '+s.party,'Все 13 номиналов собраны','pink')+r.sorted.map((p,i)=>line((i+1)+'. '+p.name,'−'+p.minus.length+(series&&r.out.includes(p.id)?' · выбыл':''))).join('')+stack(btn(lost?'go:eliminated':canContinue?'nextDeal':'endTable',lost?'Ваш результат · вылет':canContinue?'Следующая раздача':'Итог стола','hot'));
  }
  const reward=resultReward();
  return winnersBanner(placements(),reward.place)+placements().map((ids,i)=>line(1+placements().slice(0,i).flat().length+' место',ids.map(n=>NAMES[n]).join(', '))).join('')+line('Фишки',reward.coins+' ◈')+
    '<p class="mini padtop">Уважение соперникам</p><div class="row wrap">'+placements().flat().filter(n=>n!==0).map(n=>btn('respect:'+n,NAMES[n]+' 👍','light slim',s.respect.has(n))).join('')+'</div>'+
    stack(btn('again','Ещё раз','hot')+btn('go:home','На главную'));
}
function refreshScreen(){
  const el=$('#screen');if(!el)return;
  cancelTableMotion();
  if(tableViews.includes(s.id))el.innerHTML=tableHtml();
  else el.innerHTML=applicationHtml(s.id);
  
  
  if(!startTableMotion())scheduleClubOpponent();
}
let opponentTimer;
function scheduleClubOpponent(){
  clearTimeout(opponentTimer);
  const t=s.table;
  if(!clubMode || s.view!=='screens'||!tableViews.includes(s.id)||s.id==='draw'||
     !['open','reply'].includes(t.phase)||t.players[t.actor].id===0)return;
  opponentTimer=setTimeout(()=>{
    if(t!==s.table || s.view!=='screens'||!tableViews.includes(s.id)||s.id==='draw')return;
    if(document.hidden||$('#modal').open){scheduleClubOpponent();return;}
    bot();
  },1200);
}
function resume(){const p=s.table.phase;go(p==='done'?'round':p==='reveal'?'reveal':'table');}
function resetClock(){s.time=s.format==='friends'?s.roomTimer:20;}
function startTutorial(){
  resetRun();s.format='training';s.mode='quick';s.lesson=0;newState(Table.scene('reply',4));go('check');
}
function completeLesson(){
  s.lesson=null;showLessonResult();
}
function showLessonResult(){
  modal('Миссия пройдена',btn('go:home','В клуб','hot'));
}
function scenario(k){
  if(!k)return;
  if(k==='series'){sample('end',2);s.mode='series';s.format='match';s.party=5;s.series=[[2],[3],[4],[5]];s.table.check(0);s.table.settle();recordRound();go('round');return;}
  sample(['six','ten','miss','disconnect'].includes(k)?'reply':k,k==='six'?6:k==='ten'?10:4);
  if(k==='six'){s.format='match';s.mode='series';}
  go(k==='miss'?'away':k==='disconnect'?'offline':k==='deal'?'declare':'table');
}
function enterQueue(mode,fee=0){
  if(fee && (!PRO_FEES.includes(fee)||s.balance<fee||mode!=='series'))return;
  markFirstVisit();s.mode=mode;s.fee=fee;s.paid=fee>0;s.searchStarted=Date.now();s.searchTime=0;
  go('search');
}
function startMatch(){
  if(s.id!=='search')return;
  const fee=s.paid?s.fee:0;
  if(fee && (s.balance<fee||s.mode!=='series')){go('pro');return;}
  resetRun();s.format='match';s.timed=true;s.entryPaid=fee;
  if(fee)money(-fee,'Вход за стол');
  const n=s.mode==='quick'?4:6;newState(new Table(range(n),Math.floor(Math.random()*n)));go('table');
}
function bot(auto=false){
  const t=s.table;
  if(!['open','reply'].includes(t.phase)||(!auto&&t.players[t.actor].id===0))return;
  const wasLessonCheck=s.lesson===0 && t.phase==='reply';
  if(wasLessonCheck)t.check(0);else t.botTurn();
  resetClock();s.selected.clear();s.claim=null;resume();
}
function sendReaction(msg){
  if(s.settings.mute){toast('Реакции заглушены в настройках');return;}
  const now=Date.now();s.sent=s.sent.filter(n=>now-n<10000);
  if(now-(s.sent.at(-1)||0)<3000||s.sent.length>=3){toast('Небольшая пауза между реакциями');return;}
  s.sent.push(now);
  s.reaction=s.id==='reactions'&&s.reactTab==='throw'?msg+' → '+NAMES[s.target]:msg;
  resume();clearTimeout(sendReaction.timer);sendReaction.timer=setTimeout(()=>{s.reaction=null;$('.reaction-bubble')?.remove();},2000);
}
function tableMenu(){
  if(clubMode){modal('Стол',stack(btn('history','История ходов')+btn('go:reactions','Реакции')+btn('go:leave','Выйти')));return;}
  modal('Меню стола',stack(btn('go:reactions','Реакции')+btn('history','История ходов')+btn('timeout','Показать пропуск хода')+btn('go:offline','Показать потерю связи')+btn('fastEnd','Доиграть раздачу ботами')+btn('go:leave','Покинуть стол')));
}
function timeout(){
  const t=s.table;
  if(!['open','reply'].includes(t.phase)){toast('Проверка уже завершена');return;}
  const mine=t.players[t.actor].id===0;if(mine)s.skips++;
  bot(true);
  if(mine&&s.skips>=2)go('away');else if(mine)toast('Пропуск хода · за вас сыграл бот');
}
function showInviteLink(){
  modal('Ссылка комнаты','<input class="input" readonly value="'+esc(location.href.split('#')[0]+'#join')+'">');
}
function act(raw){
  const [key,arg]=raw.split(':'),n=Number(arg),t=s.table;
  switch(key){
    case 'selectAll':t.players[t.actor].hand.forEach(c=>s.selected.add(c));updateHandSelection();return;
    case 'clearHand':s.selected.clear();updateHandSelection();return;
    case 'queueFree':enterQueue(arg);return;
    case 'paidSeat':if(PRO_FEES.includes(n)&&s.balance>=n)modal('Стол на вылет',line('Взнос',num(n)+' ◈')+line('Призовой фонд',num(6*n)+' ◈')+btn('confirmSeat:'+n,'Войти за '+num(n)+' ◈','hot'));return;
    case 'confirmSeat':enterQueue('series',n);return;
    case 'tutorial':markFirstVisit();startTutorial();return;
    case 'catalog':$('#catalog').classList.toggle('open');return;
    case 'go':if(s.id==='welcome'&&arg==='home')markFirstVisit();if(arg==='check')s.selected.clear();go(arg);return;
    case 'size':s.wide=arg==='desktop';render();return;
    case 'select':if(s.selected.has(n))s.selected.delete(n);else s.selected.add(n);updateHandSelection();return;
    case 'claim':s.claim=n;break;
    case 'submit':
      if(t.play([...s.selected],s.claim)){s.selected.clear();s.claim=null;s.skips=0;resetClock();go('table');}return;
    case 'pick':t.check(n);if(t.phase==='reveal'){s.skips=0;if(!t.reveal.truth)s.catches=Math.min(3,(s.catches||0)+1);go('reveal');}return;
    case 'collect':settle();go('draw');return;
    case 'afterDraw':if(s.lesson!==null){completeLesson();return;}if(t.phase!=='done'&&t.players.find(p=>p.id===0)?.exit<Infinity){go('watch');return;}resume();return;
    case 'bot':bot();return;
    case 'resume':resume();return;
    case 'return':s.skips=0;resetClock();resume();return;
    case 'menu':tableMenu();return;
    case 'history':modal('История ходов',t.log.map(x=>'<p>'+esc(x)+'</p>').join(''));return;
    case 'timeout':closeModal();timeout();return;
    case 'rankinfo':{const owner=t.players.find(p=>p.minus.includes(n));modal('Номинал '+RANKS[n],'<p>'+(owner?'Четвёрка собрана · '+owner.name+' · −1. Заявка недоступна.':'В игре. Доступен для заявки в новом круге.')+'</p>');return;}
    case 'person':s.target=n;go('player');return;
    case 'say':sendReaction(arg);return;
    case 'reactTab':s.reactTab=arg;if(!t.players.some(p=>p.id===s.target&&p.id!==0))s.target=t.players.find(p=>p.id!==0).id;break;
    case 'muteOne':{const id=t.players.find(x=>x.id===s.target)?.id??t.players.find(p=>p.id!==0).id;if(s.muted.has(id))s.muted.delete(id);else s.muted.add(id);break;}
    case 'report':modal('Пожаловаться',stack(['Оскорбительный ник','Спам реакциями','Другое'].map(v=>btn('reported',v)).join('')));return;
    case 'reported':closeModal();toast('Жалоба отмечена в прототипе');return;
    case 'block':modal('Заблокировать игрока?','<p>В случайных играх вы больше не встретитесь за одним столом.</p>'+btn('blocked','Заблокировать','hot'));return;
    case 'blocked':s.blocked.add(s.target);closeModal();toast('Игрок добавлен в демо-список блокировки');return;
    case 'fastEnd':finishDeal();go('round');return;
    case 'openRound':recordRound();go('round');return;
    case 'nextDeal':nextDeal();return;
    case 'endTable':payResult();go('final');if(s.lesson!==null)completeLesson();return;
    case 'respect':s.respect.add(n);break;
    case 'again':if(s.format==='friends')go('room');else if(s.format==='match'&&s.entryPaid)go('pro');else if(s.format==='match')enterQueue(s.mode);else go('home');return;
    case 'exitTable':go(s.format==='friends'?'room':'home');return;
    case 'social':s.socialTab=arg;break;
    case 'friend':if(s.invited.has(n))s.invited.delete(n);else s.invited.add(n);break;
    case 'group':s.company=s.companies[n];s.format='friends';go('room');return;
    case 'newGroup':modal('Новая компания','<label>Название <input class="input" maxlength="24" id="groupName"></label>'+btn('saveGroup','Создать комнату','hot'));return;
    case 'saveGroup':{const val=$('#groupName').value.trim();if(!val){toast('Введите название');return;}s.company=val;if(!s.companies.includes(val))s.companies.push(val);s.format='friends';go('room');return;}
    case 'createRoom':s.roomHumans=1;s.format='friends';s.roomBot=0;s.roomSize=Math.max(4,1+s.invited.size);go('room');if(s.invited.size)toast('Приглашения подготовлены · '+s.invited.size);return;
    case 'joinCode':{const val=$('#roomInput').value.trim().toUpperCase();if(!/^[A-ZА-Я0-9]{6}$/.test(val)){toast('Нужно шесть букв или цифр');return;}if(val!==s.roomCode){toast('Комната не найдена. Код примера '+s.roomCode);return;}s.roomHumans=2;s.roomBot=0;s.format='friends';go('room');return;}
    case 'roomMode':s.roomMode=arg;break;
    case 'addBot':s.roomBot=Math.min(s.roomSize-s.roomHumans,s.roomBot+1);break;
    case 'startRoom':if(s.roomHumans+s.roomBot<2)return;resetRun();s.mode=s.roomMode;s.format='friends';s.timed=true;newState(new Table(range(s.roomHumans+s.roomBot)));go('table');return;
    case 'copyInvite':{const url=location.href.split('#')[0]+'#join';if(navigator.clipboard)navigator.clipboard.writeText(url).then(()=>toast('Ссылка скопирована')).catch(showInviteLink);else showInviteLink();return;}
    case 'inviteAll':go('room');toast('Компания приглашена · демо');return;
    case 'seatReady':s.roomHumans=2;s.roomBot=0;s.format='friends';go('room');return;
    
    case 'scope':s.scope=arg;break;
    case 'provider':modal('Вход через '+arg,'<p>Демонстрация входа. Текущий игровой профиль сохраняется.</p>'+btn('linked:'+arg,'Подтвердить в демо','hot'));return;
    case 'linked':s.provider=arg;saveIdentity();closeModal();break;
    case 'delete':modal('Удалить демонстрационный профиль?','<p>Локальный просмотр начнётся заново. Гостевой профиль будет сброшен.</p>'+btn('deleteConfirm','Сбросить демо-профиль','hot'));return;
    case 'deleteConfirm':clearIdentity();location.href=location.pathname+location.search+'#welcome';location.reload();return;
    default:return;
  }
  refreshScreen();
}
document.addEventListener('click',e=>{
  const a=e.target.closest('a[href^="#"]');
  if(a && !e.ctrlKey && !e.metaKey){e.preventDefault();go(a.hash.slice(1),true);return;}
  const b=e.target.closest('button');if(!b||b.disabled)return;
  if(b.dataset.view){go(b.dataset.view==='screens'?s.id:b.dataset.view);return;}
  if(b.dataset.act)act(b.dataset.act);
});
document.addEventListener('input',e=>{if(e.target.id==='searchCatalog'){s.filter=e.target.value;navItems(s.filter.toLocaleLowerCase());}});
document.addEventListener('change',e=>{
  const id=e.target.id,val=e.target.value;
  if(id==='scenario'){scenario(val);return;}
  if(id==='fee')s.fee=Number(val);
  else if(id==='roomSize'){s.roomSize=Number(val);s.roomBot=Math.min(s.roomBot,s.roomSize-s.roomHumans);}
  else if(id==='roomTimer')s.roomTimer=Number(val);
  else if(id==='target')s.target=Number(val);else return;
  refreshScreen();
});
window.addEventListener('popstate',()=>go(location.hash.slice(1)||'table',true,false));
$('#modal').addEventListener('close',()=>{
  const id=location.hash.slice(1);
  if(!$('#modal').open && Object.hasOwn(MAP_DIALOGS,id))history.replaceState(null,'','#'+s.id);
});
setInterval(()=>{
  if(document.hidden||motionRun||s.view!=='screens'||$('#modal').open)return;
  if(s.id==='search'){s.searchTime=Math.floor((Date.now()-s.searchStarted)/1000);if(s.searchTime>=20){startMatch();return;}
    $('[data-search-time]').textContent=s.searchTime;
    $('.screen-search .progress i').style.width=(s.searchTime*5)+'%';return;}
  if(!s.timed||!tableViews.includes(s.id)||s.id==='draw'||!['open','reply'].includes(s.table.phase)||(s.format==='friends'&&s.roomTimer===0))return;
  if(--s.time<=0){timeout();return;}const clock=$('#clock');if(clock)clock.textContent=s.time+' с';
},1000);
s.provider=identity.provider;
go(location.hash.slice(1)||(clubMode?'home':'table'),true,false);
restorePlatformProfile();
