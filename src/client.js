(function () {
  const $ = id => document.getElementById(id);
  const { HEROES, ITEMS, DIFF, COLORS, TEAM, UNLOCKS, WIDTH, HEIGHT } = LanebreakRules;
  const { Match, buyPlan, shopOffer, sellValue, spellDamage, pickTarget, pickUnit, xpGoal } = Lanebreak;
  const { Renderer, portrait } = LanebreakPaint;
  const keys = ['Q', 'W', 'E', 'R'];
  const heroKeys = Object.keys(HEROES);
  const difficulties = Object.keys(DIFF);
  const arena = $('arena');
  const renderer = new Renderer(arena, $('minimap'));
  const hosted = /^(http|https):$/.test(location.protocol);
  const prefs = {
    load(key) { try { return localStorage.getItem('lanebreak:' + key); } catch { return null; } },
    save(key, value) { try { localStorage.setItem('lanebreak:' + key, value); } catch {} }
  };
  let selected = heroKeys.includes(prefs.load('hero')) ? prefs.load('hero') : 'vesper';
  let difficulty = difficulties.includes(prefs.load('difficulty')) ? prefs.load('difficulty') : 'normal';
  let quality = ['auto','high','medium','low'].includes(prefs.load('quality')) ? prefs.load('quality') : 'auto';
  let muted = prefs.load('muted') === 'true';
  let audio, local, team = 0, snapshot, remote = false, demo = false, paused = false, view = 'solo';
  let renderMark, hovered, lastEffect = 0, hintTimer, lastUi = 0, wasPaused = false;
  let cursorOnArena = false, edgePointer, shopFocus = null, shopSelection = null, tooltipTarget = null, inspectedId = null;
  let placeCameraOnHero = false, cameraDrag = null, resultShown = false;
  let socket, seat, room, waiting = false, retry = 0, networkAction = null;
  let clockOffset = null, renderedTime = 0, wasDead = false;
  const history = [];
  const panKeys = new Set();
  const game = $('game');
  const castSounds = {
    bolt: [700,.12,'triangle',.05,.6], nova: [150,.25,'square',.06,.5], dash: [300,.20,'sawtooth',.05,1.8],
    blink: [900,.15,'sine',.05,.5], buff: [500,.20,'triangle',.06,1.5]
  };

  function make(tag, text, className) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function bindTooltip(button) {
    for (const type of ['pointerenter','focus']) button.addEventListener(type, () => {
      tooltipTarget = button;
      updateTooltip();
    });
    for (const type of ['pointerleave','blur']) button.addEventListener(type, () => {
      if (tooltipTarget === button) tooltipTarget = null;
      updateTooltip();
    });
  }
  function updateTooltip() {
    const panel = $('hudTooltip');
    const text = tooltipTarget?.dataset.tip;
    panel.hidden = !text || !$('matchOverlay').hidden;
    if (panel.hidden) return;
    if (panel.textContent !== text) panel.textContent = text;
    const rect = tooltipTarget.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(rect.left - 12, innerWidth - panel.offsetWidth - 8)) + 'px';
    panel.style.bottom = (innerHeight - rect.top + 8) + 'px';
  }
  function watchShopTile(button, target) {
    const open = () => {
      shopFocus = target;
      if (snapshot) updateShopDetails(snapshot.heroes[team], snapshot.time);
    };
    const close = () => {
      if (shopFocus !== target) return;
      shopFocus = null;
      if (snapshot) updateShopDetails(snapshot.heroes[team], snapshot.time);
    };
    for (const type of ['pointerenter','focus']) button.addEventListener(type, open);
    for (const type of ['pointerleave','blur']) button.addEventListener(type, close);
  }
  function buyButton(id) {
    const button = make('button', null, 'shopBuy');
    button.type = 'button';
    button.dataset.buy = id;
    button.addEventListener('click', () => issue({ o: 'buy', id }));
    return button;
  }
  function updateBuyButton(button, h, time) {
    const id = button.dataset.buy, item = ITEMS[id], plan = shopOffer(h,id,time,h.canShop);
    button.textContent = (plan.reason ? '' : 'Buy ') + plan.cost + 'g';
    button.dataset.buyable = !plan.reason;
    button.setAttribute('aria-disabled', !!plan.reason);
    button.setAttribute('aria-label', item.name + ' · ' + (plan.reason || 'Buy for ' + plan.cost + ' gold'));
    button.title = plan.reason || 'Buy ' + item.name + ' for ' + plan.cost + ' gold';
  }
  function buildUi() {
    for (const [index, id] of heroKeys.entries()) {
      const h = HEROES[id], button = make('button', null, 'heroCard');
      button.dataset.hero = id;
      button.title = h.role;
      const pic = make('canvas');
      pic.width = 360; pic.height = 236;
      pic.setAttribute('aria-hidden', 'true');
      portrait(pic, id);
      const cardText = make('span', null, 'cardText');
      cardText.append(make('strong', h.name), make('small', h.title));
      button.append(pic, make('kbd', index + 1), cardText);
      button.addEventListener('click', () => pick(id));
      $('heroes').append(button);
    }
    for (const button of $('difficulties').children) button.addEventListener('click', () => setDifficulty(button.dataset.difficulty));
    for (const [i, key] of keys.entries()) {
      const tile = make('div', null, 'abilityTile');
      const button = make('button');
      button.append(make('kbd', key), make('span'));
      button.addEventListener('click', () => aim('cast', i));
      bindTooltip(button);
      tile.append(make('small', null, 'abilityName'), button);
      $('abilities').append(tile);
    }
    for (let i = 0; i < 6; i++) {
      const button = make('button');
      button.append(make('kbd', i + 1), make('span', '–'));
      button.addEventListener('click', () => {
        if ($('shop').hidden) aim('item', i);
        else issue({ o:'sell', i });
      });
      bindTooltip(button);
      $('inventory').append(button);
    }
    for (const button of document.querySelectorAll('[data-utility]')) {
      button.addEventListener('click', () => issue({ o: button.dataset.utility }));
    }
    const groups = [
      ['Consumables', id => ['potion','tome'].includes(id)],
      ['Basics', id => ITEMS[id].stats && !ITEMS[id].parts],
      ['Upgrades', id => id === 'rift' || (ITEMS[id].parts && !ITEMS[id].master)],
      ['Masterworks', id => ITEMS[id].master]
    ];
    for (const [label, test] of groups) {
      const group = make('section', null, 'shopGroup'), grid = make('div', null, 'itemGrid');
      group.append(make('h3', label), grid);
      for (const id of Object.keys(ITEMS).filter(test)) {
        const item = ITEMS[id], card = make('div', null, 'shopItem');
        const select = make('button', item.name, 'shopSelect');
        select.type = 'button';
        select.title = item.text + (item.parts ? ' · Click to view recipe' : '');
        select.dataset.item = id;
        select.setAttribute('aria-pressed', 'false');
        select.append(make('small'));
        select.addEventListener('click', () => {
          shopSelection = id;
          shopFocus = null;
          if (snapshot) updateShop(snapshot.heroes[team], snapshot.time);
        });
        card.append(select,buyButton(id));
        grid.append(card);
      }
      $('shopItems').append(group);
    }
    $('name').value = prefs.load('name') || '';
    $('name').addEventListener('input', () => prefs.save('name', $('name').value));
    pick(selected);
    setDifficulty(difficulty);
    updateSettings();
  }
  function pick(id) {
    selected = id;
    prefs.save('hero', id);
    for (const el of $('heroes').children) el.setAttribute('aria-pressed', el.dataset.hero === id);
  }
  function setDifficulty(value) {
    difficulty = value;
    prefs.save('difficulty', value);
    for (const el of $('difficulties').children) el.setAttribute('aria-pressed', el.dataset.difficulty === value);
  }
  function tab(next) {
    view = next;
    $('soloPanel').hidden = next !== 'solo';
    $('onlinePanel').hidden = next !== 'online';
    $('soloTab').setAttribute('aria-pressed', next === 'solo');
    $('onlineTab').setAttribute('aria-pressed', next === 'online');
    if (next === 'online' && !hosted) status('Online play requires the Lanebreak server. Solo is available in this file.');
  }
  function updateSettings() {
    $('audio').textContent = muted ? 'Sound off' : 'Sound on';
    $('audio').setAttribute('aria-pressed', !muted);
    $('quality').textContent = 'Graphics ' + quality;
    renderer.quality = quality;
    renderer.auto = 1;
    renderer.measure = null;
  }
  function changeAudio() {
    muted = !muted;
    prefs.save('muted', muted);
    updateSettings();
    if (!muted) beep(540, .08);
  }
  function changeQuality() {
    const modes = ['auto','high','medium','low'];
    quality = modes[(modes.indexOf(quality) + 1) % modes.length];
    prefs.save('quality', quality);
    updateSettings();
    hint('Graphics: ' + quality);
  }
  function initAudio() {
    try {
      audio ||= new AudioContext();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
    } catch {}
  }
  function beep(freq, duration = .075, type = 'sine', volume = .06, slide = .58) {
    if (muted) return;
    initAudio();
    if (!audio) return;
    try {
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audio.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30,freq * slide), audio.currentTime + duration);
      gain.gain.setValueAtTime(volume, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
      osc.connect(gain).connect(audio.destination);
      osc.start(); osc.stop(audio.currentTime + duration);
    } catch {}
  }
  function status(text) { $('roomStatus').textContent = text; }
  function hint(text) {
    $('hint').textContent = text;
    $('hint').hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { $('hint').hidden = true; }, 2450);
  }
  function enter() {
    $('lobby').hidden = true;
    game.hidden = false;
    document.body.classList.add('matchMode');
    $('feed').replaceChildren();
    $('hint').hidden = true;
    $('matchOverlay').hidden = true;
    $('back').textContent = remote ? 'Surrender' : demo ? 'Stop watching' : 'End match';
    resultShown = false;
    $('shop').hidden = true;
    $('shopFeedback').hidden = true;
    $('deathNotice').hidden = true;
    $('hudTooltip').hidden = true;
    shopFocus = shopSelection = tooltipTarget = null;
    selectUnit(null);
    stopCameraDrag();
    panKeys.clear();
    renderer.focus = null;
    placeCameraOnHero = true;
    cameraLabel(true);
    renderer.displayed = null;
    paused = false;
    renderMark = null;
    hovered = null;
    cursorOnArena = false;
    edgePointer = null;
    lastEffect = 0;
    lastUi = -1;
    wasDead = false;
  }
  function goMenu() {
    if (seat) safeSeat(null);
    disconnect();
    local = null;
    remote = false;
    snapshot = null;
    history.length = 0;
    $('lobby').hidden = false;
    game.hidden = true;
    document.body.classList.remove('matchMode');
    renderer.dirty = true;
    if (/^#(?:play|demo)=/.test(location.hash)) clearHash();
  }
  function clearHash() {
    try { historyApi.replaceState(null, '', location.href.split('#')[0]); } catch { location.hash = ''; }
  }
  const historyApi = window.history;
  function solo(hero = selected, diff = difficulty, watch = false, seconds = 0) {
    disconnect();
    safeSeat(null);
    remote = false; demo = watch; team = 0;
    const opponents = heroKeys.filter(key => key !== hero);
    local = new Match({ heroes: [hero, opponents[Math.floor(Math.random() * opponents.length)]],
      names: [$('name').value.trim().slice(0, 20)], bots: [watch ? diff : null, diff] });
    for (let i = 0; i < seconds * 60 && local.mode === 'match'; i++) local.step(1 / 60);
    snapshot = local.snapshot(0, watch);
    enter();
    if (watch) hint('Spectating · computer vs computer');
    else {
      beep(650, .10);
      hint('Right-click to move · Left-click to inspect · B to shop');
    }
  }
  function overlay(title, text, label, action, { tone = '', cancel } = {}) {
    const panel = $('matchOverlay');
    const primary = $('overlayAction');
    const secondary = $('overlaySecondary');
    panel.dataset.tone = tone;
    $('overlayTitle').textContent = title;
    $('overlayText').textContent = text;
    primary.textContent = label;
    primary.onclick = action;
    secondary.hidden = !cancel;
    secondary.onclick = cancel || null;
    $('matchStats').hidden = true;
    $('hudTooltip').hidden = true;
    panel.hidden = false;
    (cancel ? secondary : primary).focus({ preventScroll: true });
  }
  function confirmEndMatch() {
    if (demo) return goMenu();
    if (snapshot?.mode !== 'match') return;
    paused = !remote;
    const cancel = () => {
      paused = false;
      $('matchOverlay').hidden = true;
      $('back').blur();
    };
    if (remote) {
      overlay('Surrender this match?', 'Your opponent will win the match.', 'Surrender', () => {
        cancel();
        if (socket?.readyState !== WebSocket.OPEN) return hint('Reconnecting…');
        socket.send(JSON.stringify({ t:'surrender' }));
      }, { cancel });
    } else {
      overlay('End this match?', 'Your run will end and you’ll see your match stats.', 'End match', () => {
        local.finish(null, 'quit');
        snapshot = local.snapshot(team);
      }, { cancel });
    }
  }
  function pause() {
    if (remote || !snapshot || snapshot.mode === 'ended') return;
    paused = !paused;
    if (paused) overlay('Paused', 'P, Esc, or click to continue.', 'Resume match', pause);
    else $('matchOverlay').hidden = true;
  }
  function help() {
    if (!game.hidden && !remote && !paused && snapshot?.mode !== 'ended') {
      wasPaused = true; paused = true;
    }
    if (!$('controls').open) $('controls').showModal();
  }
  function issue(cmd) {
    if (!snapshot || paused || demo || snapshot.mode !== 'match') return false;
    let error;
    if (remote) {
      if (socket?.readyState !== WebSocket.OPEN) { hint('Reconnecting…'); return false; }
      const h = snapshot.heroes[team];
      if (h.hp <= 0 && cmd.o !== 'buy' && cmd.o !== 'sell') return false;
      if (cmd.o === 'cast') {
        const spell = HEROES[h.hero].abilities[cmd.i];
        if (h.level < UNLOCKS[cmd.i]) error = 'Unlocks at level ' + UNLOCKS[cmd.i];
        else if (h.cd[cmd.i] > snapshot.time) error = 'Ability cooling down';
        else if (h.mana < spell.mana) error = 'Not enough mana';
      }
      if (cmd.o === 'buy') error = shopOffer(h, cmd.id, snapshot.time, h.canShop).reason;
      if (cmd.o === 'sell' && !h.canShop) error = 'Return to your fountain to sell items';
      if (!error) socket.send(JSON.stringify({ t: 'o', ...cmd }));
    } else {
      error = local.order(team, cmd);
      snapshot = local.snapshot(team, demo);
    }
    if (error) {
      if (cmd.o === 'buy' && !$('shop').hidden) shopFeedback(error, true);
      else hint(error);
      return false;
    }
    if (cmd.o === 'sell') beep(600,.10,'sine',.045,.7);
    return true;
  }
  function aim(o, i) {
    const { x, y } = aimPoint();
    issue({ o, i, x, y });
  }
  function aimPoint() {
    if (hovered) return renderer.toWorld(hovered.x, hovered.y);
    const hero = snapshot?.heroes[team];
    return hero ? { x: hero.x + (team ? -1 : 1) * 500, y: hero.y } : { x: 2600, y: 450 };
  }
  function cameraLabel(free) {
    const button = $('camera');
    button.setAttribute('aria-pressed', free);
    button.textContent = free ? 'Camera: Free' : 'Camera: Follow';
  }
  function followHero() {
    placeCameraOnHero = false;
    renderer.focus = null;
    cameraLabel(false);
  }
  function freeCamera(x, y) {
    if (!snapshot || paused || snapshot.mode !== 'match') return;
    placeCameraOnHero = false;
    if (renderer.focus == null) cameraLabel(true);
    renderer.focusAt(x,y);
  }
  function toggleCamera() {
    stopCameraDrag();
    if (placeCameraOnHero || renderer.focus != null) followHero();
    else {
      const center = renderer.viewCenter();
      freeCamera(center.x,center.y);
    }
  }
  function cameraInputEnabled() {
    return !game.hidden && snapshot?.mode === 'match' && !paused &&
      !$('controls').open && $('matchOverlay').hidden && $('shop').hidden;
  }
  function moveCamera(dx, dy) {
    const center = renderer.focus ?? renderer.viewCenter();
    freeCamera(center.x + dx, center.y + dy);
  }
  function edgePan(position, size) {
    if (position < 0 || position >= size) return 0;
    const margin = Math.min(32, size * .06);
    const distance = Math.max(0, Math.min(position, size - 1 - position));
    if (distance >= margin) return 0;
    const strength = 1 - .65 * distance / margin;
    return position < size / 2 ? -strength : strength;
  }
  function panCamera(dt) {
    if (!cameraInputEnabled()) return stopCameraDrag();
    if (cameraDrag) return;
    let dx = Number(panKeys.has('arrowright')) - Number(panKeys.has('arrowleft'));
    let dy = Number(panKeys.has('arrowdown')) - Number(panKeys.has('arrowup'));
    if (!panKeys.size && renderer.focus && edgePointer) {
      dx = edgePan(edgePointer.x, arena.clientWidth);
      dy = edgePan(edgePointer.y, arena.clientHeight);
    }
    if (!dx && !dy) return;
    const step = 1650 * Math.min(dt,.05) / Math.max(1, Math.hypot(dx,dy));
    moveCamera(dx * step, dy * step);
  }
  function stopCameraDrag() {
    if (!cameraDrag) return;
    const { id } = cameraDrag;
    cameraDrag = null;
    arena.classList.remove('draggingCamera');
    if (arena.hasPointerCapture(id)) arena.releasePointerCapture(id);
  }
  function arenaPointerDown(event) {
    if (event.button !== 1) return canvasOrder(event);
    if (!cameraInputEnabled()) return;
    event.preventDefault();
    edgePointer = null;
    cameraDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    arena.setPointerCapture(event.pointerId);
    arena.classList.add('draggingCamera');
  }
  function arenaPointerMove(event) {
    hovered = { x: event.clientX, y: event.clientY };
    cursorOnArena = true;
    if (cameraDrag?.id !== event.pointerId) return;
    if (!(event.buttons & 4) || !cameraInputEnabled()) return stopCameraDrag();
    const { x, y } = cameraDrag;
    const scale = renderer.freeWorldPerPixel;
    moveCamera((x - event.clientX) * scale, (y - event.clientY) * scale);
    cameraDrag.x = event.clientX;
    cameraDrag.y = event.clientY;
  }
  function toggleShop() {
    if (!snapshot || demo || paused || snapshot.mode !== 'match') return;
    shopFocus = null;
    $('shop').hidden = !$('shop').hidden;
    $('shopButton').setAttribute('aria-expanded', !$('shop').hidden);
    if (!$('shop').hidden) {
      $('shopFeedback').hidden = true;
      updateShop(snapshot.heroes[team], snapshot.time);
    }
  }
  function shopFeedback(text, error = false) {
    const panel = $('shopFeedback');
    panel.dataset.error = error;
    panel.textContent = text;
    panel.hidden = false;
  }
  function updateShopDetails(h, time) {
    const panel = $('shopDetailsText');
    const slot = shopFocus?.slot, selling = slot != null;
    const id = selling ? h.inventory[slot]?.id : shopSelection;
    const item = ITEMS[id], lines = [];
    const add = (text, style) => lines.push([text,style]);
    if (!item) {
      add('Select an item to see its recipe and buy individual components.');
      add('Click an inventory slot to sell. The refund drops after 10 seconds.');
      add('Press 1–6 to use an active item. ★ marks the suggested build.');
    } else {
      add(item.name, 'heading');
      add(item.text);
      if (item.cd) add('Active cooldown · ' + item.cd + 's');
      const upgrades = Object.values(ITEMS).filter(candidate => candidate.parts?.includes(id));
      if (upgrades.length) add('Builds into ' + upgrades.map(i => i.name).join(', '));
      if (selling) {
        add('Sells for ' + sellValue(h.inventory[slot], time) + 'g', 'cost');
        if (!h.canShop) add('Return to your fountain to sell items');
      } else {
        const offer = shopOffer(h, id, time, h.canShop);
        add('Price now · ' + offer.cost + 'g', 'cost');
        if (offer.reason) add(offer.reason);
      }
    }
    const content = JSON.stringify(lines);
    if (panel.dataset.content !== content) {
      panel.dataset.content = content;
      panel.replaceChildren(...lines.map(([text, style]) => make(style === 'heading' ? 'h3' : 'p', text, style)));
    }
    updateShopRecipe(h, time, !selling && item?.parts ? id : null);
  }
  function updateShopRecipe(h, time, id) {
    const container = $('shopRecipe');
    container.hidden = !id;
    if (!id) return;
    const recipe = buyPlan(h,id,true).recipe;
    const signature = JSON.stringify(recipe);
    if (container.dataset.recipe !== signature) {
      function branch(node) {
        const item = ITEMS[node.id], li = make('li'), row = make('div', null, 'recipeRow');
        row.append(make('span', item.name));
        if (node.owned) row.append(make('small', 'Owned', 'owned'));
        else row.append(buyButton(node.id));
        li.append(row);
        if (node.parts.length) {
          const children = make('ul');
          children.append(...node.parts.map(branch));
          li.append(children);
        }
        return li;
      }
      const tree = make('ul', null, 'recipeTree');
      tree.append(branch(recipe));
      container.dataset.recipe = signature;
      container.replaceChildren(make('h4','Recipe'),tree);
    }
    for (const button of container.querySelectorAll('[data-buy]')) updateBuyButton(button,h,time);
  }
  function updateShop(h, time) {
    $('shopStatus').textContent = h.canShop ? Math.floor(h.gold) + ' gold available' : 'Purchase at your fountain or while dead';
    for (const button of $('shopItems').querySelectorAll('[data-item]')) {
      const id = button.dataset.item, item = ITEMS[id];
      button.lastElementChild.textContent = [HEROES[h.hero].build.includes(id) ? '★' : '', item.cd ? 'Active' : '', item.parts ? 'Recipe' : ''].filter(Boolean).join(' · ');
      button.setAttribute('aria-pressed', id === shopSelection);
      updateBuyButton(button.nextElementSibling,h,time);
    }
    const sign = h.inventory.map(item => item.id).join(',');
    if ($('sellItems').dataset.content !== sign) {
      $('sellItems').dataset.content = sign;
      $('sellItems').replaceChildren(...h.inventory.map((item, i) => {
        const button = make('button', 'Sell ' + ITEMS[item.id].name);
        button.addEventListener('click', () => issue({ o: 'sell', i }));
        watchShopTile(button, {slot:i});
        return button;
      }));
    }
    for (const [i, item] of h.inventory.entries()) {
      const refund = sellValue(item, time);
      $('sellItems').children[i].title = 'Sell for ' + refund + ' gold';
      $('sellItems').children[i].textContent = ITEMS[item.id].name + ' · +' + refund + 'g';
    }
    updateShopDetails(h, time);
  }
  function meter(id, value, max, label) {
    const root = $(id);
    root.firstElementChild.style.width = Math.min(100, value / max * 100) + '%';
    if (label) root.lastElementChild.textContent = Math.ceil(value) + ' / ' + Math.round(max);
  }
  function selectUnit(id) {
    inspectedId = id;
    if (id == null) $('inspectPanel').hidden = true;
    else updateInspection(snapshot);
  }
  function updateInspection(s) {
    if (inspectedId == null) return;
    const hero = s.heroes.find(u => u.id === inspectedId);
    const building = !hero && s.buildings.find(u => u.id === inspectedId);
    const creep = !hero && !building && s.creeps.find(u => u[0] === inspectedId);
    if (!hero && !building && !creep) return selectUnit(null);
    const unit = hero || building || { team: creep[1], kind: creep[2], hp: creep[5], maxHp: creep[6] };
    const name = hero ? HEROES[hero.hero].name : unit.kind[0].toUpperCase() + unit.kind.slice(1) + (creep ? ' creep' : '');
    $('inspectPanel').hidden = false;
    $('inspectName').textContent = hero && hero.name !== name ? hero.name + ' · ' + name : name;
    $('inspectSide').textContent = TEAM[unit.team] + (hero ? ' · Level ' + hero.level : building?.protected ? ' · Protected' : '');
    meter('inspectHealth', unit.hp, unit.maxHp, true);
    $('inspectMana').hidden = !hero;
    $('inspectEquipment').hidden = !hero;
    if (!hero) return;
    meter('inspectMana', hero.mana, hero.maxMana, true);
    const loadout = hero.loadout || hero.inventory?.map(item => item.id) || [];
    const items = $('inspectItems'), sign = loadout.join(',');
    if (items.dataset.content === sign) return;
    items.dataset.content = sign;
    items.replaceChildren(...(loadout.length ? loadout.map(id => {
      const item = ITEMS[id], row = make('li', item.name);
      row.title = item.text;
      row.style.setProperty('--item-color', item.color);
      return row;
    }) : [make('li', 'No items', 'noEquipment')]));
  }
  function updateHud(s) {
    const h = s.heroes[team], foe = s.heroes[1-team], hero = HEROES[h.hero], time = s.time;
    const clock = Math.floor(time / 60) + ':' + String(Math.floor(time % 60)).padStart(2,'0');
    const corePct = side => Math.ceil(s.buildings.find(b => b.team === side && b.kind === 'core').hp / 30);
    for (const [id, combatant] of [['playerScore', h], ['opponentScore', foe]]) {
      const side = $(id);
      side.style.setProperty('--score-team',COLORS[combatant.team]);
      side.style.setProperty('--score-hero',HEROES[combatant.hero].color);
      side.lastElementChild.textContent = s.kills[combatant.team];
      side.title = TEAM[combatant.team] + ' · Core ' + corePct(combatant.team) + '%';
    }
    $('matchClock').textContent = clock;
    $('scoreboard').setAttribute('aria-label', TEAM[team] + ' ' + s.kills[team] + ', ' + clock + ', ' + TEAM[foe.team] + ' ' + s.kills[foe.team]);
    $('heroBadge').style.color = hero.color;
    const portraitCanvas = $('hudPortrait');
    if (portraitCanvas.dataset.hero !== h.hero) {
      portrait(portraitCanvas,h.hero);
      portraitCanvas.dataset.hero = h.hero;
    }
    portraitCanvas.style.opacity = h.hp > 0 ? '1' : '.4';
    $('heroLevel').textContent = h.level;
    $('vitalName').textContent = h.hp > 0 ? hero.name + ' · ' + hero.title : 'Respawn ' + Math.ceil(Math.max(0,h.respawn-time)) + 's';
    $('heroAttributes').textContent = 'DMG ' + Math.round(h.stats.damage * h.stats.multiplier) + ' · Armor ' + h.stats.armor.toFixed(1) + ' · MS ' + Math.round(h.stats.speed);
    $('combatStats').textContent = 'Last hits ' + h.lastHits + ' · Denies ' + h.denies;
    const enemyHero = HEROES[foe.hero].name;
    $('opponentStatus').textContent = 'Enemy · ' + foe.name + (foe.name === enemyHero ? '' : ' (' + enemyHero + ')') + ' · Lv ' + foe.level +
      (foe.hp > 0 ? '' : ' · ' + Math.max(0,Math.ceil(foe.respawn-time)) + 's to respawn') + (remote && foe.computer ? ' · Bot' : '');
    const actualQuality = renderer.auto === 1 ? 'high' : renderer.auto === .75 ? 'medium' : 'low';
    $('quality').title = (quality === 'auto' ? 'Auto · ' + actualQuality : quality) +
      (renderer.measure?.fps ? ' · ' + Math.round(renderer.measure.fps) + ' FPS' : '');
    meter('health', h.hp, h.maxHp, true);
    meter('mana', h.mana, h.maxMana, true);
    meter('xp', h.level === 15 ? 1 : h.xp, h.level === 15 ? 1 : xpGoal(h.level));
    $('gold').textContent = Math.floor(h.gold) + ' g';
    $('abilities').style.setProperty('--hero',hero.color);
    for (const [i, tile] of [...$('abilities').children].entries()) {
      const button = tile.lastElementChild;
      const spell = hero.abilities[i], cd = Math.max(0, h.cd[i] - time), locked = h.level < UNLOCKS[i];
      tile.firstElementChild.textContent = spell.name;
      button.dataset.state = locked ? 'locked' : cd ? 'cooldown' : h.mana < spell.mana ? 'nomana' : 'ready';
      button.style.setProperty('--cooldown', Math.min(100, cd / spell.cd * 100) + '%');
      button.lastElementChild.textContent = locked ? 'Lv ' + UNLOCKS[i] : cd ? (cd > 10 ? Math.ceil(cd) : cd.toFixed(1)) + 's' : spell.mana;
      const cooldown = +(spell.cd * (1 - (h.stats.cdr || 0))).toFixed(1);
      const damage = spellDamage(h, spell);
      button.dataset.tip = spell.name + ' · ' + spell.mana + ' mana · ' + cooldown + 's' + (locked ? ' · Lv ' + UNLOCKS[i] : '') + '\n' + spell.text +
        (damage ? '\n' + damage + ' ability damage' + (spell.hits ? ' per hit' : '') : '');
      button.setAttribute('aria-label', spell.name + ' (' + keys[i] + ')');
    }
    for (const [i, button] of [...$('inventory').children].entries()) {
      const slot = h.inventory[i], item = slot && ITEMS[slot.id];
      const cd = slot ? Math.max(0,(h.itemsReady[slot.id] || 0)-time) : 0;
      button.lastElementChild.textContent = cd ? Math.ceil(cd) + 's' : item ? item.name.split(/[\s’]/).map(s => s[0]).slice(0,2).join('') : '–';
      const action = !item ? '' : !$('shop').hidden ? '\nClick to sell for ' + sellValue(slot, time) + 'g' : item.cd ? '\nPress ' + (i+1) + ' to use' : '';
      button.dataset.tip = item ? item.name + '\n' + item.text + action : '';
      button.setAttribute('aria-label', (i+1) + ' · ' + (item?.name || 'Empty slot') + action.replace('\n',' · '));
      button.dataset.active = !!item?.cd && !cd;
      button.dataset.state = cd ? 'cooldown' : '';
      button.style.setProperty('--cooldown', (cd ? Math.min(100,cd/item.cd*100) : 0) + '%');
      button.style.borderColor = item?.color || '';
    }
    const utility = document.querySelector('[data-utility=potion] span');
    utility.textContent = 'Potion ×' + h.pots;
    $('shopButton').dataset.open = h.canShop;
    $('shopButton').title = h.canShop ? 'Buy equipment (B)' : 'Browse equipment · Buy at your fountain (B)';
    document.querySelector('[data-utility=recall] span').textContent = h.channel > time ? (h.channel-time).toFixed(1) + 's' :
      h.recallReady > time ? Math.ceil(h.recallReady - time) + 's' : 'Recall';
    if (!demo && h.hp <= 0 && !wasDead && s.mode === 'match') {
      $('shop').hidden = false;
      $('shopFeedback').hidden = true;
    }
    wasDead = h.hp <= 0;
    const death = $('deathNotice');
    death.hidden = !wasDead || demo || s.mode !== 'match';
    $('deathTimer').textContent = death.hidden ? '' : 'Respawn in ' + Math.max(0, Math.ceil(h.respawn - time)) + 's · Shop is open';
    if (!$('shop').hidden) updateShop(h, time);
    $('shopButton').setAttribute('aria-expanded', !$('shop').hidden);
    updateInspection(s);
    if (tooltipTarget) updateTooltip();
    for (const row of $('feed').children) {
      const opacity = Math.min(1, 9 - (time - Number(row.dataset.time)));
      if (opacity <= 0) row.remove();
      else row.style.opacity = opacity;
    }
    if (s.mode === 'ended' && !resultShown) {
      resultShown = true;
      if (remote) safeSeat(null);
      if ($('controls').open) $('controls').close();
      $('shop').hidden = true;
      $('shopButton').setAttribute('aria-expanded', 'false');
      $('deathNotice').hidden = true;
      const won = s.winner === team;
      const quit = s.endReason === 'quit';
      const title = quit ? 'Match ended' : demo ? TEAM[s.winner] + ' wins' : won ? 'Victory' : 'Defeat';
      const reason = quit ? 'You ended this solo match.' : s.endReason === 'surrender' ?
        (won ? 'Your opponent surrendered.' : 'You surrendered.') : TEAM[s.winner] + ' destroyed the enemy core.';
      overlay(title, reason, 'Return to lobby', goMenu, { tone: quit || demo ? '' : won ? 'victory' : 'defeat' });
      const stats = $('matchStats');
      const rows = [['Match time', clock], ['Level', h.level + ' vs ' + foe.level],
        ['Kills / deaths', s.kills[team] + ' / ' + h.deaths], ['Last hits / denies', h.lastHits + ' / ' + h.denies]];
      stats.replaceChildren(...rows.flatMap(([name,value]) => [make('dt',name),make('dd',value)]));
      stats.hidden = false;
      if (!quit) beep(won ? 523 : 196,.9,'triangle',.055,won ? 2 : .5);
    }
  }
  function playEvents(s) {
    for (const e of s.effects) {
      if (e.id <= lastEffect) continue;
      lastEffect = e.id;
      if (s.time - e.time > 2) continue;
      if (e.kind === 'notice') hint(e.text);
      if (e.kind === 'purchase' && e.audience === team) {
        const message = 'Bought ' + ITEMS[e.item].name + ' · ' + e.cost + 'g';
        if ($('shop').hidden) hint(message);
        else shopFeedback(message);
        beep(1200,.08,'sine',.045,1.2);
      }
      if (e.kind === 'feed') {
        const row = make('div', e.text); const parent = $('feed');
        row.dataset.time = e.time;
        parent.prepend(row);
        if (parent.children.length > 6) parent.lastElementChild.remove();
      }
      if (e.kind === 'level' && e.team === team) beep(660,.25,'triangle',.07,1.5);
      if (e.kind === 'cast') {
        const sound = e.spell === 'blast' ? [e.ultimate ? 240 : 420,.25,'sine',.05,.7] : castSounds[e.spell];
        if (sound) beep(...sound);
      }
      if (e.kind === 'gold' && e.text !== 'Denied') beep(990,.09,'sine',.05,1.4);
      if (e.kind === 'fall') beep(e.unit === 'hero' ? 160 : 110,.5,'sawtooth',.05,.4);
    }
  }
  function canvasOrder(event) {
    if (game.hidden || paused || !snapshot || snapshot.mode !== 'match' || (event.button !== 0 && event.button !== 2)) return;
    event.preventDefault();
    hovered = { x: event.clientX, y: event.clientY };
    cursorOnArena = true;
    const p = aimPoint();
    const visible = renderer.displayed || snapshot;
    if (event.button === 0 && event.pointerType !== 'touch') {
      selectUnit(pickUnit(visible, p)?.id ?? null);
      return;
    }
    if (demo || snapshot.heroes[team].hp <= 0) return;
    battleOrder(p,'move');
  }
  function battleOrder(p, fallback) {
    if (!snapshot) return;
    const target = pickTarget(renderer.displayed || snapshot, team, p, true);
    if (issue(target ? { o:'attack', id:target.id } : { o:fallback, ...p })) {
      const color = target?.team === team ? '#c9a0ff' : target || fallback === 'amove' ? '#ff6b6b' : '#8dffb0';
      renderMark = { ...(target || p), at:performance.now(), color };
    }
  }
  function safeSeat(value) {
    seat = value;
    try {
      if (value) sessionStorage.setItem('lanebreak:seat', JSON.stringify(value));
      else sessionStorage.removeItem('lanebreak:seat');
    } catch {}
  }
  function disconnect() {
    retry++;
    networkAction = null;
    if (socket) {
      const closing = socket; socket = null;
      if (closing.readyState < WebSocket.CLOSING) closing.close();
    }
    waiting = false; room = null;
    $('waiting').hidden = true;
    status('');
  }
  function openSocket(message) {
    if (!hosted) return status('Open Lanebreak through its game server to play online.');
    if (socket && socket.readyState < WebSocket.CLOSING) return;
    const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    socket = ws;
    ws.onopen = () => ws.send(JSON.stringify(message));
    ws.onmessage = event => {
      if (socket !== ws) return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.t === 'wait') {
        room = data.code; waiting = true;
        $('waiting').hidden = false;
        status((data.pub ? 'Finding an opponent · ' : 'Waiting for opponent · Room ') + room);
      } else if (data.t === 'start') {
        const rejoin = !game.hidden && remote;
        team = data.team; room = data.code; remote = true; demo = false; local = null;
        retry = 0; history.length = 0; snapshot = null; clockOffset = null; renderedTime = 0;
        safeSeat({ code: data.code, token: data.token });
        waiting = false;
        if (!rejoin) enter();
        if (rejoin) hint('Reconnected');
      } else if (data.t === 's') {
        snapshot = data.s;
        const sample = snapshot.time - performance.now() / 1000;
        clockOffset = clockOffset === null || Math.abs(sample - clockOffset) > .5 ? sample : clockOffset + .1 * (sample - clockOffset);
        history.push(snapshot);
        if (history.length > 5) history.shift();
      } else if (data.t === 'err') {
        if (remote && !game.hidden) hint(data.msg);
        else status(data.msg);
        if (message.t === 'rejoin' && !data.recoverable && !snapshot) {
          safeSeat(null);
          if (!game.hidden) overlay('Connection lost', data.msg, 'Return to lobby', goMenu);
        }
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
      socket = null;
      if (seat && retry < 6) {
        const attempt = ++retry;
        if (remote) hint('Connection lost · reconnecting');
        else status('Reconnecting to your match…');
        setTimeout(() => {
          if (retry === attempt && seat && !socket) openSocket({ t:'rejoin', ...seat });
        }, 550 * attempt);
      } else if (seat && remote && !game.hidden) {
        overlay('Connection lost','Check your network and reopen the match URL to try again.','Return to lobby',goMenu);
      } else {
        $('waiting').hidden = true;
        waiting = false;
        status('Online server unavailable. You can still play solo.');
      }
    };
  }
  function network(t) {
    if (waiting) return status('Cancel the current room first.');
    if (networkAction && socket?.readyState === WebSocket.CONNECTING) return;
    disconnect();
    retry = 0;
    safeSeat(null);
    const code = $('room').value.trim().toUpperCase();
    if (t === 'join' && !/^[A-Z]{4}$/.test(code)) return status('Enter a four-letter room code.');
    networkAction = t;
    if (!muted) initAudio();
    status('Connecting…');
    openSocket({ t, code, hero: selected, name: $('name').value.trim().slice(0,20) });
  }
  async function copyInvite() {
    if (!room) return;
    const url = new URL(location.href);
    url.hash = 'room=' + room;
    try {
      await navigator.clipboard.writeText(url.href);
      status('Copied invite link · Room ' + room);
    } catch {
      status(url.href);
    }
  }
  function interpolate(realNow) {
    if (history.length < 2 || snapshot.mode === 'ended') return snapshot;
    const time = Math.min(snapshot.time, Math.max(renderedTime, realNow / 1000 + clockOffset - .05));
    renderedTime = time;
    const index = history.findIndex(frame => frame.time >= time);
    if (index <= 0) return index === 0 ? history[0] : snapshot;
    const a = history[index-1], b = history[index];
    const f = (time - a.time) / ((b.time - a.time) || 1);
    const mix = (x, y, bx, by) => Math.hypot(x-bx,y-by) > 250 ? [bx,by] : [x+(bx-x)*f,y+(by-y)*f];
    function objects() {
      return b.heroes.map((h, i) => {
        const current = snapshot.heroes[i];
        if (h.jump !== current.jump || h.jump !== a.heroes[i].jump || h.hp <= 0 || a.heroes[i].hp <= 0) return current;
        const [x,y] = mix(a.heroes[i].x,a.heroes[i].y,h.x,h.y);
        return { ...h,x,y };
      });
    }
    function rows(prev, next, xi, yi) {
      const old = new Map(prev.map(row => [row[0],row]));
      return next.map(row => {
        const before = old.get(row[0]);
        if (!before) return row;
        const nextRow = [...row];
        [nextRow[xi],nextRow[yi]] = mix(before[xi],before[yi],row[xi],row[yi]);
        return nextRow;
      });
    }
    return { ...b, time, heroes: objects(), creeps: rows(a.creeps,b.creeps,3,4), projectiles: rows(a.projectiles,b.projectiles,3,4) };
  }
  function hotkey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || $('controls').open || event.target.tagName === 'INPUT') return;
    const k = event.key.toLowerCase();
    if (!game.hidden && !$('matchOverlay').hidden) {
      const primary = $('overlayAction');
      const secondary = $('overlaySecondary');
      if (!event.repeat && (k === 'escape' || (k === 'enter' && secondary.hidden) || (k === 'p' && primary.onclick === pause))) {
        event.preventDefault();
        (secondary.hidden ? primary : secondary).click();
      }
      return;
    }
    if (!game.hidden && k.startsWith('arrow')) {
      event.preventDefault();
      panKeys.add(k);
      return;
    }
    if (event.repeat) return;
    if (k === '?') return help();
    if (game.hidden) {
      if (k === 'escape' && (waiting || networkAction || seat)) return disconnect();
      if (/^[1-3]$/.test(k)) pick(heroKeys[+k - 1]);
      if (k.startsWith('arrow')) {
        event.preventDefault();
        const step = k === 'arrowright' || k === 'arrowdown' ? 1 : -1;
        if (k === 'arrowup' || k === 'arrowdown') setDifficulty(difficulties[(difficulties.indexOf(difficulty) + step + 3) % 3]);
        else pick(heroKeys[(heroKeys.indexOf(selected) + step + 3) % 3]);
      }
      if (k === 'enter' && event.target.tagName !== 'BUTTON' && view === 'solo') solo();
      if (k === 'n') { tab('online'); $('name').focus(); }
      return;
    }
    if (k === 'c') toggleCamera();
    else if (k === ' ' && snapshot?.mode === 'match' && !paused) {
      event.preventDefault();
      stopCameraDrag();
      panKeys.clear();
      edgePointer = null;
      const { x, y } = (renderer.displayed || snapshot).heroes[team];
      freeCamera(x,y);
    } else if ('qwer'.includes(k) && k.length === 1) aim('cast', 'qwer'.indexOf(k));
    else if (/^[1-6]$/.test(k)) aim('item', +k - 1);
    else if (k === 'b') toggleShop();
    else if (k === 'f') issue({o:'potion'});
    else if (k === 't') issue({o:'recall'});
    else if (k === 's') issue({o:'stop'});
    else if (k === 'a') battleOrder(aimPoint(),'amove');
    else if (k === 'p' || k === 'escape') {
      if (!$('shop').hidden && k === 'escape') toggleShop();
      else if (inspectedId != null && k === 'escape') selectUnit(null);
      else pause();
    } else if (k === 'g') changeQuality();
    else if (k === 'm') changeAudio();
  }
  function wire() {
    arena.addEventListener('contextmenu', event => { if (!game.hidden) event.preventDefault(); });
    arena.addEventListener('pointerdown', arenaPointerDown);
    arena.addEventListener('pointermove', arenaPointerMove);
    arena.addEventListener('pointerleave', () => { cursorOnArena = false; });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      arena.addEventListener(type, event => {
        if (cameraDrag?.id === event.pointerId) stopCameraDrag();
      });
    }
    $('matchOverlay').addEventListener('pointerdown', e => {
      if (e.target === $('matchOverlay') && $('overlayAction').onclick === pause) pause();
    });
    const minimap = $('minimap');
    const mapFocus = event => {
      const rect = minimap.getBoundingClientRect();
      freeCamera((event.clientX-rect.x) / rect.width * WIDTH, (event.clientY-rect.y) / rect.height * HEIGHT);
    };
    minimap.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      edgePointer = null;
      minimap.setPointerCapture(event.pointerId);
      mapFocus(event);
    });
    minimap.addEventListener('pointermove', event => {
      if (minimap.hasPointerCapture(event.pointerId)) mapFocus(event);
    });
    document.addEventListener('pointermove', event => {
      if (event.pointerType === 'mouse') {
        edgePointer = event.target === arena && !cameraDrag ? hovered : null;
      }
    });
    document.addEventListener('pointerout', event => {
      if (!event.relatedTarget) edgePointer = null;
    });
    document.addEventListener('keydown', hotkey);
    document.addEventListener('keyup', event => panKeys.delete(event.key.toLowerCase()));
    const resetCameraInput = () => {
      stopCameraDrag();
      panKeys.clear();
      cursorOnArena = false;
      edgePointer = null;
    };
    window.addEventListener('blur', resetCameraInput);
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetCameraInput(); });
    $('start').onclick = () => solo();
    $('soloTab').onclick = () => tab('solo');
    $('onlineTab').onclick = () => tab('online');
    $('host').onclick = () => network('host');
    $('find').onclick = () => network('find');
    $('join').onclick = () => network('join');
    $('copy').onclick = copyInvite;
    $('cancelWait').onclick = disconnect;
    $('back').onclick = confirmEndMatch;
    $('audio').onclick = changeAudio;
    $('camera').onclick = toggleCamera;
    $('quality').onclick = changeQuality;
    $('shopButton').onclick = toggleShop;
    $('closeShop').onclick = toggleShop;
    $('closeInspect').onclick = () => selectUnit(null);
    $('help').onclick = help;
    $('gameHelp').onclick = help;
    $('closeHelp').onclick = () => $('controls').close();
    $('controls').addEventListener('close', () => {
      if (wasPaused) { paused = false; wasPaused = false; }
    });
  }
  function openHash() {
    const options = new URLSearchParams(location.hash.slice(1));
    const code = options.get('room')?.toUpperCase();
    const play = options.get('play'), spectate = options.get('demo');
    if (play || spectate) {
      const [hero, diff, t] = (play || spectate).split(',');
      solo(heroKeys.includes(hero) ? hero : selected, difficulties.includes(diff) ? diff : difficulty, !!spectate,
        Math.max(0, Math.min(2400, Number(t) || 0)));
      return;
    }
    if (code && /^[A-Z]{4}$/.test(code)) {
      tab('online');
      $('room').value = code;
      if (hosted) status('Invited to room ' + code + '. Choose a hero, then join.');
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem('lanebreak:seat'));
      if (hosted && saved && (!code || saved.code === code)) {
        safeSeat(saved); tab('online'); status('Reconnecting to your match…');
        openSocket({t:'rejoin',...saved});
      }
    } catch {}
  }
  let lastFrame = 0;
  function frame(now) {
    const elapsed = lastFrame ? Math.max(0,(now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (game.hidden) renderer.title();
    else {
      if (local && !paused && local.mode === 'match' && !$('controls').open) {
        const frameTime = Math.min(elapsed,.1), steps = Math.max(1, Math.ceil(frameTime * 60 - .05));
        if (frameTime > 0) for (let i = 0; i < steps; i++) local.step(frameTime / steps);
        snapshot = local.snapshot(team,demo);
      }
      if (snapshot) {
        const visible = remote ? interpolate(now) : snapshot;
        if (placeCameraOnHero) {
          const { x, y } = visible.heroes[team];
          renderer.focusAt(x,y);
          placeCameraOnHero = false;
        }
        panCamera(elapsed);
        renderer.frame(visible,team,visible.time,renderMark,elapsed,cursorOnArena && !paused && !demo ? hovered : null,inspectedId);
        playEvents(visible);
        if (now - lastUi > 90) {
          updateHud(snapshot);
          lastUi = now;
        }
      }
    }
    requestAnimationFrame(frame);
  }
  buildUi();
  wire();
  openHash();
  requestAnimationFrame(frame);
})();
