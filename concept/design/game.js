/* Local simulation for the design atlas. The production match belongs on Nakama. */
const RANKS = ['2','3','4','5','6','7','8','9','10','В','Д','К','Т'];
const SUITS = ['♣','♦','♥','♠'];
const NAMES = ['Вы','Ира','Макс','Маша','Глеб','Лена','Саша','Ника','Олег','Яна'];
const rankOf = card => Math.floor(card / 4);
const range = size => Array.from({length:size}, (_, i) => i);
function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i],copy[j]] = [copy[j],copy[i]];
  }
  return copy;
}
class Table {
  constructor(ids, first = 0) {
    this.players = ids.map(id => ({id, name:NAMES[id], hand:[], minus:[], exit:Infinity}));
    this.deck = shuffled(range(52));
    this.pile = [];
    this.packet = [];
    this.target = ids.length < 5 ? 7 : 5;
    this.first = first;
    this.actor = this.opener = first;
    this.rank = null;
    this.log = [];
    this.events = [];
    this.exitCount = 0;
    this.phase = 'open';
    this.draw(first);
    this.actor = this.opener = this.available(first);
    this.turnEvent(null);
    this.note('Карты розданы');
  }
  note(line) { this.log.push(line); }
  turnEvent(from) {
    if(this.phase!=='done')this.events.push({type:'turn',from,to:this.players[this.actor].id});
  }
  takeFours(p) {
    for (const rank of RANKS.keys()) {
      if (p.hand.filter(c => rankOf(c) === rank).length !== 4) continue;
      p.minus.push(rank);
      const four=p.hand.filter(c=>rankOf(c)===rank);
      p.hand = p.hand.filter(c => rankOf(c) !== rank);
      this.events.push({type:'four',player:p.id,rank,count:4,cards:p.id===0?four:undefined});
      this.note(p.name + ' · ' + RANKS[rank] + ' × 4 → −1');
    }
  }
  draw(first) {
    for (let offset = 0; offset < this.players.length; offset++) {
      const p = this.players[(first + offset) % this.players.length];
      if (p.exit !== Infinity) continue;
      let drawn = 0;
      while (p.hand.length < this.target && this.deck.length) {
        const card=this.deck.pop();
        p.hand.push(card);
        const previous=this.events.at(-1);
        if(previous?.type==='draw' && previous.player===p.id){
          previous.count++;
          if(p.id===0)previous.cards.push(card);
        }else this.events.push({type:'draw',player:p.id,count:1,cards:p.id===0?[card]:undefined});
        drawn++;
        this.takeFours(p);
      }
      if (drawn) this.note(p.name + ' · добор +' + drawn);
    }
  }
  available(index) {
    for (let i = 0; i < this.players.length; i++) {
      const n = (index + i) % this.players.length;
      if (this.players[n].hand.length) return n;
    }
    return index % this.players.length;
  }
  get dead() { return this.players.flatMap(p => p.minus); }
  get mandatory() { return this.packet.length > 0 && !this.players[this.last].hand.length; }
  play(cards, rank) {
    const p = this.players[this.actor];
    if (!['open','reply'].includes(this.phase) || this.mandatory || !cards.length ||
        new Set(cards).size !== cards.length || !cards.every(c => p.hand.includes(c))) return false;
    if (this.phase === 'open') {
      if (!Number.isInteger(rank) || rank < 0 || rank > 12 || this.dead.includes(rank)) return false;
      this.opener = this.actor;
      this.rank = rank;
    }
    this.packet = [...cards];
    this.pile.push(...cards);
    p.hand = p.hand.filter(c => !cards.includes(c));
    this.last = this.actor;
    this.actor = this.available(this.last + 1);
    this.phase = 'reply';
    this.events=[{type:'play',player:p.id,count:cards.length,cards:p.id===0?[...cards]:undefined}];
    this.turnEvent(p.id);
    this.note(p.name + ' · ' + cards.length + ' × ' + RANKS[this.rank]);
    return true;
  }
  check(index) {
    if (this.phase !== 'reply' || !this.packet.length || !Number.isInteger(index) || index < 0 || index >= this.packet.length) return;
    const card = this.packet[index];
    const truth = rankOf(card) === this.rank;
    const loser = truth ? this.actor : this.last;
    this.reveal = {card,truth,loser,count:this.pile.length,checker:this.actor,rank:this.rank};
    this.phase = 'reveal';
    this.events=[{type:'reveal',player:this.players[this.actor].id,card}];
    this.note('Открыта ' + RANKS[rankOf(card)] + SUITS[card%4] + ' · стопку забирает ' + this.players[loser].name);
  }
  settle() {
    if (this.phase !== 'reveal') return;
    const r = this.reveal, loser = this.players[r.loser];
    this.events=[{type:'collect',player:loser.id,count:this.pile.length,cards:loser.id===0?[...this.pile]:undefined}];
    loser.hand.push(...this.pile);
    this.takeFours(loser);
    this.packet = []; this.pile = [];
    this.draw(this.opener);
    for (let i=0; i<this.players.length; i++) {
      const p=this.players[(this.opener+i)%this.players.length];
      if (!p.hand.length && !this.deck.length && p.exit === Infinity) p.exit=++this.exitCount;
    }
    this.actor = this.opener = this.available(r.checker + (r.truth ? 1 : 0));
    this.rank = null;
    this.phase = this.dead.length === 13 ? 'done' : 'open';
    this.turnEvent(this.players[r.checker].id);
  }
  botTurn() {
    const hand = this.players[this.actor].hand;
    if (this.phase === 'reply' && (this.mandatory || this.pile.length > 8 || Math.random() < .55)) {
      this.check(Math.floor(Math.random() * this.packet.length));
    } else {
      const rank = this.phase === 'open' ? rankOf(hand[0]) : this.rank;
      let cards = hand.filter(c => rankOf(c) === rank);
      if (!cards.length || Math.random() < .35) cards = shuffled(hand).slice(0, 1 + Math.floor(Math.random()*3));
      this.play(cards, rank);
    }
  }
  standings() {
    return [...this.players].sort((a,b) => a.minus.length-b.minus.length || a.exit-b.exit);
  }
  static scene(kind='reply', count=4) {
    const t = new Table(range(count));
    if (kind === 'deal') return t;
    const p=t.players, last=count-1;
    p.forEach(x=>{x.hand=[];x.minus=[];x.exit=Infinity;});
    t.log=[]; t.deck=range(52);
    const remove=ids=>{t.deck=t.deck.filter(c=>!ids.includes(c));return ids;};
    t.events=[];
    if(kind==='large'){
      p[0].hand=remove(range(52).filter(c=>c%4!==3));
      t.packet=remove([47]);t.pile=[...t.packet];
      for(let i=1;i<count;i++)p[i].hand=t.deck.splice(0,Math.floor(t.deck.length/(count-i)));
      t.last=last;t.actor=0;t.opener=last;t.rank=11;t.phase='reply';
      t.note(p[last].name+' · Один король');return t;
    }
    const retired=kind==='end' ? 12 : count<=6 ? 2 : 0;
    for (let r=0;r<retired;r++) {remove(range(4).map(s=>r*4+s));p[r%count].minus.push(r);}
    if (kind==='end') {
      p[0].hand=remove([48,49,50]); p[last].hand=remove([51]);
      p.forEach((x,i)=>{if(i!==0 && i!==last)x.exit=++t.exitCount;});
      t.actor=last; t.play([51],12); return t;
    }
    t.packet=remove([44,21,46]);
    t.pile=[...remove(count<=6 ? [12,15,23,28,30,32,36,41] : [12]),...t.packet];
    const hand=[8,17,27,38,48];
    p[0].hand=remove(count<=4 ? [...hand,34,43] : hand);
    t.deck=shuffled(t.deck);
    for(let round=0;round<5;round++) {
      for(let i=1;i<count && t.deck.length;i++) {
        if ((kind==='last' && i===last) || (count>6 && round===4 && i===last)) continue;
        const index=t.deck.findIndex(c=>p[i].hand.filter(x=>rankOf(x)===rankOf(c)).length<3);
        if(index>=0)p[i].hand.push(...t.deck.splice(index,1));
      }
    }
    t.actor=0; t.opener=1; t.last=last; t.rank=11; t.phase='reply';
    t.note(p[last].name+' · Три короля'); return t;
  }
}
