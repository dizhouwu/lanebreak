(function () {
  const { COLORS, HEROES, CREEPS, ORBS, WIDTH, HEIGHT } = LanebreakRules;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  function seeded(initial) {
    let n = initial;
    return () => ((n = (Math.imul(n, 1664525) + 1013904223) >>> 0) / 4294967296);
  }
  function poly(ctx, points, fill, stroke, width = 1) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function ellipse(ctx, x, y, rx, ry, fill, stroke, width = 1) {
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = width; ctx.strokeStyle = stroke; ctx.stroke(); }
  }
  function line(ctx, points, stroke, width) {
    ctx.beginPath();
    points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke();
  }
  function gradient(ctx, x1, y1, x2, y2, stops) {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    for (const [at, color] of stops) g.addColorStop(at, color);
    return g;
  }
  function glow(ctx, x, y, radius, color) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
    g.addColorStop(0, color); g.addColorStop(1, '#0000');
    ellipse(ctx, x, y, radius, radius, g);
  }
  function portrait(canvas, key) {
    const g = canvas.getContext('2d'), color = HEROES[key].color;
    g.fillStyle = gradient(g, 0, 0, 350, 220, [[0, '#0d1d22'], [.56, '#19282a'], [1, color + '8a']]);
    g.fillRect(0, 0, 360, 236);
    glow(g, 244, 88, 125, color + '77');
    const rand = seeded(key.charCodeAt(0));
    for (let i = 0; i < 92; i++) {
      const x = rand() * 360, y = rand() * 230, r = rand();
      const a = Math.floor(rand() * 100 + 35).toString(16).padStart(2, '0');
      ellipse(g, x, y, r * 2 + .3, r + .3, color + a);
    }
    for (const r of [52, 67, 90]) ellipse(g, 221, 90, r, r, null, color + '39');
    if (key === 'vesper') {
      poly(g, [[82,237],[127,161],[177,135],[219,133],[251,154],[289,236]], '#123438', '#2f746d', 3);
      poly(g, [[111,225],[150,160],[189,148],[229,154],[256,237]], '#1f5556', color + 'a0', 2);
      poly(g, [[150,153],[153,91],[181,56],[215,43],[240,76],[238,120],[216,157],[194,175]], '#16343c', '#60b5a6', 3);
      poly(g, [[170,116],[188,72],[213,61],[237,93],[226,138],[208,153],[185,142]], '#aab39a');
      poly(g, [[176,115],[198,90],[228,86],[239,111],[227,120],[207,114],[188,121]], '#12353b');
      line(g, [[196,112],[207,108],[218,109],[227,104]], '#8bf8dc', 2);
      poly(g, [[146,149],[178,139],[196,171],[238,140],[256,161],[222,196],[191,202]], '#365e58', '#87ad8d', 2);
      g.beginPath(); g.moveTo(318,37); g.bezierCurveTo(268,50,304,122,254,146); g.bezierCurveTo(265,164,255,213,303,228);
      g.strokeStyle = '#8ccbb0'; g.lineWidth = 5; g.stroke();
      line(g, [[318,37],[303,228]], '#bce2ceae', 1);
      line(g, [[286,138],[333,143]], '#e2e7ba', 2);
    } else if (key === 'brakk') {
      poly(g, [[62,236],[84,160],[132,136],[172,146],[186,131],[246,133],[268,148],[306,156],[331,236]], '#2d2728', '#b58053', 3);
      poly(g, [[68,174],[112,141],[165,158],[172,188],[133,218],[83,203]], '#795640', '#d4955e', 3);
      poly(g, [[235,164],[277,140],[317,163],[319,199],[281,221],[243,198]], '#81593f', '#d99b67', 3);
      poly(g, [[166,148],[156,113],[161,75],[196,51],[229,53],[253,78],[255,109],[240,147],[219,168],[192,168]], '#67534b', '#d99e70', 3);
      poly(g, [[159,101],[138,76],[123,56],[125,31],[153,62],[177,72],[184,88]], '#cbc0a2', '#775d4b', 2);
      poly(g, [[230,74],[257,64],[280,34],[279,58],[262,82],[252,102],[232,93]], '#c8b595', '#775d4b', 2);
      poly(g, [[162,105],[189,96],[202,104],[223,97],[253,100],[246,135],[221,156],[195,156],[175,141]], '#2b292c');
      line(g, [[174,112],[189,116],[198,114]], '#ffd682', 4);
      line(g, [[218,113],[229,115],[242,108]], '#ffd682', 4);
      poly(g, [[191,124],[207,112],[221,123],[221,145],[208,152],[194,144]], '#927059', '#dbab7c', 2);
      poly(g, [[105,233],[167,186],[207,206],[248,188],[296,231]], '#534437', '#b88c5e', 2);
      for (let i = 0; i < 5; i++) line(g, [[180 + i * 11,222],[174 + i * 15,235]], '#b88c5e', 1.5);
    } else {
      poly(g, [[95,237],[139,165],[170,148],[207,137],[254,151],[289,237]], '#272646', '#957ac7', 3);
      poly(g, [[158,152],[160,99],[180,71],[212,43],[245,65],[258,107],[247,150],[219,180],[180,172]], '#3a335a', '#bf99fe', 3);
      poly(g, [[174,127],[188,84],[214,65],[240,92],[244,120],[229,151],[210,164],[189,151]], '#171a2c');
      const light = gradient(g, 189, 120, 236, 120, [[0,'#957bff'],[.5,'#fff0ff'],[1,'#957bff']]);
      line(g, [[184,122],[197,119],[209,122],[218,122],[230,116],[239,119]], light, 4);
      poly(g, [[143,168],[184,158],[213,179],[248,152],[274,169],[235,205],[193,205]], '#544572', '#a791d1', 2);
      line(g, [[277,231],[282,174],[292,112],[307,67]], '#a28cbb', 5);
      glow(g, 307, 61, 37, '#b78effaa');
      poly(g, [[307,30],[327,59],[307,83],[289,59]], '#bd9beb', '#efe7ff', 2);
      poly(g, [[307,30],[307,83],[289,59]], '#6c52aa', '#eee1ffa0', 1);
      ellipse(g, 307, 59, 27, 27, null, '#d7b6ff6c', 2);
    }
  }
  function titleScene(g, width, height) {
    g.save();
    g.scale(width / 1440, height / 900);
    g.fillStyle = gradient(g, 0, 0, 0, 900, [[0, '#121d27'], [.36, '#2b494a'], [.59, '#62674c'], [1, '#0a151a']]);
    g.fillRect(0, 0, 1440, 900);
    glow(g, 1050, 317, 381, '#eed29388');
    glow(g, 1115, 347, 180, '#eec07a70');
    const rand = seeded(82);
    for (let layer = 0; layer < 8; layer++) {
      const points = [[0, 900], [0, 382 + layer * 46]];
      for (let x = 0; x <= 1500; x += 35) {
        const y = 248 + layer * 49 + 74 * Math.sin(x * .003 + layer) +
          Math.abs(x - (1030 + layer * 29)) * .032 - rand() * 57;
        points.push([x, y]);
      }
      points.push([1500, 900]);
      const greens = ['#33494b', '#30444a', '#2c3d45', '#24393e', '#213137', '#1c2d33', '#17272c', '#122225'];
      poly(g, points, greens[layer]);
    }
    const path = [[1017,325],[1101,347],[1176,399],[1152,434],[997,472],[959,505],[1010,542],[1219,575],[1336,652],[1227,724],[997,773],[701,881]];
    for (const [stroke, width] of [['#315052', 32], ['#92a18a95', 13], ['#efcb838f', 5]]) line(g, path, stroke, width);
    for (let i = 0; i < 400; i++) {
      const x = rand() * 1440, y = 385 + rand() * 510, size = rand() * (y - 360) / 27;
      if (x < 610 || Math.abs(x - 1080) > 320 || y > 615) {
        poly(g, [[x - size * .5,y],[x,y - size],[x + size * .4,y]], i % 2 ? '#101f22' : '#16252a');
      }
    }
    function citadel(x, y, s, tint) {
      g.save(); g.translate(x,y); g.scale(s,s);
      poly(g, [[-127,65],[-50,34],[52,39],[115,70],[54,105],[-68,100]], '#142126', '#73837e', 2);
      for (const [dx, dy, size] of [[-60,42,.8],[46,47,.75],[4,34,1.18]]) {
        const w = 19 * size, h = 90 * size;
        poly(g, [[dx-w,dy],[dx-w,dy-h],[dx,dy-h-14],[dx+w,dy-h],[dx+w,dy],[dx,dy+8]], '#182529', '#749087', 1.4);
        poly(g, [[dx,dy+8],[dx,dy-h-14],[dx+w,dy-h],[dx+w,dy]], '#314245');
        poly(g, [[dx-w-5,dy-h],[dx,dy-h-35],[dx+w+5,dy-h],[dx,dy-h+9]], '#37484a', '#93a79a', 1.4);
        glow(g, dx + 3, dy - h * .62, 32 * size, tint + 'a0');
        g.fillStyle = tint; g.fillRect(dx + 1, dy - h * .71, 3, 11 * size);
      }
      g.restore();
    }
    citadel(1100, 374, .74, '#eac78d');
    citadel(1192, 587, 1.14, '#e68862');
    citadel(765, 710, 1.36, '#91d7ca');
    for (let i = 0; i < 95; i++) {
      const x = rand() * 1440, y = 210 + rand() * 640;
      ellipse(g, x, y, rand() * 2 + .35, rand() * 1.1 + .3, i % 3 === 0 ? '#e6c99b8f' : '#9db9a94d');
    }
    g.restore();
  }
  function terrain() {
    const c = document.createElement('canvas');
    c.width = WIDTH; c.height = HEIGHT;
    const g = c.getContext('2d'), rand = seeded(743);
    g.fillStyle = gradient(g, 0, 0, 0, HEIGHT, [[0, '#102326'], [.27, '#263735'], [.52, '#35423a'], [.77, '#1b2c2b'], [1, '#111f23']]);
    g.fillRect(0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < 3500; i++) {
      const x = rand() * WIDTH, y = rand() * HEIGHT;
      ellipse(g, x, y, rand() * 16 + 1, rand() * 7 + 1, i % 2 ? '#92a28415' : '#0c181c37');
    }
    for (let i = 0; i < 850; i++) {
      const x = rand() * WIDTH, y = rand() < .5 ? rand() * 250 : 655 + rand() * 345;
      const r = 9 + rand() * (y > 900 ? 28 : 17);
      ellipse(g, x + 5, y + 9, r * 1.22, r * .62, '#0c191b94');
      for (let j = 0; j < 3; j++) {
        const ax = x + (j - 1) * r * .52, ay = y - j * 9;
        poly(g, [[ax-r*.8,ay+6],[ax-r*.4,ay-r*.69],[ax+3,ay-r],[ax+r*.69,ay-r*.36],[ax+r*.53,ay+r*.27],[ax-r*.43,ay+r*.53]], ['#263e38','#314940','#354b3e'][j], '#4260546b');
      }
    }
    const river = [[2537,-20],[2499,95],[2573,218],[2527,331],[2530,500],[2498,602],[2560,735],[2509,1000],
      [2702,1000],[2732,784],[2693,618],[2705,510],[2681,375],[2747,225],[2672,91],[2705,-20]];
    poly(g, river, gradient(g, 2470, 0, 2720, 0, [[0,'#344a44'],[.17,'#24454a'],[.57,'#2f5960'],[1,'#354d4a']]), '#648075', 3);
    for (let i = 0; i < 270; i++) {
      const x = 2577 + rand() * 67, y = rand() * 1000;
      line(g, [[x, y],[x - 10 - rand() * 15,y + 1]], '#81aeb038', 1.4);
    }
    for (const y of [170, 730]) {
      ellipse(g, 2600, y, 58, 30, '#1c3238', '#758d82', 2);
      ellipse(g, 2600, y, 48, 23, null, '#709b8e82', 1);
    }
    const lane = [[0,410],[405,374],[835,390],[1350,367],[1770,389],[2200,373],[2550,389],[2840,378],
      [3310,392],[3800,365],[4520,383],[5200,405],[5200,495],[4490,529],[3800,509],[3270,525],[2850,510],
      [2540,519],[2130,512],[1750,533],[1350,515],[841,529],[490,512],[0,489]];
    poly(g, lane, '#4c5142', '#71715a', 4);
    for (let x = 0; x < WIDTH; x += 69) {
      for (const y of [405, 443, 483]) {
        const sx = x + rand() * 25, sy = y + (rand() - .5) * 17, w = 33 + rand() * 34;
        poly(g, [[sx,sy],[sx+w-10,sy-4],[sx+w,sy+15],[sx+w-12,sy+32],[sx-5,sy+26]], rand() < .5 ? '#54594b' : '#565a4b', '#78816b55', 1.1);
      }
    }
    for (const team of [0, 1]) {
      const col = COLORS[team];
      for (const [x, y, r] of [[110, 450, 105], [520,450,115],[1150,330,77],[1850,330,77]]) {
        const cx = team ? WIDTH - x : x;
        ellipse(g, cx, y + 13, r + 8, r * .59, '#18282ca8', '#5c6b5e', 4);
        ellipse(g, cx, y + 13, r, r * .51, '#303e3e', col + '48', 2);
        ellipse(g, cx, y + 13, r * .79, r * .39, null, '#a4ab8433', 2);
        for (let j = 0; j < 10; j++) {
          const angle = j / 10 * Math.PI * 2;
          ellipse(g, cx + r * .9 * Math.cos(angle), y + 13 + r * .45 * Math.sin(angle), 5, 4, col + '66');
        }
      }
    }
    return c;
  }
  class Renderer {
    constructor(canvas, minimap) {
      this.canvas = canvas;
      this.mini = minimap;
      this.g = canvas.getContext('2d', { alpha: false });
      this.map = null;
      this.cam = 0;
      this.focus = null;
      this.scale = 1;
      this.quality = 'auto';
      this.auto = 1;
      this.measure = null;
      this.dirty = true;
    }
    resize() {
      const factor = { auto: this.auto, high: 1, medium: .75, low: .5 }[this.quality];
      const { clientWidth, clientHeight } = this.canvas;
      const cap = Math.sqrt(3840 * 2160 / Math.max(1, clientWidth * clientHeight));
      const dpr = Math.min(devicePixelRatio || 1, 2, cap) * factor;
      const w = Math.round(clientWidth * dpr), h = Math.round(clientHeight * dpr);
      if (w !== this.canvas.width || h !== this.canvas.height) {
        this.canvas.width = w; this.canvas.height = h; this.dirty = true;
      }
      this.scale = h / HEIGHT;
    }
    title() {
      this.resize();
      if (!this.dirty) return;
      titleScene(this.g, this.canvas.width, this.canvas.height);
      this.dirty = false;
    }
    toWorld(x, y) {
      return { x: this.cam + x * this.canvas.width / this.canvas.clientWidth / this.scale,
        y: y * HEIGHT / this.canvas.clientHeight };
    }
    camera(hero) {
      const view = this.canvas.width / this.scale;
      return clamp((this.focus ?? (hero.x + (hero.team ? -1 : 1) * Math.min(200, view * .18))) - view / 2, 0, Math.max(0, WIDTH - view));
    }
    frame(s, team, now, mark, dt, pointer) {
      this.resize();
      const g = this.g, w = this.canvas.width, h = this.canvas.height;
      if (!w || !h) return;
      if (!this.map) this.map = terrain();
      if (dt > 0 && dt <= .25) {
        this.measure ||= { frames: 0, time: 0, fps: 0, settle: 0 };
        const m = this.measure;
        m.frames++; m.time += dt;
        if (m.time >= 1) {
          m.fps = m.frames / m.time;
          m.frames = 0; m.time = 0;
          if (this.quality === 'auto' && !m.locked) {
            if (m.settle) m.settle--;
            else if (m.probe) {
              if (m.fps < m.probe.fps * 1.20) {
                this.auto = m.probe.level;
                m.locked = true;
              }
              m.probe = null;
            } else if (m.fps < 45 && this.auto > .5) {
              m.probe = { fps: m.fps, level: this.auto };
              this.auto -= .25;
              m.settle = 1;
            }
          }
        }
      }
      this.cam = this.camera(s.heroes[team]);
      this.displayed = s;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#142529'; g.fillRect(0, 0, w, h);
      g.setTransform(this.scale, 0, 0, this.scale, -this.cam * this.scale, 0);
      g.drawImage(this.map, 0, 0);
      const visible = u => u.x >= this.cam - 175 && u.x <= this.cam + w / this.scale + 175;
      const player = s.heroes[team];
      const troops = s.creeps.map(([id, team, kind, x, y, hp, maxHp, attack, r, facing, flags]) =>
        ({ id, type: 'creep', team, kind, x, y, hp, maxHp, attack, r: r ?? CREEPS[kind].r, facing, flags }));
      const units = [...troops, ...s.heroes].filter(u => u.hp > 0);
      for (const b of s.buildings) {
        if (b.hp <= 0 || !b.range) continue;
        if (b.team !== team && !b.protected && b.x + b.range > this.cam && b.x - b.range < this.cam + w / this.scale) {
          g.setLineDash([11, 9]);
          ellipse(g, b.x, b.y, b.range, b.range, null, '#ff636eaa', 2);
          g.setLineDash([]);
        }
        const target = b.target && units.find(u => u.id === b.target);
        if (target && (visible(b) || visible(target))) {
          const hitsPlayer = target.id === player.id;
          line(g, [[b.x, b.y-79], [target.x, target.y]], hitsPlayer ? '#ff939ac4' : COLORS[b.team] + '5a', hitsPlayer ? 2.4 : 1.4);
        }
      }
      if (player.hp > 0) {
        const reach = HEROES[player.hero].range + 26;
        ellipse(g, player.x, player.y, reach, reach, null, '#ffffff12', 2);
      }
      for (const b of s.buildings) if (visible(b)) this.building(g, b, team);
      for (const t of [0, 1]) {
        const x = t ? 5090 : 110;
        if (!visible({x})) continue;
        const color = COLORS[t];
        ellipse(g, x, 450, 72, 41, '#152b31', color + '9e', 3);
        ellipse(g, x, 450, 58, 30, '#2c5158', color + '77', 2);
        const pulse = 14 + (now * 100 % 30);
        ellipse(g, x, 447, pulse, pulse * .59, null, color + '90', 2);
        this.crystal(g, x, 438, 31, color);
      }
      if (s.orb && visible(s.orb)) {
        const { x, y, kind } = s.orb, color = ORBS[kind], u = y - 11 + Math.sin(now * 4) * 6;
        glow(g, x, u, 53, color + '92');
        this.crystal(g, x, u, 21, color);
        this.label(g, kind.toUpperCase(), x, y + 43, 13, color);
      }
      for (const [, side, rad, x, y, strike, duration, hero, ultimate] of s.areas) {
        if (!visible({x})) continue;
        const color = HEROES[hero]?.color || COLORS[side];
        const progress = clamp(1 - (strike - now) / (duration || 1), 0, 1);
        ellipse(g, x, y, rad, rad, color + '22', color + '9d', 3);
        ellipse(g, x, y, rad * progress, rad * progress, null, color + 'b8', ultimate ? 4 : 2);
      }
      const fighters = units.filter(visible).sort((a, b) => a.y - b.y);
      for (const u of fighters) u.type === 'hero' ? this.hero(g, u, team, now) : this.creep(g, u, team);
      for (const [, side, kind, x, y, source, dx, dy, width] of s.projectiles) {
        if (!visible({x})) continue;
        const color = source === 'building' ? '#fff0b0' : HEROES[source]?.color || COLORS[side];
        if (kind === 'bolt') {
          g.lineCap = 'round';
          line(g, [[x - dx * 70, y - dy * 70], [x, y]], color + '78', width * .5);
          line(g, [[x - dx * 30, y - dy * 30], [x, y]], '#f5f1ee', 4);
          g.lineCap = 'butt';
        } else {
          const r = source === 'creep' ? 4 : 6;
          ellipse(g, x, y, r, r, color);
        }
      }
      const markAge = mark && performance.now() - mark.at;
      if (mark && markAge < 550 && visible(mark)) {
        const r = 12 + markAge * .045;
        g.globalAlpha = 1 - markAge / 550;
        ellipse(g, mark.x, mark.y, r, r * .65, null, mark.color, 2.4);
        g.globalAlpha = 1;
      }
      for (const e of s.effects) {
        const age = now - e.time;
        if (age < -.06 || age > 1.08 || !visible(e)) continue;
        g.globalAlpha = clamp((1 - age) * 1.3, 0, 1);
        if (e.kind === 'burst' || e.kind === 'cast') {
          const color = HEROES[e.hero]?.color || COLORS[e.team];
          const r = (e.radius || 45) * clamp(.25 + age * 3, .25, 1);
          ellipse(g, e.x, e.y, r, r, color + '24', color + 'cc', 4);
          if (e.kind === 'burst') {
            for (let i = 0; i < 9; i++) {
              const a = i * Math.PI * 2 / 9 + e.id;
              const x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
              ellipse(g, x, y, 5, 2, color);
            }
          }
        } else if (['gold','hit','level'].includes(e.kind)) {
          this.label(g, e.text, e.x + (e.id % 3 - 1) * 13, e.y - 31 - age * 30,
            e.kind === 'hit' ? 15 : 19, e.text === 'Denied' ? '#c9a0ff' : e.kind === 'hit' ? '#f1ded0' : '#ffd48b');
        }
        g.globalAlpha = 1;
      }
      const target = pointer && Lanebreak.pickTarget(s, team, this.toWorld(pointer.x, pointer.y));
      if (target) ellipse(g, target.x, target.y, target.r + 7, target.r + 7, null, target.team === team ? '#c9a0ff' : '#ff6b6b', 2.5);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = gradient(g, 0, 0, 0, h, [[0,'#080e15c0'],[.23,'#080e1500'],[.66,'#080e1500'],[1,'#080e15a9']]);
      g.fillRect(0, 0, w, h);
      this.minimap(s, team, w / this.scale);
    }
    label(g, text, x, y, size, color) {
      g.font = '700 ' + size + 'px system-ui'; g.textAlign = 'center';
      g.lineWidth = 3; g.strokeStyle = '#10191be0'; g.strokeText(text, x, y);
      g.fillStyle = color; g.fillText(text, x, y);
    }
    bar(g, u, y, width, color, height = 5, fraction = u.hp / u.maxHp) {
      g.fillStyle = '#0a1416'; g.fillRect(u.x - width / 2 - 1, y - 1, width + 2, height + 2);
      g.fillStyle = '#283332'; g.fillRect(u.x - width / 2, y, width, height);
      g.fillStyle = color; g.fillRect(u.x - width / 2, y, width * clamp(fraction,0,1), height);
    }
    crystal(g, x, y, r, color) {
      poly(g, [[x,y-r],[x+r*.59,y-r*.15],[x+r*.40,y+r*.55],[x,y+r*.78],[x-r*.45,y+r*.52],[x-r*.58,y-r*.16]], color, '#f1e7cbe0', 1.3);
      poly(g, [[x,y-r],[x,y+r*.78],[x-r*.45,y+r*.52],[x-r*.58,y-r*.16]], '#101e2860');
      line(g, [[x,y-r],[x,y+r*.78]], '#f7f0d4aa', 2);
    }
    building(g, b, team) {
      const {x,y,r} = b, color = COLORS[b.team], core = b.kind === 'core';
      if (b.hp <= 0) {
        poly(g, [[x-r,y+13],[x-r*.6,y-20],[x-5,y-12],[x+r*.3,y-25],[x+r,y+9],[x+r*.65,y+24],[x-r*.6,y+22]], '#444a42', '#1a2828', 4);
        return;
      }
      ellipse(g, x + 14, y + 14, r * 1.25, r * .71, '#122127aa');
      for (const offset of [17, 8, 0]) {
        poly(g, [[x-r,y+offset],[x-r*.54,y-r*.48+offset],[x+r*.54,y-r*.48+offset],[x+r,y+offset],[x+r*.50,y+r*.39+offset],[x-r*.50,y+r*.39+offset]],
          offset ? '#29383a' : '#4e5b54', '#18282a', 3);
      }
      if (core) {
        ellipse(g,x,y-5,r*.75,r*.43,'#24363a',color+'94',3);
        glow(g,x,y-43,75,color+'77');
        this.crystal(g,x,y-42,50,color);
      } else {
        const col = b.attack ? color : color + 'c5';
        poly(g, [[x-r*.53,y],[x-r*.4,y-62],[x+r*.4,y-62],[x+r*.53,y],[x+r*.25,y+12],[x-r*.25,y+12]], '#404d4a', '#18272a', 3);
        poly(g, [[x,y+12],[x,y-64],[x+r*.4,y-62],[x+r*.53,y],[x+r*.25,y+12]], '#2a3b3d');
        poly(g, [[x-r*.65,y-59],[x-r*.50,y-83],[x+r*.50,y-83],[x+r*.65,y-58],[x+r*.29,y-49],[x-r*.3,y-49]], '#63716a', '#27393a', 3);
        this.crystal(g,x,y-80,17,col);
        line(g, [[x-8,y-37],[x,y-28],[x+8,y-37]], col, 3);
      }
      if (b.protected) {
        g.setLineDash([5, 5]);
        ellipse(g,x,y+3,r+10,r+10,null,'#e9e5cd9c',2);
        g.setLineDash([]);
      }
      this.bar(g,b,y - (core ? 102 : 109),core ? 130 : 86,b.team === team ? '#58d86a' : '#ff5a5a',8);
    }
    hero(g, u, team, now) {
      const {x,y} = u, color = COLORS[u.team], armor = HEROES[u.hero].color;
      ellipse(g,x+7,y+10,30,16,'#102125a5');
      ellipse(g,x,y+4,u.r+9,u.r+5,null,color,4);
      for (const id of u.potionActive ? [...(u.buffs || []), 'potion'] : u.buffs || []) {
        const buffColor = ORBS[id] || (id === 'potion' ? '#e2506a' : id === 'sprint' ? '#f0a23c' : armor);
        g.globalAlpha = .5 + .3 * Math.sin(now * 8);
        ellipse(g,x,y,u.r+15,u.r+15,null,buffColor,3);
        g.globalAlpha = 1;
      }
      if (u.channel > now) {
        const start = -Math.PI / 2, progress = clamp(1 - (u.channel - now) / 3, 0, 1);
        g.beginPath(); g.arc(x,y,u.r+24,start,start+2*Math.PI*progress); g.strokeStyle=color; g.lineWidth=5; g.stroke();
      }
      const facing = u.facing ?? (u.team ? Math.PI : 0);
      const lunge = u.attack && u.hero === 'brakk' ? 8 : 0;
      g.save();
      g.translate(x + Math.cos(facing)*lunge,y + Math.sin(facing)*lunge);
      g.scale(Math.cos(facing) < 0 ? -1 : 1,1);
      g.translate(-x,-y);
      poly(g, [[x-25,y+10],[x-18,y-23],[x-5,y-31],[x+12,y-27],[x+23,y-17],[x+25,y+10],[x+7,y+22],[x-12,y+20]], '#1d333b', armor, 2.7);
      poly(g, [[x-22,y],[x-15,y-19],[x+6,y-20],[x+18,y-7],[x+14,y+13],[x-5,y+18]], armor + '95');
      ellipse(g,x,y-27,13,13,'#18232b',armor,2.7);
      if (u.hero === 'brakk') {
        poly(g,[[x-11,y-31],[x-25,y-49],[x-23,y-35],[x-16,y-25]],'#e0cba6');
        poly(g,[[x+11,y-31],[x+25,y-49],[x+23,y-35],[x+16,y-25]],'#e0cba6');
        poly(g,[[x+18,y-11],[x+30,y-4],[x+39,y+13],[x+27,y+18],[x+19,y+8]],'#c78756','#eed4a5',1);
      } else if (u.hero === 'vesper') {
        g.beginPath();g.arc(x+18,y-9,18,-1.17,1.17);g.lineWidth=3;g.strokeStyle='#b6e2c4';g.stroke();
        line(g,[[x+25,y-25],[x+25,y+8]],'#a4dec8',1);
        poly(g,[[x-14,y-24],[x-5,y-44],[x+11,y-36],[x+16,y-23],[x+2,y-28]],'#488c87',armor,1.3);
      } else {
        line(g,[[x+24,y+16],[x+27,y-35]],'#9b83c4',3);
        this.crystal(g,x+27,y-38,11,'#b494f7');
      }
      g.restore();
      if (u.attack) ellipse(g,x,y,30,20,null,'#ead79488',2);
      if (u.stunned) this.label(g,'✦ ✦',x,y-77,17,'#fff29a');
      this.bar(g,u,y-55,74,u.team === team ? '#58d86a' : '#ff5a5a',8);
      this.bar(g,u,y-45,74,'#5a9bff',4,u.mana / u.maxMana);
      g.fillStyle = '#0008';
      for (let k = 250; k < u.maxHp; k += 250) g.fillRect(x-37+74*k/u.maxHp,y-55,1,8);
      this.label(g,String(u.level),x-47,y-46,14,'#ffe08a');
      this.label(g,u.name,x,y-62,14,'#f1f1dd');
    }
    creep(g, u, team) {
      const {x,y,r} = u, color = COLORS[u.team], flags = Lanebreak.CREEP_FLAGS;
      ellipse(g,x+4,y+6,r+3,r*.63,'#111e2385');
      const facing = u.facing ?? (u.team ? Math.PI : 0), lunge = u.kind === 'melee' && u.attack ? 5 : 0;
      const direction = Math.cos(facing) < 0 ? -1 : 1;
      g.save(); g.translate(Math.cos(facing)*lunge,Math.sin(facing)*lunge);
      if (u.kind === 'siege') {
        poly(g,[[x-r,y-9],[x-r*.4,y-15],[x+r,y-10],[x+r,y+10],[x-r,y+10]],'#374d4c',color,2);
        ellipse(g,x-r*.64,y+7,7,7,'#18282b',color+'a9',1.4);
        ellipse(g,x+r*.61,y+7,7,7,'#18282b',color+'a9',1.4);
        line(g,[[x,y-13],[x+direction*24,y-16]],color,4);
      } else {
        poly(g,[[x-r,y+6],[x-r*.7,y-r*.52],[x+r*.61,y-r*.57],[x+r,y+4],[x+3,y+12]],'#243539',color,2);
        if (u.kind === 'ranged') this.crystal(g,x,y-8,9,color);
        else ellipse(g,x,y-8,8,8,color+'8e','#203236',1.5);
        line(g,[[x+direction*11,y-3],[x+direction*21,y+4]],'#e2d9b4',2.1);
      }
      g.restore();
      if (u.attack) ellipse(g,x,y,15,8,null,color+'a0',1.4);
      if (u.flags & flags.stunned) this.label(g,'✦',x,y-r-13,16,'#fff29a');
      if (u.flags & flags.rallied) ellipse(g,x,y,r+5,r+5,null,'#ffd95a',2);
      if (u.hp / u.maxHp < .999) {
        const hpColor = u.team !== team ? '#ff6464' : u.flags & flags.deniable ? '#c9a0ff' : '#6fd37a';
        this.bar(g,u,y-r-11,34,hpColor,4);
      }
    }
    minimap(s, team, view) {
      const g = this.mini.getContext('2d'), w = this.mini.width, h = this.mini.height;
      const x = n => n / WIDTH * w, y = n => n / HEIGHT * h;
      g.fillStyle = '#141c1e'; g.fillRect(0,0,w,h);
      g.fillStyle='#444331';g.fillRect(0,y(320),w,y(260));
      g.fillStyle='#315363'; g.fillRect(x(2510),0,x(180),h);
      for (const b of s.buildings) if (b.hp > 0) {
        g.fillStyle = COLORS[b.team]; const r = b.kind === 'core' ? 7 : 4;
        g.fillRect(x(b.x)-r,y(b.y)-r,r*2,r*2);
      }
      for (const c of s.creeps) {
        g.fillStyle = COLORS[c[1]]+'b0'; g.fillRect(x(c[3])-2,y(c[4])-2,4,4);
      }
      for (const hero of s.heroes) if (hero.hp > 0) {
        const px = x(hero.x), py = y(hero.y);
        g.fillStyle = HEROES[hero.hero].color; g.fillRect(px-5,py-5,10,10);
        g.strokeStyle = COLORS[hero.team]; g.lineWidth = hero.team === team ? 3 : 2; g.strokeRect(px-6,py-6,12,12);
      }
      if (s.orb) ellipse(g,x(s.orb.x),y(s.orb.y),3.5,3.5,ORBS[s.orb.kind]);
      g.lineWidth=1.7;g.strokeStyle='#e4e4ba9b';g.strokeRect(x(this.cam),1,x(Math.min(view,WIDTH)),h-2);
    }
  }
  globalThis.LanebreakPaint = { Renderer, portrait };
})();
