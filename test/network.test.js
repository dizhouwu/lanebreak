const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const http = require('node:http');
const { createServer } = require('../lanebreak_server.js');

function connect(address) {
  const ws = new WebSocket(address);
  const messages = [];
  const pending = new Set();
  ws.addEventListener('message', event => {
    const data = JSON.parse(event.data);
    const waiter = [...pending].find(w => w.fn(data));
    if (waiter) {
      pending.delete(waiter);
      clearTimeout(waiter.timer);
      waiter.resolve(data);
    } else {
      messages.push(data);
      if (messages.length > 250) messages.shift();
    }
  });
  return {
    ws,
    send: data => ws.send(JSON.stringify(data)),
    opened: once(ws,'open'),
    get(fn) {
      const index = messages.findIndex(fn);
      if (index >= 0) return Promise.resolve(messages.splice(index,1)[0]);
      return new Promise((resolve,reject) => {
        const waiter = { fn,resolve };
        waiter.timer = setTimeout(() => {
          pending.delete(waiter);
          reject(new Error('Timed out waiting for server message'));
        }, 4000);
        pending.add(waiter);
      });
    }
  };
}
async function setup(t) {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.shutdown());
  const host = '127.0.0.1:' + server.address().port;
  return { http: 'http://' + host, ws: 'ws://' + host + '/ws' };
}
const type = t => data => data.t === t;

test('private room, server-side orders, seat privacy and disconnect recovery', async t => {
  const url = await setup(t);
  const page = await fetch(url.http);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /<title>Lanebreak/);
  assert.deepEqual(await (await fetch(url.http + '/healthz')).json(), { connections: 0, rooms: 0 });
  const a = connect(url.ws), b = connect(url.ws);
  await Promise.all([a.opened,b.opened]);
  a.send({ t:'host',hero:'brakk',name:'Alpha' });
  const waiting = await a.get(type('wait'));
  assert.match(waiting.code,/^[A-Z]{4}$/);
  assert.equal(waiting.pub,false);
  b.send({ t:'join',code:waiting.code,hero:'orrin',name:'Beta' });
  const [aSeat,bSeat] = await Promise.all([a.get(type('start')), b.get(type('start'))]);
  assert.equal(aSeat.team, 0);
  assert.equal(bSeat.team, 1);
  const state = (await b.get(type('s'))).s;
  assert.equal(state.heroes[0].name, 'Alpha');
  assert.equal(state.heroes[1].name, 'Beta');
  assert.equal(state.heroes[0].gold, undefined);
  assert.deepEqual(state.heroes[0].loadout, []);
  assert.equal(state.heroes[1].gold, 600);
  a.send({ t:'o',o:'buy',id:'boots', gold: 9999 });
  const purchase = (await a.get(m => m.t === 's' && m.s.heroes[0].inventory.length > 0)).s;
  assert.ok(purchase.heroes[0].gold < 200);
  assert.ok(purchase.effects.some(e => e.kind === 'purchase' && e.item === 'boots' && e.cost === 450));
  const opponent = (await b.get(m => m.t === 's' && m.s.heroes[0].loadout.includes('boots'))).s;
  assert.deepEqual(opponent.heroes[0].loadout, ['boots']);
  assert.equal(opponent.heroes[0].inventory, undefined);
  assert.equal(opponent.heroes[0].gold, undefined);
  assert.equal(opponent.heroes[0].itemsReady, undefined);
  assert.equal(opponent.effects.some(e => e.kind === 'purchase'), false);
  a.send({ t:'o',o:'move',x:650,y:530 });
  assert.ok((await b.get(m => m.t === 's' && m.s.heroes[0].x > 140)).s.time > 0);
  b.send({ t:'o',o:'cast',i:12,x:800,y:450 });
  assert.match((await b.get(type('err'))).msg,/Invalid order/);
  const closed = once(b.ws,'close');
  b.ws.close();
  await closed;
  const replacement = connect(url.ws);
  await replacement.opened;
  replacement.send({ t:'rejoin',code:bSeat.code,token:'a'.repeat(48) });
  assert.match((await replacement.get(type('err'))).msg,/expired/);
  replacement.send({ t:'rejoin',code:bSeat.code,token:bSeat.token });
  const seat = await replacement.get(type('start'));
  assert.equal(seat.team, 1);
  assert.equal(seat.code, bSeat.code);
  assert.ok((await replacement.get(type('s'))).s.time > 0);
});

