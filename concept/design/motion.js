// Animate public match events in order. Only the local hand has card identities.
let motionRun=null;
function cancelTableMotion(){
  if(!motionRun)return;
  const run=motionRun;motionRun=null;
  run.animation?.cancel();
  run.element?.remove();
  run.board.inert=false;
  run.board.classList.remove('in-motion');
}
function startTableMotion(){
  const board=document.querySelector('.club-table');
  if(!board || !s.table.events.length)return false;
  const events=s.table.events.splice(0);
  clearTimeout(opponentTimer);
  const run={board,table:s.table,hand:[...(s.table.players.find(p=>p.id===0)?.hand||[])],
    counts:Object.fromEntries(s.table.players.map(p=>[p.id,p.hand.length])),
    minus:Object.fromEntries(s.table.players.map(p=>[p.id,p.minus.length])),pile:s.table.pile.length,deck:s.table.deck.length};
  for(const e of [...events].reverse())applyMotionCounts(run,e,-1);
  motionRun=run;board.classList.add('in-motion');board.inert=true;
  const headline=board.querySelector('.claimtext');
  if(events.some(e=>e.type==='draw'||e.type==='collect'))headline.textContent=events[0].type==='collect'?'Разбор стопки':'Раздача';
  if(s.id==='draw')board.querySelector('.backcards').innerHTML=back;
  paintMotionCounts(run);
  playTableEvents(run,events);
  return true;
}
function applyMotionCounts(run,e,dir){
  const n=e.count*dir;
  if(e.type==='collect'||e.type==='play')run.pile+=e.type==='play'?n:-n;
  if(e.type==='draw')run.deck-=n;
  if(e.type==='four')run.minus[e.player]+=dir;
  if(!e.count)return;
  const gain=e.type==='collect'||e.type==='draw'?dir:-dir;
  run.counts[e.player]+=gain*e.count;
  if(e.cards && e.player===0){
    if(gain>0)run.hand.push(...e.cards);
    else run.hand=run.hand.filter(c=>!e.cards.includes(c));
  }
}
function paintMotionCounts(run){
  const {board}=run;
  for(const el of board.querySelectorAll('[data-hand-count]'))el.textContent=run.counts[el.dataset.handCount];
  for(const el of board.querySelectorAll('[data-minus]'))el.textContent=run.minus[el.dataset.minus];
  board.querySelector('[data-deck-count]').textContent=run.deck;
  const pile=board.querySelector('[data-pile-count]');if(pile)pile.textContent=run.pile;
  const hand=board.querySelector('.handzone');
  for(const child of [...hand.children])if(!child.classList.contains('handhead'))child.remove();
  hand.insertAdjacentHTML('beforeend',handMarkup(run.hand.sort((a,b)=>a-b),false));
}
function place(board,id){
  return board.querySelector('[data-place="'+id+'"]')||board.querySelector('.handhead');
}
function motionStep(run,e){
  const b=run.board,pile=b.querySelector('.backcards'),deck=b.querySelector('.draw-deck');
  const seat=place(b,e.player),name=NAMES[e.player];
  switch(e.type){
    case 'play':return [seat,pile,'×'+e.count,name+' → стопка · '+e.count];
    case 'collect':return [pile,seat,'×'+e.count,'Стопка → '+name+' · '+e.count];
    case 'draw':return [deck,seat,'+'+e.count,'Колода → '+name+' · +'+e.count];
    case 'four':return [seat,b.querySelector('[data-act="rankinfo:'+e.rank+'"]'),RANKS[e.rank]+' ×4',name+' · четвёрка '+RANKS[e.rank]+' · −1'];
    case 'reveal':return [place(b,e.player),pile,'?',name+' · проверка одной карты'];
    case 'turn':return [e.from===null?pile:place(b,e.from),place(b,e.to),'➜',e.to===0?'Ваш ход':'Ходит '+NAMES[e.to]];
  }
}
async function playTableEvents(run,events){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const board=run.board,status=board.querySelector('.motion-status');
  try{
    for(const e of events){
      if(motionRun!==run || !board.isConnected)return;
      const [from,to,token,label]=motionStep(run,e);status.textContent=label;
      if(e.type==='turn')to.classList.add('turn-arrival');
      const el=document.createElement('span');el.className='flight-token '+e.type;el.textContent=token;board.append(el);run.element=el;
      const box=board.getBoundingClientRect();
      const point=node=>{const r=node.getBoundingClientRect();return [r.left+r.width/2-box.left,r.top+r.height/2-box.top];};
      const [x,y]=point(from),[u,v]=point(to);
      el.style.left=u+'px';el.style.top=v+'px';
      const frames=reduced?[{opacity:1},{opacity:1}]:[
        {translate:(x-u)+'px '+(y-v)+'px',rotate:'-12deg',opacity:.65},
        {translate:((x-u)*.5)+'px '+((y-v)*.5-13)+'px',opacity:1,offset:.45},
        {translate:'0px 0px',rotate:'0deg',opacity:1,offset:.82},{translate:'0px 0px',opacity:.9}];
      run.animation=el.animate(frames,{duration:reduced?120:e.type==='turn'?360:430,easing:'ease-in-out'});
      await run.animation.finished;
      el.remove();
      if(motionRun!==run || !board.isConnected)return;
      applyMotionCounts(run,e,1);paintMotionCounts(run);
    }
  }catch(error){if(error.name!=='AbortError')throw error;}
  finally{
    if(motionRun===run){
      cancelTableMotion();
      if(board.isConnected){refreshScreen();}
    }
  }
}
