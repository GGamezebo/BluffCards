// Dialog deep links reuse the same actions as the buttons in the prototype.
const MAP_DIALOGS={
  'table-menu':{title:'Меню стола',host:'table',action:'menu',next:['history','reactions','offline','away','round','leave']},
  history:{title:'История ходов',host:'table',action:'history'},
  'rank-info':{title:'Состояние номинала',host:'table',action:'rankinfo:0'},
  report:{title:'Жалоба на игрока',host:'player',action:'report'},
  block:{title:'Блокировка игрока',host:'player',action:'block'},
  'lesson-done':{title:'Миссия пройдена',host:'draw',next:['home'],open(){showLessonResult();}},
  'pro-entry':{title:'Подтверждение взноса',host:'pro',action:'paidSeat:100',next:['search']},
  'new-group':{title:'Новая компания',host:'friends',action:'newGroup',next:['room']},
  'invite-link':{title:'Ссылка комнаты',host:'invite',open(){showInviteLink();}},
  'link-account':{title:'Привязка аккаунта',host:'account',action:'provider:Google'},
  'delete-account':{title:'Удаление аккаунта',host:'account',action:'delete',next:['welcome']}
};
const mapNodes=Object.fromEntries(Object.entries(VIEWS).map(([id,v])=>[id,{...v,links:new Set(v.links)}]));
for(const [id,dialog] of Object.entries(MAP_DIALOGS)){
  mapNodes[id]={title:dialog.title,group:VIEWS[dialog.host].group,links:new Set([dialog.host,...(dialog.next||[])]),dialog:true};
  mapNodes[dialog.host].links.add(id);
}
// Shared actions on the board and in the application header/footer.
const boardScreens=['table','declare','transfer','check','reveal','draw'];
const commonNav=['home','account'];
for(const id of boardScreens){
  for(const dest of ['table-menu','rank-info','player','reactions'])mapNodes[id].links.add(dest);
}
const mapGroups={...GROUPS};
let mapFocus='table';
let mapGroup='all';
function mapAnchor(id){
  const n=mapNodes[id];
  return '<a class="map-link" data-group="'+n.group+'" href="#'+id+'">'+n.title+'</a>';
}
function mapConnections(id){
  const links=new Set(mapNodes[id].links);
  if(VIEWS[id] && !boardScreens.includes(id))for(const dest of commonNav)if(dest!==id)links.add(dest);
  return links;
}
function drawConnections(){
  const node=mapNodes[mapFocus];
  const incoming=Object.keys(mapNodes).filter(id=>mapConnections(id).has(mapFocus));
  const outgoing=[...mapConnections(mapFocus)];
  const side=(title,ids)=>'<section class="map-side"><h3>'+title+'</h3><div>'+ (ids.length?ids.map(mapAnchor).join(''):'<span class="mini">Первый экран</span>')+'</div></section>';
  $('#connections').innerHTML=side('Откуда можно попасть',incoming)+'<div class="map-center" data-group="'+node.group+'"><span>Выбранное окно</span><a href="#'+mapFocus+'">'+node.title+' ↗</a></div>'+side('Куда можно перейти',outgoing);
  $('#focus-map-node').value=mapFocus;
}
function renderMap(){
  const options=Object.entries(mapGroups).map(([group,title])=>'<optgroup label="'+title+'">'+Object.entries(mapNodes).filter(([,n])=>n.group===group).map(([id,n])=>'<option value="'+id+'">'+n.title+'</option>').join('')+'</optgroup>').join('');
  const sections=Object.entries(mapGroups).filter(([g])=>mapGroup==='all'||g===mapGroup).map(([g,title])=>{
    const nodes=Object.entries(mapNodes).filter(([,n])=>n.group===g);
    return '<section class="map-section" data-group="'+g+'"><h2>'+title+'</h2><div class="map-deck">'+nodes.map(([id,n])=>{
      const links=[...n.links];
      return '<article class="map-card'+(n.dialog?' dialog-card':'')+'"><div class="map-card-head"><a href="#'+id+'">'+n.title+' <span>↗</span></a><button data-map-focus="'+id+'" aria-label="Показать все связи: '+n.title+'" title="Все связи">⇄</button></div><div class="map-destinations"><span aria-label="Переходы">→</span><div>'+links.map(mapAnchor).join('')+'</div></div></article>';
    }).join('')+'</div></section>';
  }).join('');
  $('#main').innerHTML='<div class="topline"><div><div class="crumb">Атлас игры / Навигация</div><h1>Карта окон и переходов</h1></div></div><p class="map-intro">Нажми на название, чтобы открыть окно. Кнопка ⇄ показывает его входящие и исходящие переходы.</p><div class="connection-box"><label for="focus-map-node">Связи окна</label><select id="focus-map-node">'+options+'</select><div id="connections" class="connections"></div></div><h2 class="padtop">Все окна</h2><div class="map-filter">'+[['all','Все разделы'],...Object.entries(mapGroups)].map(([g,label])=>'<button aria-pressed="'+(mapGroup===g)+'" data-map-group="'+g+'">'+label+'</button>').join('')+'</div>'+sections+'<section class="map-section"><h2>Общая навигация</h2><p class="mini">Логотип и значок аккаунта доступны в шапке вне игрового стола.</p><div class="map-filter">'+commonNav.map(mapAnchor).join('')+'</div></section>';
  drawConnections();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-map-focus],[data-map-group]');
  if(!b)return;
  if(b.dataset.mapFocus){
    mapFocus=b.dataset.mapFocus;drawConnections();$('#focus-map-node').focus();
  }else{
    mapGroup=b.dataset.mapGroup;renderMap();
    document.querySelector('[data-map-group="'+mapGroup+'"]').focus({preventScroll:true});
  }
});
document.addEventListener('change',e=>{
  if(e.target.id==='focus-map-node'){mapFocus=e.target.value;drawConnections();}
});
