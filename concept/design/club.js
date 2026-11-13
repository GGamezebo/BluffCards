const clubMode=new URLSearchParams(location.search).has('club');
document.body.classList.toggle('club-mode',clubMode);

const PRO_FEES=[100,500,2500,10000,50000];
const identityKey='bluffcards.release1.identity';
let identity;
try{identity=JSON.parse(localStorage.getItem(identityKey)||'null');}catch{}
if(!identity?.id)identity={id:crypto.randomUUID?.()||Math.random().toString(36).slice(2),provider:'Гость',visited:false};
function persistIdentity(){try{localStorage.setItem(identityKey,JSON.stringify(identity));}catch{}}
persistIdentity();
function markFirstVisit(){identity.visited=true;persistIdentity();}
function saveIdentity(){identity.provider=s.provider;persistIdentity();}
function clearIdentity(){try{localStorage.removeItem(identityKey);}catch{}}
// A platform wrapper may supply an already verified game session at launch.
// An unverified Telegram payload or a Google/Apple device is not a login.
async function restorePlatformProfile(){
  const bridge=window.BluffCardsPlatform;
  if(typeof bridge?.restoreSession!=='function')return;
  const guestId=identity.id;
  try{
    const session=await bridge.restoreSession({guestId,interactive:false});
    if(identity.id!==guestId || !session?.playerId || !session.provider)return;
    identity.id=String(session.playerId);s.provider=String(session.provider);saveIdentity();
    if(s.id==='account'&&s.view==='screens')refreshScreen();
  }catch{/* The guest can enter the lobby while the platform is unavailable. */}
}
function clubEmblem(kind){
  const shapes={
    friends:'<path d="M5 29c0-5 3-8 8-8s8 3 8 8v2H5zm16-7c4-2 9 1 10 6v3h-7v-2c0-3-1-5-3-7z"/><circle cx="13" cy="13" r="6"/><circle cx="25" cy="15" r="4.5"/>',
    leaders:'<path fill-rule="evenodd" d="M10 5h16v3h6v4c0 5-4 9-9 9-1 2-2 3-3.5 4v3H25v3H11v-3h5.5v-3c-1.5-1-3-2-4-4-5 0-9-4-9-9V8H10zm0 6H6.5v1c0 3 1.7 5.2 4.6 6-.6-2-.9-4.3-1.1-7zm16 0c-.2 3-.5 5-1.1 7 2.9-.8 4.6-3 4.6-6v-1z"/>',
    account:'<circle cx="18" cy="12" r="6"/><path d="M6 31c0-7 5-11 12-11s12 4 12 11z"/>',
    quick:'<path d="M21 2 6 21h10l-2 13 16-21H20z"/>',
    crown:'<path d="m3 10 8 5 7-11 7 11 8-5-4 15H7zm5 18h20v4H8z"/>',
    cards:'<path d="m3 9 7-3v20l-3 1z"/><rect x="12" y="4" width="19" height="27" rx="3"/><path d="m21.5 10-4.5 7 4.5 7 4.5-7z" fill="var(--stamp-cut,#294458)"/>'
  };
  return `<svg aria-hidden="true" focusable="false" viewBox="0 0 36 36" fill="currentColor">${shapes[kind]}</svg>`;
}
function tableSign(dest,label){
  return `<button class="table-sign sign-${dest}" data-act="go:${dest}"><span class="sign-medal">${clubEmblem(dest)}</span><span class="sign-ribbon">${label}</span></button>`;
}
function lobbyHtml(){
  return `<section class="club-hero"><div class="lobby-scene"><img src="club-lobby.webp" alt="Компания за синим карточным столом">
    <nav class="table-signs" aria-label="За клубным столом">${tableSign('friends','С друзьями')}${tableSign('leaders','Лидерборд')}</nav></div>
    <div class="club-marquee"><div><h2>На вылет</h2><p>6 мест · Бесплатно</p></div>${btn('queueFree:series','Играть →','hot')}</div></section>
    <div class="club-doors"><button class="club-door private" data-act="queueFree:quick"><i>${clubEmblem('quick')}</i><span><b>Быстрая игра</b><small>4 места · Бесплатно</small></span><span class="door-arrow" aria-hidden="true">↗</span></button>
    <button class="club-door tournament" data-act="go:pro"><i>${clubEmblem('crown')}</i><span><b>Клуб профессионалов</b><small>Столы со взносом</small></span><span class="door-arrow" aria-hidden="true">↗</span></button></div>`;
}
function proTables(){
  return '<div class="pro-list">'+PRO_FEES.map(f=>`<button class="pro-seat" data-act="paidSeat:${f}" ${s.balance<f?'disabled':''}><i aria-hidden="true">◈</i><b>${num(f)} ◈</b><small>Банк ${num(f*6)} ◈</small><span>${s.balance<f?'Мало фишек':'Войти →'}</span></button>`).join('')+'</div>';
}
function friendSeat(id){
  const picked=s.invited.has(id);
  return `<button class="friend-seat" data-act="friend:${id}" aria-pressed="${picked}">${face(id)}<strong>${NAMES[id]}</strong><span class="invite-mark" aria-hidden="true">${picked?'✓':'+'}</span></button>`;
}
function leaderboard(){
  const all=s.scope==='all',players=all?[4,3,5,1]:[1,2,3];
  const rows=players.map((id,i)=>`<li><span class="standing-place">${i+1}</span>${face(id)}<strong>${NAMES[id]}</strong><b>${num((all?98520:17800)-i*1760)} ◈</b></li>`).join('');
  return seg('scope',[['all','Все'],['friends','Друзья']],s.scope)+`<ol class="standings">${rows}</ol><div class="own-standing">${face(0)}<strong>Вы</strong><b>${num(s.balance)} ◈</b></div>`;
}
function applicationHtml(id){
  const lobby=['home','welcome'].includes(id);
  const group=VIEWS[id].group;
  const emblem=id==='pro'?'crown':({entry:'cards',play:'cards',social:'friends',meta:'leaders',system:'account'})[group];
  const title=lobby?'':`<header class="room-heading"><span class="room-stamp">${clubEmblem(emblem)}</span><h2>${VIEWS[id].title}</h2></header>`;
  return `<article class="application club-app screen-${id}" data-room="${group}"><header class="appbar">
    <button class="club-logo" data-act="go:home" aria-label="Главная"><span class="brandcard">${eyes}</span>BluffCards</button>
    <div class="club-shortcuts"><span class="chip-total">${num(s.balance)} ◈</span>
      ${lobby?'<button class="how-to-play" data-act="tutorial"><b aria-hidden="true">?</b><span>Как играть</span></button>':''}
      <button class="account-medal" data-act="go:account" title="Аккаунт" aria-label="Аккаунт">${clubEmblem('account')}</button></div>
    </header><div class="appbody">${title}${appBody(id)}</div></article>`;
}
function seatsAroundTable(players,actor,last){
  const positions={
    1:[[50,9]],2:[[18,22],[82,22]],3:[[12,34],[50,8],[88,34]],
    4:[[12,39],[32,9],[68,9],[88,39]],5:[[11,52],[20,17],[50,7],[80,17],[89,52]],
    6:[[10,62],[12,33],[33,8],[67,8],[88,33],[90,62]],
    7:[[11,73],[10,44],[19,19],[50,7],[81,19],[90,44],[89,73]],
    8:[[12,78],[10,48],[14,22],[35,7],[65,7],[86,22],[90,48],[88,78]],
    9:[[13,79],[10,54],[11,28],[27,10],[50,6],[73,10],[89,28],[90,54],[87,79]],
    10:[[13,83],[10,60],[10,37],[16,16],[38,6],[62,6],[84,16],[90,37],[90,60],[87,83]]
  };
  return players.map((p,i)=>{
    const [x,y]=positions[players.length][i];
    return `<button class="seat ${p===actor?'actor':''} ${p===last?'target':''}" style="left:${x}%;top:${y}%" data-place="${p.id}" data-act="person:${p.id}">${face(p.id)}<b>${p.name}</b><small><span data-hand-count="${p.id}">${p.exit!==Infinity?'вышел':p.hand.length}</span> ▱ · −<span data-minus="${p.id}">${p.minus.length}</span></small></button>`;
  }).join('');
}
function searchClub(){
  const count=s.mode==='quick'?4:6,joined=1;
  return `<div class="waiting-table"><div class="waiting-seats">${range(count).map(i=>i<joined?face(i):'<span class="empty-seat">·</span>').join('')}</div>
    <strong>${namesOf(s.mode)}</strong><p>Поиск · <span data-search-time>${s.searchTime}</span> / 20 с</p></div>
    ${progress(s.searchTime*5)}${btn(s.paid?'go:pro':'go:home','Отмена')}`;
}
function roomSeats(){
  const seats=range(s.roomSize).map(i=>{
    if(i<s.roomHumans)return face(i);
    if(i<s.roomHumans+s.roomBot)return '<span class="room-bot">Бот</span>';
    return '<button class="empty-seat" data-act="go:invite" aria-label="Пригласить на свободное место">+</button>';
  }).join('');
  return `<div class="waiting-table room-seating"><div class="waiting-seats">${seats}</div>
    <strong>${esc(s.company)}</strong><p>${s.roomHumans+s.roomBot} / ${s.roomSize} мест · ${s.roomCode}</p></div>`;
}
function winnersBanner(groups,place){
  const top=groups[0];
  return `<div class="winners-banner"><div class="winner-crown">${clubEmblem('crown')}</div><div class="winner-faces">${top.map(face).join('')}</div>
    <strong>${top.map(id=>NAMES[id]).join(' и ')}</strong><small>Первое место · ваше место ${place}</small></div>`;
}