test('public queue pairs two players and refuses cross-origin browser upgrades', async t => {
  const url = await setup(t);
  const status = await new Promise((resolve,reject) => {
    const request = http.get(url.http + '/ws', {
      headers: { Connection:'Upgrade', Upgrade:'websocket', 'Sec-WebSocket-Version':'13',
        'Sec-WebSocket-Key':'dGhlIHNhbXBsZSBub25jZQ==', Origin:'https://another.example' }
    }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error',reject);
  });
  assert.equal(status,403);
  const a = connect(url.ws), b = connect(url.ws);
  await Promise.all([a.opened,b.opened]);
  a.send({ t:'find',hero:'vesper' });
  const waiting = await a.get(type('wait'));
  assert.equal(waiting.pub,true);
  b.send({ t:'find',hero:'brakk' });
  const [first,second] = await Promise.all([a.get(type('start')),b.get(type('start'))]);
  assert.equal(first.code,second.code);
  assert.equal(first.code,waiting.code);
});

test('only a seated player can surrender and both players receive the same final result', async t => {
  const url = await setup(t);
  const a = connect(url.ws), b = connect(url.ws);
  t.after(() => { a.ws.close(); b.ws.close(); });
  await Promise.all([a.opened, b.opened]);
  a.send({ t:'surrender' });
  assert.match((await a.get(type('err'))).msg, /No active match/);

  a.send({ t:'host', hero:'brakk' });
  const { code } = await a.get(type('wait'));
  b.send({ t:'join', code, hero:'orrin' });
  const [aSeat] = await Promise.all([a.get(type('start')), b.get(type('start'))]);

  // The authenticated seat determines the result, even if a payload claims another team.
  a.send({ t:'surrender', team:1 });
  const ended = message => message.t === 's' && message.s.mode === 'ended';
  const results = await Promise.all([a.get(ended), b.get(ended)]);
  for (const { s } of results) {
    assert.equal(s.winner, 1);
    assert.equal(s.endReason, 'surrender');
  }

  b.send({ t:'surrender' });
  const replacement = connect(url.ws);
  t.after(() => replacement.ws.close());
  await replacement.opened;
  replacement.send({ t:'rejoin', code, token:aSeat.token });
  const { s:rejoined } = await replacement.get(ended);
  assert.equal(rejoined.winner, 1);
  assert.equal(rejoined.endReason, 'surrender');
});

test('online Neris can queue marks and cast before receiving a new snapshot', async t => {
  const url = await setup(t);
  const a = connect(url.ws), b = connect(url.ws);
  t.after(() => { a.ws.close(); b.ws.close(); });
  await Promise.all([a.opened, b.opened]);
  a.send({ t:'host', hero:'neris' });
  const { code } = await a.get(type('wait'));
  b.send({ t:'join', code, hero:'mirel' });
  await Promise.all([a.get(type('start')), b.get(type('start'))]);
  const cast = i => a.send({ t:'o', o:'cast', i, x:700, y:450 });
  cast(2);
  cast(0);
  cast(3);
  const moved = message => message.t === 's' && message.s.heroes[0].jump > 0;
  const [host, guest] = await Promise.all([a.get(moved), b.get(moved)]);
  assert.equal(host.s.heroes[0].x, 620);
  assert.deepEqual(host.s.heroes[0].marks, []);
  assert.ok(host.s.heroes[0].cd[3] > host.s.time);
  assert.equal(guest.s.heroes[0].marks, undefined);
  assert.equal(guest.s.heroes[1].hero, 'mirel');
});
