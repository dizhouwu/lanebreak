(function () {
  const $ = id => document.getElementById(id);
  const { HEROES, ITEMS, DIFF, COLORS, TEAM, WIDTH, WEAVE_MARKS, WEAVE_ORBS, MAX_LEVEL } = LanebreakRules;
  const { Match, renderData, buyPlan, shopOffer, sellValue, spellDamage, baseMana, abilityLevel, abilitySpell, abilityError, abilityReadyAt,
    abilityCastMode, abilityNeedsTarget, weaveRecipe, pickTarget, pickUnit, pickSpellTarget, xpGoal, CREEP_FLAGS } = Lanebreak;
  const { Renderer, portrait } = LanebreakPaint;
  const keys = ['Q', 'W', 'E', 'R', 'D', 'F'];
  const heroKeys = Object.keys(HEROES);
  const weaveGuide = Object.entries(HEROES.neris.weaves).map(([marks, spell]) => [...marks].join('+') + ' · ' + spell.name).join('\n');
  const difficulties = Object.keys(DIFF);
  const itemGroups = [
    ['Consumables', id => id === 'dust'],
    ['Basics', id => ITEMS[id].stats && !ITEMS[id].parts],
    ['Upgrades', id => id === 'rift' || (ITEMS[id].parts && !ITEMS[id].master)],
    ['Masterworks', id => ITEMS[id].master]
  ];
  const arena = $('arena');
  const renderer = new Renderer(arena, $('minimap'), $('arenaGround'), $('arenaSprites'));
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
  let cameraDrag = null, selectionDrag = null, resultShown = false;
  const selectedUnits = new Set();
  let pendingCast = null;
  let heroPreviewCard = null;
  let socket, seat, room, roomTeamMatch = false, waiting = false, retry = 0, networkAction = null;
  let clockOffset = null, renderedTime = 0, wasDead = false;
  const localSnapshotInterval = 1 / 30;
  let localTime = 0, previousLocalSnapshot;
  const history = [];
  const rowIndexes = new WeakMap();
  let motionPlan = null;
  const panKeys = new Set();
  const game = $('game');
  const castSounds = {
    bolt: [700,.12,'triangle',.05,.6], nova: [150,.25,'square',.06,.5], dash: [300,.20,'sawtooth',.05,1.8],
    veil: [520,.24,'sine',.05,.52], chant: [135,.48,'triangle',.058,1.4],
    meteor: [170,.38,'triangle',.07,.4], unit: [580,.17,'triangle',.05,.68],
    blink: [900,.15,'sine',.05,.5], buff: [500,.20,'triangle',.06,1.5], spirit: [370,.16,'triangle',.052,1.3],
    hook: [320,.22,'sawtooth',.045,.60]
  };

  function make(tag, text, className) {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function renderBuilds(panel, hero, onSelect) {
    panel.replaceChildren(...hero.recommendedBuilds.map(build => {
      const section = make('section', null, 'heroBuild');
      const items = make('ol', null, 'heroBuildItems');
      for (const id of build.items) {
        const item = ITEMS[id], row = make('li');
        const label = make(onSelect ? 'button' : 'span', item.name);
        label.title = item.text;
        label.style.setProperty('--build-item', item.color);
        if (onSelect) {
          label.type = 'button';
          label.addEventListener('click', () => onSelect(id));
        }
        row.append(label);
        items.append(row);
      }
      section.append(make('h4', build.name), make('p', build.detail), items);
      return section;
    }));
  }
  function renderHeroGuide(panel, id, showBuilds = false) {
    const hero = HEROES[id];
    const list = make('ul', null, 'heroGuideSpells');
    const spells = hero.weaves ? hero.abilities.slice(0, 4) : hero.abilities;
    for (const [i, spell] of spells.entries()) {
      const row = make('li');
      const copy = make('div');
      copy.append(make('strong', spell.name), make('p', spell.text));
      const mana = spell.manaPercent ? spell.mana + ' mana + ' + (100 * spell.manaPercent) + '% max mana to start' : spell.mana && spell.mana + ' mana';
      const costs = [mana, spell.cd && spell.cd + 's cooldown'].filter(Boolean);
      if (costs.length) copy.append(make('small', costs.join(' · '), 'muted'));
      row.append(make('kbd', keys[i]), copy);
      list.append(row);
    }
    panel.replaceChildren(make('h3', hero.name + ' · ' + hero.title), make('p', hero.role, 'muted'), list);
    if (hero.heat) panel.append(make('p', 'Heat · Last hits on enemy creeps add +' + hero.heat.attack +
      ' attack damage per stack, up to ' + hero.heat.max + '. On death, you lose half your Heat.', 'heroTrait'));
    if (hero.weaves) panel.append(make('p', 'Cast prepared spells with D and F.', 'heroTrait'));
    if (showBuilds) {
      const builds = make('div');
      renderBuilds(builds, hero);
      panel.append(make('h3', 'Recommended builds', 'heroBuildHeading'), builds);
    }
  }
  function hideHeroGuide(card) {
    if (card && card !== heroPreviewCard) return;
    heroPreviewCard?.removeAttribute('aria-describedby');
    heroPreviewCard = null;
    $('heroPreview').hidden = true;
  }
  function showHeroGuide(card) {
    if (!$('lobby').hidden && !document.querySelector('dialog[open]')) {
      if (heroPreviewCard !== card) {
        hideHeroGuide();
        heroPreviewCard = card;
        card.setAttribute('aria-describedby','heroPreview');
      }
      const panel = $('heroPreview');
      if (panel.dataset.hero !== card.dataset.hero) {
        renderHeroGuide(panel, card.dataset.hero);
        panel.dataset.hero = card.dataset.hero;
      }
      panel.hidden = false;
      const rect = card.getBoundingClientRect(), w = panel.offsetWidth, h = panel.offsetHeight;
      const right = rect.right + 10, left = rect.left - w - 10;
      panel.style.left = (right + w < innerWidth - 8 ? right : left > 8 ? left : Math.max(8, innerWidth - w - 8)) + 'px';
      panel.style.top = Math.max(8, Math.min(rect.top, innerHeight - h - 8)) + 'px';
    }
  }
  function fillItemGuide() {
    const catalog = $('itemCatalog');
    for (const [label, test] of itemGroups) {
      const section = make('section', null, 'catalogGroup');
      const grid = make('div', null, 'catalogGrid');
      for (const id of Object.keys(ITEMS).filter(test)) {
        const item = ITEMS[id];
        const entry = make('article', null, 'catalogItem');
        const header = make('div', null, 'catalogItemTop');
        entry.style.setProperty('--item', item.color);
        header.append(make('h4', item.name), make('span', item.total + ' g', 'catalogPrice'));
        entry.append(header, make('p', item.text));
        if (item.cd) entry.append(make('p', 'Active cooldown · ' + item.cd + 's', 'muted'));
        if (item.parts) {
          const recipe = item.parts.map(part => ITEMS[part].name).join(' + ');
          entry.append(make('p', recipe + ' + ' + item.cost + ' g', 'catalogRecipe'));
        }
        grid.append(entry);
      }
      section.append(make('h3', label), grid);
      catalog.append(section);
    }
  }
  function filterItemGuide() {
    const terms = $('itemSearch').value.trim().toLowerCase().split(/\s+/);
    let results = 0;
    for (const group of $('itemCatalog').children) {
      let shown = 0;
      for (const item of group.lastElementChild.children) {
        const text = item.textContent.toLowerCase();
        item.hidden = !terms.every(term => text.includes(term));
        if (!item.hidden) shown++;
      }
      group.hidden = !shown;
      results += shown;
    }
    $('itemSearchEmpty').hidden = results > 0;
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
  function updateBuyButton(button, h) {
    const id = button.dataset.buy, item = ITEMS[id], plan = shopOffer(h,id,h.canShop);
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
      button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') showHeroGuide(button); });
      button.addEventListener('focus', () => { if (button.matches(':focus-visible')) showHeroGuide(button); });
      for (const type of ['pointerleave', 'blur']) button.addEventListener(type, () => hideHeroGuide(button));
      const pic = make('canvas');
      pic.width = 360; pic.height = 236;
      pic.setAttribute('aria-hidden', 'true');
      portrait(pic, id);
      const cardText = make('span', null, 'cardText');
      cardText.append(make('strong', h.name), make('small', h.title));
      button.append(pic, make('kbd', index + 1), cardText);
      button.addEventListener('click', () => pick(id));
      $('heroes').append(button);
      const trainingChoice = make('button');
      trainingChoice.type = 'button';
      trainingChoice.dataset.hero = id;
      trainingChoice.style.setProperty('--hero', h.color);
      trainingChoice.append(make('strong', h.name), make('small', h.title));
      trainingChoice.addEventListener('click', () => switchTrainingHero(id));
      $('trainingHeroChoices').append(trainingChoice);
    }
    for (const button of $('difficulties').children) button.addEventListener('click', () => setDifficulty(button.dataset.difficulty));
    for (const [i, key] of keys.entries()) {
      const tile = make('div', null, 'abilityTile');
      tile.hidden = i >= 4;
      const button = make('button');
      button.append(make('kbd', key), make('span'));
      button.addEventListener('click', () => chooseAbility(i));
      bindTooltip(button);
      tile.append(make('small', null, 'abilityName'), button);
      $('abilities').append(tile);
    }
    for (const [recipe, spell] of Object.entries(HEROES.neris.weaves)) {
      $('weaveRecipes').append(make('dt', [...recipe].join(' + ')), make('dd', spell.name + ' · ' + spell.text));
    }
    for (let i = 0; i < 6; i++) {
      const button = make('button');
      button.append(make('kbd', i + 1), make('span', '–'));
      button.addEventListener('click', () => {
        if ($('shop').hidden) useItem(i);
        else issue({ o:'sell', i });
      });
      bindTooltip(button);
      $('inventory').append(button);
    }
    for (const button of document.querySelectorAll('[data-utility]')) {
      button.addEventListener('click', () => issue({ o: button.dataset.utility }));
    }
    for (const [label, test] of itemGroups) {
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
        select.addEventListener('click', () => selectShopItem(id));
        card.append(select,buyButton(id));
        grid.append(card);
      }
      $('shopItems').append(group);
    }
    fillItemGuide();
    $('name').value = prefs.load('name') || '';
    $('name').addEventListener('input', () => prefs.save('name', $('name').value));
    $('teamsName').value = $('name').value;
    $('teamsName').addEventListener('input', () => prefs.save('name', $('teamsName').value));
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
    for (const mode of ['solo', 'online', 'teams', 'training']) {
      $(mode + 'Panel').hidden = next !== mode;
      $(mode + 'Tab').setAttribute('aria-pressed', next === mode);
    }
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
    if (!muted) {
      initAudio();
      beep(540, .08);
    }
  }
  function changeQuality() {
    const modes = ['auto','high','medium','low'];
    quality = modes[(modes.indexOf(quality) + 1) % modes.length];
    prefs.save('quality', quality);
    updateSettings();
    hint('Graphics: ' + quality);
  }
  function initAudio() {
    if (muted || audio?.state === 'running' || navigator.userActivation?.hasBeenActive === false) return;
    try {
      audio ||= new AudioContext();
      if (audio.state === 'suspended' || audio.state === 'interrupted') audio.resume().catch(() => {});
    } catch {}
  }
  function unlockMatchAudio() {
    // Matches opened by URL or reconnecting on reload may still need a user gesture.
    if (!game.hidden) initAudio();
  }
  function beep(freq, duration = .075, type = 'sine', volume = .06, slide = .58) {
    if (muted || !audio) return;
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
  function violinPhrase(kind, ultimate) {
    if (muted || !audio) return;
    const notes = ultimate ? [392, 466.16, 587.33] :
      kind === 'bolt' ? [440] : kind === 'buff' ? [329.63, 440] : [349.23, 523.25];
    try {
      const start = audio.currentTime;
      for (const [i, frequency] of notes.entries()) {
        const at = start + i * .095;
        const string = audio.createOscillator(), tone = audio.createBiquadFilter(), gain = audio.createGain();
        string.type = 'sawtooth';
        string.frequency.setValueAtTime(frequency, at);
        string.detune.setValueAtTime(-9, at);
        string.detune.linearRampToValueAtTime(4, at + .07);
        tone.type = 'lowpass';
        tone.frequency.value = 1750;
        gain.gain.setValueAtTime(.001, at);
        gain.gain.exponentialRampToValueAtTime(.035, at + .045);
        gain.gain.exponentialRampToValueAtTime(.001, at + .23);
        string.connect(tone).connect(gain).connect(audio.destination);
        string.start(at);
        string.stop(at + .24);
      }
    } catch {}
  }
  function status(text) {
    $('roomStatus').textContent = $('teamRoomStatus').textContent = text;
  }
  function hint(text) {
    $('hint').textContent = text;
    $('hint').hidden = false;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => { $('hint').hidden = true; }, 2450);
  }
  function enter() {
    initAudio();
    selectedUnits.clear();
    stopSelectionDrag();
    hideHeroGuide();
    setPendingCast(null);
    $('lobby').hidden = true;
    game.hidden = false;
    document.body.classList.add('matchMode');
    $('feed').replaceChildren();
    $('killAnnouncements').replaceChildren();
    $('hint').hidden = true;
    $('matchOverlay').hidden = true;
    const training = Boolean(snapshot?.training);
    syncBattleMode();
    $('trainingTag').hidden = $('trainingAutoRefill').hidden = $('trainingActions').hidden = !training;
    $('playerScore').hidden = $('opponentScore').hidden = training;
    $('back').textContent = training ? 'End training' : remote ? (roomTeamMatch ? 'Leave match' : 'Surrender') :
      demo ? 'Stop watching' : 'End match';
    resultShown = false;
    showRoster(false);
    $('shop').hidden = true;
    $('shopFeedback').hidden = true;
    $('deathNotice').hidden = true;
    $('hudTooltip').hidden = true;
    shopFocus = shopSelection = tooltipTarget = null;
    selectUnit(null);
    followHero();
    renderer.displayed = null;
    paused = false;
    renderMark = null;
    hovered = null;
    cursorOnArena = false;
    edgePointer = null;
    lastEffect = 0;
    lastUi = -1;
    wasDead = false;
    previousLocalSnapshot = null;
    motionPlan = null;
    localTime = snapshot?.time || 0;
    renderer.minimapElapsed = Infinity;
  }
  function goMenu() {
    setPendingCast(null);
    if (seat) safeSeat(null);
    disconnect();
    local?.dispose();
    local = null;
    remote = false;
    snapshot = null;
    history.length = 0;
    $('lobby').hidden = false;
    game.hidden = true;
    document.body.classList.remove('matchMode');
    renderer.dirty = true;
    if (/^#(?:play|demo|teams|training)=/.test(location.hash)) clearHash();
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
    local?.dispose();
    local = new Match({ heroes: [hero, opponents[Math.floor(Math.random() * opponents.length)]],
      names: [$('name').value.trim().slice(0, 20)], bots: [watch ? diff : null, diff] });
    local.step(1 / 60, Math.ceil(seconds * 60));
    snapshot = local.snapshot(0, watch);
    enter();
    if (watch) hint('Spectating · computer vs computer');
    else {
      beep(650, .10);
      hint('Right-click to move · Left-click to inspect · B to shop');
    }
  }
  function startTraining(hero = selected, dummy = $('trainingDummy').checked) {
    disconnect();
    safeSeat(null);
    remote = false; demo = false; team = 0;
    local?.dispose();
    local = new Match({ heroes:[hero, 'brakk'], training:{ dummy } });
    snapshot = local.snapshot(team);
    enter();
  }
  function startTeamMatch(hero = selected) {
    disconnect();
    safeSeat(null);
    remote = false;
    demo = false;
    team = 0;
    local?.dispose();
    const allies = [hero, ...heroKeys.filter(key => key !== hero).slice(0, 4)];
    const enemies = Array.from({ length:5 }, (_, i) => heroKeys[(i + 3) % heroKeys.length]);
    local = new Match({heroes:[...allies, ...enemies], bots:[null, ...Array(9).fill(difficulty)], team_match:true});
    snapshot = local.snapshot(team);
    enter();
  }
  function syncBattleMode() {
    const mode = snapshot?.training ? 'training' : snapshot?.teamMatch ? 'teams' : 'match';
    if (game.dataset.mode === mode) return;
    game.dataset.mode = mode;
    const minimap = $('minimap');
    minimap.width = mode === 'teams' ? 260 : 520;
    minimap.height = mode === 'teams' ? 210 : 100;
  }
  function showRoster(open) {
    $('matchRoster').hidden = !open;
    $('rosterButton').setAttribute('aria-expanded', open);
    if (!open || !snapshot) return;
    updateRoster(snapshot);
  }
  function updateRoster(s) {
    const target = $('rosterTeams');
    const roster = s.heroes.filter(hero => !hero.dummy);
    const signature = JSON.stringify([s.kills, roster.map(h =>
      [h.id,h.team,h.hero,h.name,h.computer,h.level,h.kills,h.deaths,h.assists,h.loadout])]);
    if (target.dataset.roster === signature) return;
    target.dataset.roster = signature;
    target.replaceChildren();
    for (const [side, name] of TEAM.entries()) {
      const heroes = roster.filter(hero => hero.team === side);
      if (!heroes.length) continue;
      const group = make('section');
      group.style.setProperty('--team', COLORS[side]);
      const table = make('table');
      const labels = table.createTHead().insertRow();
      for (const label of ['Player', 'Level', 'K/D/A', 'Items']) {
        const cell = make('th', label);
        cell.scope = 'col';
        labels.append(cell);
      }
      const body = table.createTBody();
      for (const h of heroes) {
        const row = body.insertRow();
        const player = make('th', h.name + (h.id === s.heroes[team].id ? ' (You)' : h.computer ? ' (Bot)' : ''));
        player.scope = 'row';
        const kit = HEROES[h.hero];
        const hero = make('span', kit.name, 'rosterHero');
        hero.style.setProperty('--hero', kit.color);
        if (h.name === kit.name) player.style.color = kit.color;
        else player.append(hero);
        row.append(player);
        row.insertCell().textContent = h.level;
        row.insertCell().textContent = kda(h);
        const items = row.insertCell();
        for (const id of h.loadout || []) {
          const item = ITEMS[id];
          const badge = make('span', item.name, 'rosterItem');
          badge.style.setProperty('--item', item.color);
          items.append(badge);
        }
        if (!items.childElementCount) items.textContent = '–';
      }
      group.append(make('h3', name + ' · ' + s.kills[side] + ' kills'), table);
      target.append(group);
    }
  }
  const kda = hero => (hero.kills ?? 0) + ' / ' + (hero.deaths ?? 0) + ' / ' + (hero.assists ?? 0);
  function openTrainingHeroPicker() {
    if (!local || !snapshot?.training || snapshot.mode !== 'match' || paused) return;
    setPendingCast(null);
    stopCameraDrag();
    panKeys.clear();
    cursorOnArena = false;
    edgePointer = null;
    $('hudTooltip').hidden = true;
    tooltipTarget = null;
    for (const button of $('trainingHeroChoices').children) {
      const current = button.dataset.hero === snapshot.heroes[team].hero;
      button.disabled = current;
      button.lastElementChild.textContent = current ? 'Current hero' : HEROES[button.dataset.hero].title;
    }
    $('trainingHeroPicker').showModal();
  }
  function switchTrainingHero(hero) {
    $('trainingHeroPicker').close();
    if (!local || !snapshot?.training || !issue({ o:'trainingHero', hero })) return;
    selectedUnits.clear();
    renderMark = null;
    renderer.displayed = null;
    updateHud(snapshot);
    hint('Now training as ' + HEROES[hero].name);
  }
  function overlay(title, text, label, action, { tone = '', cancel } = {}) {
    setPendingCast(null);
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
      if (snapshot.teamMatch) {
        overlay('Leave this match?', 'A bot will take over your hero and the match will continue.', 'Leave match', goMenu, { cancel });
        return;
      }
      overlay('Surrender this match?', 'Your opponent will win the match.', 'Surrender', () => {
        cancel();
        if (socket?.readyState !== WebSocket.OPEN) return hint('Reconnecting…');
        socket.send(JSON.stringify({ t:'surrender' }));
      }, { cancel });
    } else {
      const training = Boolean(snapshot.training);
      overlay(training ? 'End training?' : 'End this match?',
        training ? 'You’ll see your training stats.' : 'Your run will end and you’ll see your match stats.',
        training ? 'End training' : 'End match', () => {
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
    setPendingCast(null);
    if (!game.hidden && !remote && !paused && snapshot?.mode !== 'ended') {
      wasPaused = true; paused = true;
    }
    if (!$('controls').open) $('controls').showModal();
  }
  function issue(cmd) {
    if (!snapshot || paused || demo || snapshot.mode !== 'match') return false;
    if (snapshot.heroes[team].castChannel && cmd.o !== 'stop') {
      hint('Channeling · press S to cancel');
      return false;
    }
    let error;
    if (remote) {
      if (socket?.readyState !== WebSocket.OPEN) { hint('Reconnecting…'); return false; }
      const h = snapshot.heroes[team];
      if (h.hp <= 0 && !['buy', 'sell', 'fortify', 'buyback', 'group'].includes(cmd.o)) return false;
      if (cmd.o === 'cast' && !HEROES[h.hero].weaves) {
        error = abilityError(h, cmd.i, snapshot.time);
      }
      if (cmd.o === 'buy') error = shopOffer(h, cmd.id, h.canShop).reason;
      if (cmd.o === 'sell' && !h.canShop) error = 'Return to your fountain to sell items';
      if (!error) socket.send(JSON.stringify({ t: 'o', ...cmd }));
    } else {
      error = local.order(team, cmd);
      captureLocalSnapshot();
      if (cmd.o === 'cast') lastUi = -1;
    }
    if (error) {
      if (cmd.o === 'buy' && !$('shop').hidden) shopFeedback(error, true);
      else hint(error);
      return false;
    }
    if (cmd.o === 'sell') beep(600,.10,'sine',.045,.7);
    return true;
  }
  function useItem(i) {
    if (pendingCast?.item && pendingCast.i === i) return setPendingCast(null);
    setPendingCast(null);
    if (!snapshot || paused || demo || snapshot.mode !== 'match') return;
    const h = snapshot.heroes[team], key = h.inventory?.[i]?.id;
    const item = ITEMS[key];
    if (item?.target) {
      if (h.hp <= 0) return;
      if (h.itemsReady[key] > snapshot.time) return hint('Item cooling down');
      if (key === 'faultline' && h.impact?.[2] > snapshot.time) return hint('Impact stun is recovering');
      return setPendingCast({ i, spell:item, item:key, mode:item.target === 'point' ? 'point' : 'unit' });
    }
    const { x, y } = aimPoint();
    issue({ o:'item', i, x, y, item:item?.cd ? key : undefined });
  }
  function castButton(cast) {
    return cast.item ? $('inventory').children[cast.i] : $('abilities').children[cast.i].lastElementChild;
  }
  function currentCast(h, cast) {
    return cast.item ? ITEMS[h.inventory?.[cast.i]?.id] : abilitySpell(h, cast.i);
  }
  function unitTargetLabel(spell) {
    if (spell.target === 'enemyUnit') return 'an enemy hero or creep';
    if (spell.target === 'otherUnit') return 'another hero or creep';
    if (spell.target === 'ally') return 'yourself or an allied hero';
    if (spell.target === 'selfOrEnemy') return 'yourself or an enemy hero';
    return 'an enemy hero';
  }
  function setPendingCast(cast) {
    if (pendingCast) castButton(pendingCast).classList.remove('aiming');
    pendingCast = cast;
    const prompt = $('castPrompt');
    prompt.hidden = !cast;
    arena.classList.toggle('aiming', Boolean(cast));
    if (cast) {
      const instruction = cast.spell.kind === 'brandReturn' ? 'Click to choose the final fire brand' :
        cast.spell.target === 'point' ? 'Click a point to blink' :
        cast.mode === 'unit' ? 'Click ' + unitTargetLabel(cast.spell) : 'Select a target';
      prompt.textContent = cast.spell.name + ' · ' + instruction;
      castButton(cast).classList.add('aiming');
    }
  }
  function chooseAbility(i) {
    if (!snapshot || paused || demo || snapshot.mode !== 'match') return;
    if (pendingCast?.i === i && !pendingCast.item) return setPendingCast(null);
    setPendingCast(null);
    const h = snapshot.heroes[team], spell = abilitySpell(h, i);
    if (!spell || spell.kind === 'passive' || h.hp <= 0) return;
    const recipe = i >= 4 ? h.prepared?.[i - 4] : undefined;
    const mode = abilityCastMode(spell);
    if (mode !== 'self') {
      const error = abilityError(h, i, snapshot.time, spell, Boolean(snapshot.training), snapshot.training?.noCooldowns);
      if (error) return hint(error);
      setPendingCast({ i, spell, recipe, mode });
    } else {
      issue({ o:'cast', i, x:h.x, y:h.y, castMode:'self', recipe });
    }
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
    game.dataset.camera = free ? 'free' : 'follow';
  }
  function followHero() {
    stopCameraDrag();
    panKeys.clear();
    edgePointer = null;
    renderer.focus = null;
    cameraLabel(false);
  }
  function freeCamera(x, y) {
    if (!snapshot || paused || snapshot.mode !== 'match') return;
    if (renderer.focus == null) cameraLabel(true);
    renderer.focusAt(x,y);
  }
  function toggleCamera() {
    if (renderer.focus != null) followHero();
    else {
      const center = renderer.viewCenter();
      freeCamera(center.x,center.y);
    }
  }
  function cameraInputEnabled() {
    return renderer.focus != null && !game.hidden && snapshot?.mode === 'match' && !paused &&
      !$('controls').open && !$('trainingHeroPicker').open && $('matchOverlay').hidden && $('shop').hidden;
  }
  function moveCamera(dx, dy) {
    const center = renderer.focus;
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
    if (!panKeys.size && edgePointer) {
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
    if (event.button === 0 && event.pointerType === 'mouse' && !pendingCast && !game.hidden &&
        !paused && !demo && snapshot?.mode === 'match') {
      event.preventDefault();
      selectionDrag = { id:event.pointerId, x:event.clientX, y:event.clientY };
      arena.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button !== 1) return canvasOrder(event);
    if (!game.hidden) event.preventDefault();
    if (!cameraInputEnabled()) return;
    edgePointer = null;
    cameraDrag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    arena.setPointerCapture(event.pointerId);
    arena.classList.add('draggingCamera');
  }
  function arenaPointerMove(event) {
    hovered = { x: event.clientX, y: event.clientY };
    cursorOnArena = true;
    if (selectionDrag?.id === event.pointerId) {
      const { x, y } = selectionDrag;
      const box = $('selectionBox');
      const width = Math.abs(x-event.clientX), height = Math.abs(y-event.clientY);
      box.hidden = Math.max(width,height) <= 5;
      if (!box.hidden) {
        Object.assign(box.style, {left:Math.min(x,event.clientX)+'px',top:Math.min(y,event.clientY)+'px',
          width:width+'px',height:height+'px'});
      }
      return;
    }
    if (cameraDrag?.id !== event.pointerId) return;
    if (!(event.buttons & 4) || !cameraInputEnabled()) return stopCameraDrag();
    const { x, y } = cameraDrag;
    const scale = renderer.freeWorldPerPixel;
    moveCamera((x - event.clientX) * scale, (y - event.clientY) * scale);
    cameraDrag.x = event.clientX;
    cameraDrag.y = event.clientY;
  }
  function stopSelectionDrag() {
    const drag = selectionDrag;
    selectionDrag = null;
    $('selectionBox').hidden = true;
    if (drag && arena.hasPointerCapture(drag.id)) arena.releasePointerCapture(drag.id);
  }
  function controlledUnits(s) {
    const hero = s.heroes[team], owned = hero.hp > 0 ? [hero] : [];
    for (const row of s.creeps) {
      if (row[11] === hero.id && row[5] > 0) owned.push({id:row[0],x:row[3],y:row[4]});
    }
    return owned;
  }
  function chooseUnits(ids) {
    selectedUnits.clear();
    for (const id of ids) selectedUnits.add(id);
    selectUnit(null);
  }
  function finishSelectionDrag(event) {
    const drag = selectionDrag;
    stopSelectionDrag();
    if (event.type !== 'pointerup' || !snapshot) return;
    if (Math.max(Math.abs(drag.x-event.clientX),Math.abs(drag.y-event.clientY)) <= 5) return canvasOrder(event);
    const a = renderer.toWorld(drag.x,drag.y), b = renderer.toWorld(event.clientX,event.clientY);
    const left = Math.min(a.x,b.x), right = Math.max(a.x,b.x), top = Math.min(a.y,b.y), bottom = Math.max(a.y,b.y);
    chooseUnits(controlledUnits(renderer.displayed || snapshot)
      .filter(u => u.x >= left && u.x <= right && u.y >= top && u.y <= bottom).map(u => u.id));
  }
  function selectedGroup() {
    if (!selectedUnits.size || !snapshot) return [];
    const hero = snapshot.heroes[team];
    const ids = controlledUnits(snapshot).filter(u => selectedUnits.has(u.id)).map(u => u.id);
    return ids.some(id => id !== hero.id) ? ids : [];
  }
  function toggleShop() {
    if (!snapshot || demo || paused || snapshot.mode !== 'match') return;
    setPendingCast(null);
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
  function selectShopItem(id) {
    shopSelection = id;
    shopFocus = null;
    if (snapshot) updateShop(snapshot.heroes[team], snapshot.time);
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
      if (item.target) add(item.target === 'point' ? 'Target a point on the ground' : 'Target ' + unitTargetLabel(item));
      if (selling) {
        add('Sells for ' + sellValue(h.inventory[slot], time) + 'g', 'cost');
        if (!h.canShop) add('Return to your fountain to sell items');
      } else {
        const offer = shopOffer(h, id, h.canShop);
        add('Price now · ' + offer.cost + 'g', 'cost');
        if (offer.reason) add(offer.reason);
      }
    }
    const content = JSON.stringify([id, lines]);
    if (panel.dataset.content !== content) {
      panel.dataset.content = content;
      panel.replaceChildren(...lines.map(([text, style]) => make(style === 'heading' ? 'h3' : 'p', text, style)));
      const upgrades = Object.entries(ITEMS).filter(([, candidate]) => candidate.parts?.includes(id));
      if (upgrades.length) {
        const links = make('div', null, 'shopUpgrades');
        for (const [key, upgrade] of upgrades) {
          const button = make('button', upgrade.name);
          button.type = 'button';
          button.addEventListener('click', () => selectShopItem(key));
          links.append(button);
        }
        panel.append(make('h4', 'Builds into'), links);
      }
    }
    updateShopRecipe(h, !selling && item?.parts ? id : null);
  }
  function updateShopRecipe(h, id) {
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
    for (const button of container.querySelectorAll('[data-buy]')) updateBuyButton(button,h);
  }
  function updateShop(h, time) {
    $('shopStatus').textContent = h.canShop ? Math.floor(h.gold) + ' gold available' : 'Purchase at your fountain or while dead';
    const builds = $('shopBuildList');
    if (builds.dataset.hero !== h.hero) {
      renderBuilds(builds, HEROES[h.hero], selectShopItem);
      builds.dataset.hero = h.hero;
    }
    for (const button of $('shopItems').querySelectorAll('[data-item]')) {
      const id = button.dataset.item, item = ITEMS[id];
      button.lastElementChild.textContent = [HEROES[h.hero].build.includes(id) ? '★' : '', item.cd ? 'Active' : '', item.parts ? 'Recipe' : ''].filter(Boolean).join(' · ');
      button.setAttribute('aria-pressed', id === shopSelection);
      updateBuyButton(button.nextElementSibling,h);
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
    if (hero?.concealed) return selectUnit(null);
    const building = !hero && s.buildings.find(u => u.id === inspectedId);
    const creep = !hero && !building && s.creeps.find(u => u[0] === inspectedId);
    if (!hero && !building && !creep) return selectUnit(null);
    const unit = hero || building || { team: creep[1], kind: creep[2], hp: creep[5], maxHp: creep[6] };
    const name = hero?.dummy ? hero.name : hero ? HEROES[hero.hero].name : unit.kind[0].toUpperCase() + unit.kind.slice(1) + (creep ? ' creep' : '');
    $('inspectPanel').hidden = false;
    $('inspectName').textContent = creep && (creep[10] & CREEP_FLAGS.spirit) ? 'Fire Spirit' :
      hero && hero.name !== name ? hero.name + ' · ' + name : name;
    $('inspectSide').textContent = hero?.dummy ? 'Stationary target' :
      TEAM[unit.team] + (hero ? ' · Level ' + hero.level : building?.fortified ? ' · Fortified' : building?.protected ? ' · Protected' : '');
    meter('inspectHealth', unit.hp, unit.maxHp, true);
    $('inspectMana').hidden = $('inspectEquipment').hidden = !hero || hero.dummy;
    if (hero?.dummy) $('inspectHealth').lastElementChild.textContent = '∞ HP';
    if (!hero || hero.dummy) return;
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
    const h = s.heroes[team], hero = HEROES[h.hero], time = s.time;
    const side = h.team;
    const kdaText = kda(h), kdaValue = $('playerKda');
    if (kdaValue.textContent !== kdaText) kdaValue.textContent = kdaText;
    const group = $('groupStatus');
    const groupSize = selectedUnits.size ? controlledUnits(s).filter(u => selectedUnits.has(u.id)).length : 0;
    group.hidden = !groupSize;
    if (groupSize) group.textContent = groupSize + (groupSize === 1 ? ' unit selected' : ' units selected');
    const foe = s.heroes.find(other => other.team !== side);
    if (!$('matchRoster').hidden) updateRoster(s);
    if (pendingCast && (h.hp <= 0 || s.mode !== 'match' || (h.silenced && !pendingCast.item) || currentCast(h, pendingCast) !== pendingCast.spell)) setPendingCast(null);
    const clock = Math.floor(time / 60) + ':' + String(Math.floor(time % 60)).padStart(2,'0');
    $('matchClock').textContent = clock;
    const fortify = $('fortify'), fortification = s.fortification?.[side];
    fortify.hidden = !fortification || demo || s.mode !== 'match';
    if (!fortify.hidden) {
      const active = Math.ceil(fortification.until - time), cooldown = Math.ceil(fortification.readyAt - time);
      const hasTowers = s.buildings.some(b => b.team === side && b.kind !== 'core' && b.hp > 0);
      fortify.disabled = !hasTowers || cooldown > 0;
      fortify.dataset.active = active > 0;
      fortify.textContent = active > 0 ? 'Fortified · ' + active + 's' : !hasTowers ? 'No towers left' :
        cooldown > 0 ? 'Fortify · ' + cooldown + 's' : 'Fortify towers';
    }
    if (s.training) {
      const toggle = $('trainingCooldowns'), pressed = String(s.training.noCooldowns);
      if (toggle.getAttribute('aria-pressed') !== pressed) {
        toggle.setAttribute('aria-pressed', pressed);
        toggle.lastElementChild.textContent = s.training.noCooldowns ? 'On' : 'Off';
      }
      $('scoreboard').setAttribute('aria-label', 'Training · ' + clock);
      $('combatStats').textContent = s.training.dummy ? 'Damage ' + Math.round(s.training.damage) + ' · Hits ' + s.training.hits : 'Empty arena';
      $('opponentStatus').textContent = s.training.dummy ? 'Dummy · ∞ HP' +
        (s.training.hits ? ' · Last hit ' + Math.round(s.training.lastHit) : '') : '';
    } else {
      const corePct = side => {
        const core = s.buildings.find(b => b.team === side && b.kind === 'core');
        return Math.ceil(core.hp / core.maxHp * 100);
      };
      for (const [id, combatant] of [['playerScore', h], ['opponentScore', foe]]) {
        const side = $(id);
        side.style.setProperty('--score-team',COLORS[combatant.team]);
        side.style.setProperty('--score-hero',s.teamMatch ? COLORS[combatant.team] : HEROES[combatant.hero].color);
        side.lastElementChild.textContent = s.kills[combatant.team];
        side.title = TEAM[combatant.team] + ' · Core ' + corePct(combatant.team) + '%';
      }
      $('scoreboard').setAttribute('aria-label', TEAM[side] + ' ' + s.kills[side] + ', ' + clock + ', ' + TEAM[foe.team] + ' ' + s.kills[foe.team]);
      $('combatStats').textContent = 'Last hits ' + h.lastHits + ' · Denies ' + h.denies;
      const enemyHero = HEROES[foe.hero].name;
      $('opponentStatus').textContent = s.teamMatch ? TEAM[foe.team] + ' core · ' + corePct(foe.team) + '%' :
        'Enemy · ' + foe.name + (foe.name === enemyHero ? '' : ' (' + enemyHero + ')') + ' · Lv ' + foe.level +
        (foe.heat != null ? ' · Heat ' + foe.heat : '') +
        (foe.concealed ? ' · Hidden' : foe.hp > 0 ? '' : ' · ' + Math.max(0,Math.ceil(foe.respawn-time)) + 's to respawn') +
        (remote && foe.computer ? ' · Bot' : '');
    }
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
    const actualQuality = renderer.auto === 1 ? 'high' : renderer.auto === .75 ? 'medium' : 'low';
    $('quality').title = (quality === 'auto' ? 'Auto · ' + actualQuality : quality) +
      (renderer.measure?.fps ? ' · ' + Math.round(renderer.measure.fps) + ' FPS' : '');
    meter('health', h.hp, h.maxHp, true);
    meter('mana', h.mana, h.maxMana, true);
    meter('xp', h.level >= MAX_LEVEL ? 1 : h.xp, h.level >= MAX_LEVEL ? 1 : xpGoal(h.level));
    $('gold').textContent = Math.floor(h.gold) + ' g';
    const resource = $('heroResource'), timer = $('veilTimer'), recipe = weaveRecipe(h);
    const marks = h.marks || [];
    const spellName = recipe ? ' → ' + hero.weaves[recipe].name : '';
    let resourceText = '';
    if (hero.weaves) {
      const queue = Array.from({ length:WEAVE_MARKS }, (_, i) => keys[marks[i]] || '…');
      resourceText = marks.length ? 'Marks · ' + queue.join(' + ') + spellName : 'Choose three marks with Q, W, or E';
    } else if (hero.heat) {
      resourceText = 'Heat ' + h.heat + '/' + hero.heat.max + ' · +' + h.heat * hero.heat.attack + ' attack damage';
    }
    resource.hidden = !resourceText;
    if (resource.dataset.text !== resourceText) {
      resource.dataset.text = resourceText;
      if (marks.length) {
        resource.replaceChildren('Marks · ');
        for (let i = 0; i < WEAVE_MARKS; i++) {
          if (i) resource.append(' + ');
          const mark = marks[i];
          if (mark === undefined) {
            resource.append('…');
            continue;
          }
          const orb = make('span', keys[mark], 'weaveOrb');
          const [light, edge] = WEAVE_ORBS[mark];
          orb.style.setProperty('--orb-light', light);
          orb.style.setProperty('--orb-edge', edge);
          resource.append(orb);
        }
        resource.append(spellName);
      } else {
        resource.textContent = resourceText;
      }
    }
    const veilRemaining = Math.max(0, (h.veilUntil || 0) - time);
    timer.hidden = !veilRemaining;
    if (veilRemaining) {
      const label = 'Invisible · ' + (Math.ceil(veilRemaining * 10) / 10).toFixed(1) + 's';
      if (timer.textContent !== label) timer.textContent = label;
    }
    $('heroResourceRow').hidden = resource.hidden && timer.hidden;
    const abilities = $('abilities');
    abilities.dataset.weaves = !!hero.weaves;
    abilities.dataset.slots = hero.abilities.length;
    abilities.dataset.channeling = !!h.castChannel;
    abilities.style.setProperty('--hero',hero.color);
    for (const [i, tile] of [...abilities.children].entries()) {
      tile.hidden = i >= hero.abilities.length;
      if (tile.hidden) continue;
      const button = tile.lastElementChild;
      const spell = abilitySpell(h, i), level = abilityLevel(h, i);
      const cast = h.castChannel?.[0] === i ? h.castChannel : null;
      const cd = Math.max(0, abilityReadyAt(h, i) - time), locked = h.level < level;
      const charges = spell.kind === 'brand' ? h.brandChargeReady.filter(ready => ready <= time).length : null;
      const placed = spell.kind === 'brandReturn' ? h.brands?.length || 0 : null;
      const manaCost = s.training ? 0 : Math.ceil(baseMana(h, spell));
      const manaLabel = manaCost && spell.distanceMana ? manaCost + '+' : manaCost;
      const passive = spell.kind === 'passive';
      const finisher = h.finisherHits != null && spell.critHits;
      const charged = finisher ? h.finisherHits === spell.critHits - 1 : h.charged;
      const awaitingMarks = spell.kind === 'invoke' && !recipe, empty = spell.kind === 'prepared';
      tile.firstElementChild.textContent = spell.name;
      button.dataset.state = cast ? 'channeling' : locked || empty || placed === 0 || (awaitingMarks && !cd) ? 'locked' : passive ? (charged ? 'ready' : 'passive') :
        cd ? 'cooldown' : h.mana < manaCost ? 'nomana' : 'ready';
      button.style.setProperty('--cooldown', (spell.cd ? Math.min(100, cd / spell.cd * 100) : 0) + '%');
      button.lastElementChild.textContent = cast ? 'Chant ' + Math.max(0, cast[2] - time).toFixed(1) + 's' :
        locked ? 'Lv ' + level : cd ? (cd > 10 ? Math.ceil(cd) : cd.toFixed(1)) + 's' :
        awaitingMarks ? WEAVE_MARKS + ' marks' : empty ? '–' :
        finisher ? (charged ? 'Crit ready' : h.finisherHits + '/' + (spell.critHits - 1)) : passive ? (charged ? 'Charged' : 'Passive') :
        charges !== null ? charges + '/' + h.brandChargeReady.length : placed !== null ? placed + ' marked' : manaLabel || '';
      const cooldown = s.training?.noCooldowns ? 0 : +(spell.cd * (1 - (h.stats.cdr || 0))).toFixed(1);
      const damage = spell.kind === 'dagger' ? 0 : spell.kind === 'sweep' ? spell.damage + spell.growth * (h.level - 1) : spellDamage(h, spell);
      button.dataset.tip = spell.name + (manaLabel ? ' · ' + manaLabel + ' mana' : '') + (cooldown ? ' · ' + cooldown + 's' : '') +
        (locked ? ' · Lv ' + level : '') + '\n' + spell.text + (damage ? '\n' + damage +
          (spell.kind === 'sweep' ? ' bonus attack damage vs. heroes' : ' ability damage' + (spell.hits ? ' per hit' : '')) : '') +
        (abilityCastMode(spell) === 'unit' ? '\nClick ' + unitTargetLabel(spell) + ' to cast' : abilityNeedsTarget(spell) ? '\nSelect a target to cast' : '') +
        (spell.kind === 'invoke' ? '\n\n' + weaveGuide : '');
      button.setAttribute('aria-label', spell.name + ' (' + keys[i] + ')');
    }
    for (const [i, button] of [...$('inventory').children].entries()) {
      const slot = h.inventory[i], item = slot && ITEMS[slot.id];
      const recovery = slot?.id === 'faultline' ? h.impact?.[2] || 0 : 0;
      const cd = slot ? Math.max(0, Math.max(h.itemsReady[slot.id] || 0, recovery) - time) : 0;
      const impact = item?.stats?.bash && h.impact ? h.impact[0] + '/' + h.impact[1] : '';
      button.lastElementChild.textContent = cd ? Math.ceil(cd) + 's' : impact || (item ? item.name.split(/[\s’]/).map(s => s[0]).slice(0,2).join('') : '–');
      const use = item?.target === 'point' ? ' and click the ground' : item?.target ? ' and click a hero' : ' to use';
      const action = !item ? '' : !$('shop').hidden ? '\nClick to sell for ' + sellValue(slot, time) + 'g' : item.cd ? '\nPress ' + (i+1) + use : '';
      button.dataset.tip = item ? item.name + '\n' + item.text + (impact ? '\nImpact hits · ' + impact : '') + action : '';
      button.setAttribute('aria-label', (i+1) + ' · ' + (item?.name || 'Empty slot') + action.replace('\n',' · '));
      button.dataset.active = !!item?.cd && !cd;
      button.dataset.state = cd ? 'cooldown' : '';
      button.style.setProperty('--cooldown', (cd ? Math.min(100,cd/item.cd*100) : 0) + '%');
      button.style.borderColor = item?.color || '';
    }
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
    if (!death.hidden) {
      $('deathTimer').textContent = 'Respawn in ' + Math.max(0, Math.ceil(h.respawn - time)) + 's';
      const buyback = $('buyback'), status = $('buybackStatus');
      const cooldown = Math.ceil(h.buybackReady - time);
      status.textContent = cooldown > 0 ? 'Available in ' + cooldown + 's' : h.gold < h.buybackCost ? 'Not enough gold' : '';
      buyback.textContent = 'Buyback · ' + h.buybackCost + 'g';
      buyback.disabled = !!status.textContent;
    }
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
      const won = s.winner === side;
      const quit = s.endReason === 'quit';
      const title = s.training ? 'Training ended' : quit ? 'Match ended' : demo ? TEAM[s.winner] + ' wins' : won ? 'Victory' : 'Defeat';
      const reason = s.training ? hero.name + ' · ' + (s.training.dummy ? 'Training dummy' : 'Empty arena') :
        quit ? 'You ended this solo match.' : s.endReason === 'surrender' ?
        (won ? 'Your opponent surrendered.' : 'You surrendered.') : TEAM[s.winner] + ' destroyed the enemy core.';
      overlay(title, reason, 'Return to lobby', goMenu, { tone: quit || demo ? '' : won ? 'victory' : 'defeat' });
      const stats = $('matchStats');
      const rows = s.training ?
        [['Training time', clock], ['Damage dealt', Math.round(s.training.damage)], ['Hits', s.training.hits]] :
        [['Match time', clock], ['Level', s.teamMatch ? h.level : h.level + ' vs ' + foe.level], ['K/D/A', kdaText],
          ['Last hits / denies', h.lastHits + ' / ' + h.denies]];
      stats.replaceChildren(...rows.flatMap(([name,value]) => [make('dt',name),make('dd',value)]));
      stats.hidden = false;
      if (!quit) beep(won ? 523 : 196,.9,'triangle',.055,won ? 2 : .5);
    }
  }
  function announceKill(e) {
    const parent = $('killAnnouncements');
    const card = make('div',null,'killCard');
    card.style.setProperty('--kill-color',COLORS[e.team]);
    const primary = e.multiKillAnnouncement || e.announcement;
    const repeat = e.multiKill > 5 ? ' ×' + (e.multiKill - 4) : '';
    card.dataset.streak = Boolean(primary);
    card.append(make('strong',primary ? primary + repeat : 'Hero Kill'),
      make('span',e.attacker + ' killed ' + e.victim));
    if (e.multiKillAnnouncement && e.announcement) card.append(make('span',e.announcement,'killMilestone'));
    card.addEventListener('animationend',()=>card.remove(),{once:true});
    parent.prepend(card);
    if (parent.children.length > 3) parent.lastElementChild.remove();
  }
  function playEvents(s) {
    for (const e of s.effects) {
      if (e.id <= lastEffect) continue;
      if (e.time > s.time) continue;
      lastEffect = e.id;
      if (s.time - e.time > 2) continue;
      if (e.kind === 'notice') hint(e.text);
      if (e.kind === 'purchase' && (e.audienceSeat ?? e.audience) === team) {
        const message = 'Bought ' + ITEMS[e.item].name + ' · ' + e.cost + 'g';
        if ($('shop').hidden) hint(message);
        else shopFeedback(message);
        beep(1200,.08,'sine',.045,1.2);
      }
      if (e.kind === 'kill') announceKill(e);
      if (e.kind === 'feed' || e.kind === 'kill') {
        const row = make('div', e.text); const parent = $('feed');
        row.dataset.time = e.time;
        parent.prepend(row);
        if (parent.children.length > 6) parent.lastElementChild.remove();
      }
      if (e.kind === 'level' && e.team === s.heroes[team].team) beep(660,.25,'triangle',.07,1.5);
      if (e.kind === 'cast' && e.hero === 'ecarg') violinPhrase(e.spell, e.ultimate);
      else if (e.kind === 'cast') {
        const sound = e.spell === 'blast' ? [e.ultimate ? 240 : 420,.25,'sine',.05,.7] : castSounds[e.spell];
        if (sound) beep(...sound);
      }
      if (e.kind === 'gold' && e.text !== 'Denied') beep(990,.09,'sine',.05,1.4);
      if (e.kind === 'fall') beep(e.unit === 'hero' ? 160 : 110,.5,'sawtooth',.05,.4);
    }
  }
  function canvasOrder(event) {
    if (game.hidden || paused || !snapshot || snapshot.mode !== 'match' ||
        (event.button !== 0 && event.button !== 2)) return;
    event.preventDefault();
    hovered = { x: event.clientX, y: event.clientY };
    cursorOnArena = true;
    const p = aimPoint();
    const visible = renderer.displayed || snapshot;
    if (pendingCast) {
      const { i, spell, recipe, mode, item } = pendingCast;
      if (event.button === 2) return setPendingCast(null);
      if (currentCast(snapshot.heroes[team], pendingCast) !== spell) {
        setPendingCast(null);
        return hint(item ? 'Item changed. Select the equipment again.' : 'Spell changed. Select the ability again.');
      }
      if (mode === 'unit') {
        const target = pickSpellTarget(visible, visible.heroes[team], spell, p);
        if (!target) return hint('Select ' + unitTargetLabel(spell) + ' in range');
        const order = item ? { o:'targetItem', i, id:target.id, item } : { o:'cast', i, id:target.id, castMode:mode, recipe };
        if (issue(order)) setPendingCast(null);
      } else if (item) {
        if (issue({ o:'item', i, item, ...p })) setPendingCast(null);
      } else {
        setPendingCast(null);
        issue({ o:'cast', i, ...p, castMode:mode, recipe });
      }
      return;
    }
    if (event.button === 0 && event.pointerType !== 'touch') {
      const id = pickUnit(visible, p)?.id;
      chooseUnits(controlledUnits(visible).some(u => u.id === id) ? [id] : []);
      selectUnit(id ?? null);
      return;
    }
    if (demo) return;
    battleOrder(p,'move');
  }
  function battleOrder(p, fallback) {
    if (!snapshot) return;
    const ids = selectedGroup();
    if (!ids.length && snapshot.heroes[team].hp <= 0) return;
    const candidate = pickTarget(renderer.displayed || snapshot, team, p, !ids.length);
    const target = ids.length && candidate?.team === snapshot.heroes[team].team ? null : candidate;
    const order = ids.length ? (target ? {o:'group',ids,action:'attack',id:target.id} : {o:'group',ids,action:'move',...p}) :
      target ? {o:'attack',id:target.id} : {o:fallback,...p};
    if (issue(order)) {
      const color = target?.team === snapshot.heroes[team].team ? '#c9a0ff' : target || fallback === 'amove' ? '#ff6b6b' : '#8dffb0';
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
    waiting = false; room = null; roomTeamMatch = false;
    $('waiting').hidden = $('teamWaiting').hidden = true;
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
        roomTeamMatch = Boolean(data.teamMatch);
        $('waiting').hidden = roomTeamMatch;
        $('teamWaiting').hidden = !roomTeamMatch;
        $('launchTeamRoom').hidden = !data.host;
        status(roomTeamMatch ? 'Room ' + room + ' · ' + data.players + '/10 · ' + TEAM[data.side] :
          (data.pub ? 'Finding an opponent · ' : 'Waiting for opponent · Room ') + room);
      } else if (data.t === 'start') {
        const rejoin = !game.hidden && remote;
        local?.dispose();
        team = data.team; room = data.code; remote = true; demo = false; local = null;
        roomTeamMatch = Boolean(data.teamMatch);
        retry = 0; history.length = 0; snapshot = null; clockOffset = null; renderedTime = 0;
        safeSeat({ code: data.code, token: data.token, teamMatch:roomTeamMatch });
        waiting = false;
        if (!rejoin) enter();
        if (rejoin) hint('Reconnected');
      } else if (data.t === 's') {
        const previous = snapshot?.heroes[team];
        if (data.s.effectsDelta && snapshot) {
          data.s.effects = [...snapshot.effects.filter(e => data.s.time - e.time < 4), ...data.s.effects];
        }
        snapshot = data.s;
        syncBattleMode();
        const current = snapshot.heroes[team];
        if (previous?.marks?.join() !== current.marks?.join() || previous?.prepared?.join() !== current.prepared?.join()) lastUi = -1;
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
        $('waiting').hidden = $('teamWaiting').hidden = true;
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
    const teams = t.endsWith('5v5');
    const code = $(teams ? 'teamRoom' : 'room').value.trim().toUpperCase();
    if (t.startsWith('join') && !/^[A-Z]{4}$/.test(code)) return status('Enter a four-letter room code.');
    networkAction = t;
    initAudio();
    status('Connecting…');
    const requested = $('joinTeamSide').value;
    openSocket({ t, code, hero: selected, name: $(teams ? 'teamsName' : 'name').value.trim().slice(0,20),
      side: teams && requested !== '' ? Number(requested) : undefined });
  }
  async function copyInvite() {
    if (!room) return;
    const url = new URL(location.href);
    url.hash = 'room=' + room + (roomTeamMatch ? '&mode=5v5' : '');
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
    return interpolateMotion(history[index-1], history[index], time);
  }
  function captureLocalSnapshot() {
    const next = local.snapshot(team, demo);
    if (next.time > snapshot.time) previousLocalSnapshot = snapshot;
    snapshot = next;
    localTime = Math.max(localTime, next.time);
  }
  function interpolateMotion(a, b, time) {
    if (time >= b.time) return b;
    const f = (time - a.time) / ((b.time - a.time) || 1);
    if (motionPlan?.a !== a || motionPlan.b !== b) motionPlan = buildMotionPlan(a,b);
    const { frame, heroTargets, moving } = motionPlan;
    if (moving.length) {
      const positions = renderData.interpolate(moving.length, f);
      for (let i=0; i<moving.length; i++) {
        const target = moving[i], x = positions[i*2], y = positions[i*2+1];
        if (Array.isArray(target)) {
          target[3] = x;
          target[4] = y;
        } else {
          target.x = x;
          target.y = y;
        }
      }
    }
    for (let i=0; i<heroTargets.length; i++) {
      const current = snapshot.heroes[i], target = heroTargets[i];
      frame.heroes[i] = !target || current.concealed || target.jump !== current.jump ||
        target.hero !== current.hero ? current : target;
    }
    frame.time = time;
    return frame;
  }
  function buildMotionPlan(a, b) {
    const coordinates = renderData.motionBuffer(b.heroes.length + b.creeps.length + b.projectiles.length);
    const moving = [];
    function track(target, oldX, oldY, x, y) {
      const at = moving.length * 4;
      coordinates[at] = oldX;
      coordinates[at+1] = oldY;
      coordinates[at+2] = x;
      coordinates[at+3] = y;
      moving.push(target);
      return target;
    }
    const heroTargets = b.heroes.map((h, i) => {
      const before = a.heroes[i];
      if (h.concealed || before.concealed || h.jump !== before.jump ||
        h.hero !== before.hero || h.hp <= 0 || before.hp <= 0) return null;
      return h.x === before.x && h.y === before.y ? h : track({...h},before.x,before.y,h.x,h.y);
    });
    function rows(prev, next) {
      if (!prev.length || !next.length) return next;
      let old = rowIndexes.get(prev);
      if (!old) {
        old = new Map();
        for (const row of prev) old.set(row[0], row);
        rowIndexes.set(prev, old);
      }
      return next.map(row => {
        const before = old.get(row[0]);
        return !before || (before[3] === row[3] && before[4] === row[4]) ? row :
          track(row.slice(),before[3],before[4],row[3],row[4]);
      });
    }
    // Only the display view is mutable. The engine snapshots also drive commands and the HUD.
    const frame = {...b, heroes:b.heroes.slice(), creeps:rows(a.creeps,b.creeps),
      projectiles:rows(a.projectiles,b.projectiles)};
    return {a,b,frame,heroTargets,moving};
  }
  function hotkey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || document.querySelector('dialog[open]') || event.target.tagName === 'INPUT') return;
    const k = event.key.toLowerCase();
    if (!game.hidden && snapshot?.mode === 'match' && ['f1','f2','z','x'].includes(k)) {
      event.preventDefault();
      if (!event.repeat && !demo) chooseUnits(k === 'f1' || k === 'z' ? [snapshot.heroes[team].id] :
        controlledUnits(snapshot).map(u => u.id));
      return;
    }
    if (!game.hidden && snapshot && (k === '`' || event.code === 'Backquote') && !event.shiftKey) {
      event.preventDefault();
      if (!event.repeat) showRoster($('matchRoster').hidden);
      return;
    }
    if (!$('matchRoster').hidden && k === 'escape') {
      showRoster(false);
      return;
    }
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
      if (cameraInputEnabled()) panKeys.add(k);
      return;
    }
    if (event.repeat) return;
    if (k === '?') return help();
    if (game.hidden) {
      if (k === 'escape' && heroPreviewCard) return hideHeroGuide();
      if (k === 'escape' && (waiting || networkAction || seat)) return disconnect();
      if (/^[1-9]$/.test(k) && heroKeys[+k - 1]) pick(heroKeys[+k - 1]);
      if (k.startsWith('arrow')) {
        event.preventDefault();
        const step = k === 'arrowright' || k === 'arrowdown' ? 1 : -1;
        if (k === 'arrowup' || k === 'arrowdown') setDifficulty(difficulties[(difficulties.indexOf(difficulty) + step + 3) % 3]);
        else pick(heroKeys[(heroKeys.indexOf(selected) + step + heroKeys.length) % heroKeys.length]);
      }
      if (k === 'enter' && event.target.tagName !== 'BUTTON') {
        if (view === 'training') startTraining();
        else if (view === 'solo') solo();
        else if (view === 'teams') startTeamMatch();
      }
      if (k === 'n') { tab('online'); $('name').focus(); }
      return;
    }
    const kit = snapshot && HEROES[snapshot.heroes[team].hero];
    const spellSlot = keys.indexOf(k.toUpperCase());
    if (pendingCast && k === 'escape') return setPendingCast(null);
    if (pendingCast && ['a', 's', 't'].includes(k)) setPendingCast(null);
    if (k === 'c') toggleCamera();
    else if (k === ' ' && snapshot?.mode === 'match' && !paused) {
      event.preventDefault();
      stopCameraDrag();
      panKeys.clear();
      edgePointer = null;
      if (renderer.focus) {
        const { x, y } = (renderer.displayed || snapshot).heroes[team];
        freeCamera(x,y);
      }
    } else if (spellSlot >= 0 && spellSlot < kit?.abilities.length) chooseAbility(spellSlot);
    else if (/^[1-6]$/.test(k)) useItem(+k - 1);
    else if (k === 'b') toggleShop();
    else if (k === 't') issue({o:'recall'});
    else if (k === 's') {
      const ids = selectedGroup();
      issue(ids.length ? {o:'group',ids,action:'stop'} : {o:'stop'});
    }
    else if (k === 'a') battleOrder(aimPoint(),'amove');
    else if (k === 'p' || k === 'escape') {
      if (!$('shop').hidden && k === 'escape') toggleShop();
      else if (inspectedId != null && k === 'escape') selectUnit(null);
      else pause();
    } else if (k === 'g') changeQuality();
    else if (k === 'm') changeAudio();
  }
  function wire() {
    window.addEventListener('pointerdown', unlockMatchAudio, true);
    window.addEventListener('pointerup', unlockMatchAudio, true);
    window.addEventListener('keydown', unlockMatchAudio, true);
    arena.addEventListener('contextmenu', event => { if (!game.hidden) event.preventDefault(); });
    arena.addEventListener('pointerdown', arenaPointerDown);
    arena.addEventListener('pointermove', arenaPointerMove);
    arena.addEventListener('pointerleave', () => { cursorOnArena = false; });
    const roster = $('matchRoster');
    roster.addEventListener('contextmenu', event => event.preventDefault());
    roster.addEventListener('pointerdown', event => { if (event.button === 2) canvasOrder(event); });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      arena.addEventListener(type, event => {
        if (selectionDrag?.id === event.pointerId) finishSelectionDrag(event);
        if (cameraDrag?.id === event.pointerId) stopCameraDrag();
      });
    }
    $('matchOverlay').addEventListener('pointerdown', e => {
      if (e.target === $('matchOverlay') && $('overlayAction').onclick === pause) pause();
    });
    const minimap = $('minimap');
    const mapFocus = event => {
      if (!cameraInputEnabled()) return;
      const rect = minimap.getBoundingClientRect();
      freeCamera((event.clientX-rect.x) / rect.width * WIDTH, (event.clientY-rect.y) / rect.height * renderer.height);
    };
    minimap.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !cameraInputEnabled()) return;
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
        edgePointer = event.target === arena && renderer.focus && !cameraDrag ? hovered : null;
      }
    });
    document.addEventListener('pointerout', event => {
      if (!event.relatedTarget) edgePointer = null;
    });
    document.addEventListener('keydown', hotkey);
    document.addEventListener('keyup', event => panKeys.delete(event.key.toLowerCase()));
    const resetCameraInput = () => {
      stopCameraDrag();
      stopSelectionDrag();
      setPendingCast(null);
      panKeys.clear();
      cursorOnArena = false;
      edgePointer = null;
    };
    window.addEventListener('blur', resetCameraInput);
    document.addEventListener('visibilitychange', () => { if (document.hidden) resetCameraInput(); });
    $('start').onclick = () => solo();
    $('startTraining').onclick = () => startTraining();
    $('startTeamMatch').onclick = () => startTeamMatch();
    $('fortify').onclick = () => issue({ o:'fortify' });
    $('buyback').onclick = () => issue({ o:'buyback' });
    $('trainingCooldowns').onclick = () => {
      if (snapshot?.training && issue({ o:'trainingCooldowns', disabled:!snapshot.training.noCooldowns })) updateHud(snapshot);
    };
    $('changeTrainingHero').onclick = openTrainingHeroPicker;
    $('closeTrainingHeroPicker').onclick = () => $('trainingHeroPicker').close();
    $('soloTab').onclick = () => tab('solo');
    $('onlineTab').onclick = () => tab('online');
    $('teamsTab').onclick = () => tab('teams');
    $('trainingTab').onclick = () => tab('training');
    $('host').onclick = () => network('host');
    $('find').onclick = () => network('find');
    $('join').onclick = () => network('join');
    $('hostTeamMatch').onclick = () => network('host5v5');
    $('joinTeamMatch').onclick = () => network('join5v5');
    $('copyTeamInvite').onclick = copyInvite;
    $('leaveTeamRoom').onclick = disconnect;
    $('launchTeamRoom').onclick = () => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({t:'start5v5'}));
    };
    $('copy').onclick = copyInvite;
    $('cancelWait').onclick = disconnect;
    $('back').onclick = confirmEndMatch;
    $('rosterButton').onclick = () => showRoster($('matchRoster').hidden);
    $('closeRoster').onclick = () => showRoster(false);
    $('audio').onclick = changeAudio;
    $('camera').onclick = toggleCamera;
    $('quality').onclick = changeQuality;
    $('shopButton').onclick = toggleShop;
    $('closeShop').onclick = toggleShop;
    $('closeInspect').onclick = () => selectUnit(null);
    $('help').onclick = help;
    $('gameHelp').onclick = help;
    $('openItemGuide').onclick = () => { hideHeroGuide(); $('itemGuide').showModal(); };
    $('closeItemGuide').onclick = () => $('itemGuide').close();
    $('itemSearch').addEventListener('input', filterItemGuide);
    $('openHeroGuide').onclick = () => {
      hideHeroGuide();
      renderHeroGuide($('selectedHeroGuide'), selected, true);
      $('heroGuide').showModal();
    };
    $('closeHeroGuide').onclick = () => $('heroGuide').close();
    window.addEventListener('resize', () => { if (heroPreviewCard) showHeroGuide(heroPreviewCard); });
    window.addEventListener('scroll', () => { if (heroPreviewCard) hideHeroGuide(); }, { passive:true });
    $('closeHelp').onclick = () => $('controls').close();
    $('controls').addEventListener('close', () => {
      if (wasPaused) { paused = false; wasPaused = false; }
    });
  }
  function openHash() {
    const options = new URLSearchParams(location.hash.slice(1));
    const code = options.get('room')?.toUpperCase();
    if (options.has('training')) {
      const hero = options.get('training');
      tab('training');
      startTraining(heroKeys.includes(hero) ? hero : selected, options.get('dummy') !== 'off');
      return;
    }
    if (options.has('teams')) {
      const hero = options.get('teams');
      tab('teams');
      startTeamMatch(heroKeys.includes(hero) ? hero : selected);
      return;
    }
    const play = options.get('play'), spectate = options.get('demo');
    if (play || spectate) {
      const [hero, diff, t] = (play || spectate).split(',');
      solo(heroKeys.includes(hero) ? hero : selected, difficulties.includes(diff) ? diff : difficulty, !!spectate,
        Math.max(0, Math.min(2400, Number(t) || 0)));
      return;
    }
    if (code && /^[A-Z]{4}$/.test(code)) {
      const teams = options.get('mode') === '5v5';
      tab(teams ? 'teams' : 'online');
      $(teams ? 'teamRoom' : 'room').value = code;
      if (hosted) status('Invited to room ' + code + '. Choose a hero, then join.');
    }
    try {
      const saved = JSON.parse(sessionStorage.getItem('lanebreak:seat'));
      if (hosted && saved && (!code || saved.code === code)) {
        safeSeat(saved); tab(saved.teamMatch ? 'teams' : 'online'); status('Reconnecting to your match…');
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
      if (local && !paused && local.mode === 'match' && !$('controls').open && !$('trainingHeroPicker').open) {
        const frameTime = Math.min(elapsed,.1), steps = Math.max(1, Math.ceil(frameTime * 60 - .05));
        if (frameTime > 0) {
          local.step(frameTime / steps, steps);
          localTime += frameTime;
          if (localTime - snapshot.time >= localSnapshotInterval - .001 || local.mode === 'ended') captureLocalSnapshot();
        }
      }
      if (snapshot) {
        const visible = remote ? interpolate(now) : previousLocalSnapshot && snapshot.mode === 'match' ?
          interpolateMotion(previousLocalSnapshot, snapshot,
            Math.max(previousLocalSnapshot.time, Math.min(snapshot.time, localTime - localSnapshotInterval))) : snapshot;
        panCamera(elapsed);
        renderer.frame(visible,team,visible.time,renderMark,elapsed,cursorOnArena && !paused && !demo ? hovered : null,
          inspectedId,pendingCast?.spell,selectedUnits);
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
