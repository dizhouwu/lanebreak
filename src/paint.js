(function () {
  const { COLORS, HEROES, CREEPS, ITEMS, ORBS, WEAVE_ORBS, WIDTH, HEIGHT, DUEL_MAP, TEAM_MAP } = LanebreakRules;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const FREE_VIEW_HEIGHT = HEIGHT * .84;
  const SPRITE_SCALE = 2;
  const BUILDING_SPRITE = { left:108, top:124, width:216, height:200 };
  const CREEP_SPRITE = { left:48, top:30, width:96, height:56 };
  const CAIRN_JETS = { Flashpan:1, 'Flue Burst':2, 'Chimney Shot':3, 'Furnace Vent':5 };
  const CAST_POSES = {
    vesper: { lean:-.13, step:-7, lift:3 },
    brakk: { lean:.23, step:11, lift:5 },
    orrin: { lean:-.08, step:0, lift:8 },
    kestrel: { lean:.18, step:7, lift:6 },
    veyra: { lean:.27, step:10, lift:3 },
    neris: { lean:-.1, step:0, lift:8 },
    cairn: { lean:-.2, step:-7, lift:2 },
    ecarg: { lean:.12, step:0, lift:2 }
  };
  function makeSprite(bounds, paint) {
    const canvas = document.createElement('canvas');
    canvas.width = bounds.width * SPRITE_SCALE;
    canvas.height = bounds.height * SPRITE_SCALE;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(SPRITE_SCALE, 0, 0, SPRITE_SCALE, bounds.left * SPRITE_SCALE, bounds.top * SPRITE_SCALE);
    paint(ctx);
    return canvas;
  }
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
  function weaveOrb(g, x, y, radius, mark) {
    const [light, edge] = WEAVE_ORBS[mark];
    ellipse(g, x, y, radius * 1.5, radius * 1.5, edge + '48');
    ellipse(g, x, y, radius, radius, edge);
    ellipse(g, x, y, radius * .6, radius * .6, light);
  }
  function weapon(g, key, x, y, scale, color, bowStroke = 0) {
    g.save();
    g.translate(x,y);
    g.scale(scale,scale);
    if (key === 'kestrel') {
      poly(g,[[-8,15],[-5,-10],[0,-26],[6,-26],[9,-7],[15,-21],[21,-17],[15,11],[4,22]],'#234e67',color,2);
      line(g,[[5,-23],[2,-8],[13,-10],[8,11]],'#e6fdff',2.5);
    } else if (key === 'veyra') {
      for (const offset of [-15, 7]) {
        poly(g, [[offset-3,20],[offset-5,6],[offset+2,-21],[offset+17,-34],[offset+15,-13],[offset+4,8],[offset+4,20]],
          '#923e35', '#ffc987', 1.7);
        line(g,[[offset+2,4],[offset+12,-23]],color,2.5);
      }
    } else if (key === 'ecarg') {
      g.rotate(-.62);
      line(g, [[0,-6],[0,-32]], '#9a6441', 6);
      ellipse(g,0,-34,4.3,4.3,'#c09560','#e8bb77',1.6);
      line(g,[[-6,-29],[6,-29]],'#e1b77f',2);
      g.beginPath(); g.moveTo(0,-14);
      g.bezierCurveTo(-16,-17,-15,-5,-8,-1);
      g.bezierCurveTo(-22,9,-14,24,0,23);
      g.bezierCurveTo(14,24,22,9,8,-1);
      g.bezierCurveTo(15,-5,16,-17,0,-14);
      g.closePath(); g.fillStyle='#ab613c'; g.fill(); g.strokeStyle='#ffcb91'; g.lineWidth=2.3; g.stroke();
      line(g,[[-7,6],[7,6]],'#f2c486',2.2);
      for (const offset of [-2.4,-.8,.8,2.4]) line(g,[[offset,-32],[offset,17]],'#ffe0b6',.75);
      line(g,[[-17 + bowStroke,22],[25 + bowStroke,-20]],'#d8b391',2.5);
      line(g,[[-17 + bowStroke,22],[23 + bowStroke,-23]],color,1);
    } else if (key === 'cairn') {
      const size = 17;
      line(g,[[-6,29],[1,-4],[9,-22]],'#815a43',5);
      ellipse(g,8,-15,size,size * .65,'#422822',color,2.3);
      for (const dy of [-19,-14,-9]) line(g,[[-1,dy],[16,dy]],'#ffd078',1.7);
      glow(g,8,-15,23,color+'95');
    } else if (key === 'neris') {
      line(g,[[-15,6],[0,-17],[15,6],[0,19],[-15,6]],color,2);
      line(g,[[-13,6],[13,6],[0,-15],[0,19]],'#ffe7a099',1.4);
      weaveOrb(g,-13,6,4,0);
      weaveOrb(g,0,-15,4,1);
      weaveOrb(g,13,6,4,2);
    }
    g.restore();
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
    } else if (key === 'orrin') {
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
    } else {
      const shape = {
        kestrel: { cloak:'#21394b', mask:'#94cee1', shoulders:[57,285], head:[[126,84],[168,63],[197,47],[230,70],[230,103],[216,135],[155,134]], weapon:[264,113,3] },
        veyra: { cloak:'#3f2020', mask:'#af6f59', shoulders:[64,282], head:[[130,91],[151,72],[189,49],[221,65],[240,91],[226,123],[194,144],[147,132]], weapon:[260,114,2.7] },
        neris: { cloak:'#4d3c26', mask:'#e7be7d', shoulders:[76,286], head:[[132,105],[146,71],[176,45],[205,65],[226,100],[214,133],[186,151],[153,136]], weapon:[268,123,2.8] },
        cairn: { cloak:'#523529', mask:'#b98c74', shoulders:[57,302], head:[[133,107],[132,77],[151,58],[201,54],[227,74],[231,115],[211,141],[160,141]], weapon:[269,113,2.9] },
        ecarg: { cloak:'#2e355e', mask:'#d7b9a0', shoulders:[88,284], head:[[128,110],[139,76],[160,58],[185,62],[211,42],[206,78],[225,104],[208,140],[167,143]], weapon:[255,150,2.7] }
      }[key];
      const [left,right] = shape.shoulders;
      poly(g,[[left-14,238],[left,166],[143,134],[209,134],[right,175],[right+16,238]],shape.cloak,color,2.5);
      poly(g,[[left,168],[138,143],[178,169],[221,145],[right,178],[216,229],[157,220]],'#1b2829',color+'a0',2);
      poly(g,shape.head,shape.cloak,color,2);
      poly(g,[[152,99],[176,83],[213,101],[204,123],[183,138],[160,124]],shape.mask,'#212829',2);
      line(g,[[155,108],[175,112],[202,106]],'#292527',6);
      line(g,[[159,107],[169,108],[178,109],[198,105]],color,2.8);
      glow(g,shape.weapon[0]+10,shape.weapon[1]-20,45,color+'80');
      weapon(g,key,...shape.weapon,color);
      for (const [x,y] of [[140,170],[169,183],[202,174]]) ellipse(g,x,y,4,3,color);
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
      for (const [x, y, r] of [[110,450,105],[520,450,115],[DUEL_MAP.innerX,330,77],[DUEL_MAP.outerX,330,77]]) {
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
  function teamTerrain() {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH / 2;
    canvas.height = TEAM_MAP.height / 2;
    const g = canvas.getContext('2d');
    g.scale(.5, .5);
    g.fillStyle = '#202f28';
    g.fillRect(0, 0, WIDTH, TEAM_MAP.height);
    g.lineJoin = 'round';
    const random = seeded(941);
    for (let i = 0; i < 2050; i++) {
      const x = random() * WIDTH, y = random() * TEAM_MAP.height;
      const radius = 12 + random() * 45;
      ellipse(g, x + 6, y + 14, radius, radius * .66, '#121f209e');
      ellipse(g, x, y, radius, radius * .79, random() > .4 ? '#2b4034' : '#304537');
    }
    const river = [[-100,200],[1050,620],[1860,1380],[2600,2100],[3420,2800],[4250,3590],[5300,4020]];
    line(g, river, '#263e39', 318);
    line(g, river, '#35585c', 254);
    line(g, river, '#4c7277', 3);
    for (const path of TEAM_MAP.lanes) {
      line(g, path, '#121f20', 176);
      line(g, path, '#626554', 150);
      line(g, path, '#4e5447', 122);
      line(g, path, '#aaa38a45', 2);
    }
    TEAM_MAP.fountains.forEach(([x,y], side) => {
      ellipse(g, x, y, 300, 260, '#18282ceb', COLORS[side] + '65', 6);
      ellipse(g, x, y, 205, 165, '#294249aa', '#8ea59799', 3);
    });
    return canvas;
  }
  class Renderer {
    constructor(canvas, minimap) {
      this.canvas = canvas;
      this.mini = minimap;
      this.g = canvas.getContext('2d', { alpha: false });
      this.miniContext = minimap.getContext('2d');
      this.map = null;
      this.teamMap = null;
      this.height = HEIGHT;
      this.vignette = null;
      this.buildingSprites = new Map();
      this.creepSprites = new Map();
      this.cam = 0;
      this.camY = 0;
      this.focus = null;
      this.scale = 1;
      this.quality = 'auto';
      this.auto = 1;
      this.measure = null;
      this.minimapElapsed = Infinity;
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
        this.vignette = null;
      }
      this.scale = h / (this.focus ? FREE_VIEW_HEIGHT : HEIGHT);
    }
    title() {
      this.resize();
      if (!this.dirty) return;
      titleScene(this.g, this.canvas.width, this.canvas.height);
      this.dirty = false;
    }
    toWorld(x, y) {
      return { x: this.cam + x * this.canvas.width / this.canvas.clientWidth / this.scale,
        y: this.camY + y * this.canvas.height / this.canvas.clientHeight / this.scale };
    }
    viewCenter() {
      return { x: this.cam + this.canvas.width / (2 * this.scale),
        y: this.camY + this.canvas.height / (2 * this.scale) };
    }
    get freeWorldPerPixel() {
      return FREE_VIEW_HEIGHT / Math.max(1, this.canvas.clientHeight);
    }
    focusAt(x, y) {
      const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
      const halfWidth = Math.min(WIDTH, FREE_VIEW_HEIGHT * aspect) / 2;
      const halfHeight = FREE_VIEW_HEIGHT / 2;
      this.focus = { x: clamp(x, halfWidth, WIDTH - halfWidth), y: clamp(y, halfHeight, this.height - halfHeight) };
    }
    camera(hero) {
      const view = this.canvas.width / this.scale;
      const followX = hero.x + (hero.team ? -1 : 1) * Math.min(200, view * .18);
      return clamp((this.focus?.x ?? followX) - view / 2, 0, Math.max(0, WIDTH - view));
    }
    frame(s, team, now, mark, dt, pointer, selectedId, spell) {
      this.resize();
      const g = this.g, w = this.canvas.width, h = this.canvas.height;
      if (!w || !h) return;
      this.height = s.teamMatch ? TEAM_MAP.height : HEIGHT;
      const map = s.teamMatch ? (this.teamMap ||= teamTerrain()) : (this.map ||= terrain());
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
      const player = s.heroes[team];
      const side = player.team;
      this.cam = this.camera(player);
      const viewWidth = w / this.scale, viewHeight = h / this.scale;
      this.camY = clamp((this.focus?.y ?? player.y) - viewHeight / 2, 0, this.height - viewHeight);
      this.displayed = s;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = '#142529'; g.fillRect(0, 0, w, h);
      g.setTransform(this.scale, 0, 0, this.scale, -this.cam * this.scale, -this.camY * this.scale);
      const crop = map.width / WIDTH;
      const drawWidth = Math.min(viewWidth, WIDTH - this.cam);
      g.drawImage(map, this.cam * crop, this.camY * crop, drawWidth * crop, viewHeight * crop,
        this.cam, this.camY, drawWidth, viewHeight);
      const left = this.cam - 175, right = this.cam + viewWidth + 175;
      const top = this.camY - 175, bottom = this.camY + viewHeight + 175;
      const visible = u => u.x >= left && u.x <= right && u.y >= top && u.y <= bottom;
      const inView = (x, y, radius) => x + radius >= this.cam && x - radius <= this.cam + viewWidth &&
        y + radius >= this.camY && y - radius <= this.camY + viewHeight;
      const fighters = [];
      for (const [id, team, kind, x, y, hp, maxHp, attack, r, facing, flags] of s.creeps) {
        if (hp <= 0 || x < left || x > right || y < top || y > bottom) continue;
        fighters.push({ id, type:'creep', team, kind, x, y, hp, maxHp, attack, r:r ?? CREEPS[kind].r, facing, flags });
      }
      for (const hero of s.heroes) if (hero.hp > 0 && visible(hero)) fighters.push(hero);
      for (const { brands, team } of s.heroes) for (const brand of brands || []) {
        if (brand.until <= now || !inView(brand.x, brand.y, 48)) continue;
        const {x,y} = brand, glow = 26 + Math.sin(now * 8) * 3;
        ellipse(g,x,y,glow,glow*.66,'#562319bd',COLORS[team],2);
        poly(g,[[x-17,y],[x,y-14],[x+17,y],[x,y+14]],'#ad462f','#ffb36c',2);
        line(g,[[x-9,y+4],[x+3,y-18],[x+9,y-3]],'#fff0c0',2.6);
      }
      for (const b of s.buildings) {
        if (b.hp <= 0 || !b.range) continue;
        const reach = b.range + player.r;
        if (b.team !== side && inView(b.x, b.y, reach)) {
          g.setLineDash([11, 9]);
          ellipse(g, b.x, b.y, reach, reach, null, '#ff636eaa', 2);
          g.setLineDash([]);
        }
        if (b.target) {
          let target = fighters.find(u => u.id === b.target);
          if (!target && visible(b)) {
            target = s.heroes.find(u => u.id === b.target && u.hp > 0);
            if (!target) {
              const row = s.creeps.find(c => c[0] === b.target && c[5] > 0);
              if (row) target = { x:row[3], y:row[4] };
            }
          }
          if (target) {
            const hitsPlayer = b.target === player.id;
            line(g, [[b.x, b.y-79], [target.x, target.y]], hitsPlayer ? '#ff939ac4' : COLORS[b.team] + '5a', hitsPlayer ? 2.4 : 1.4);
          }
        }
      }
      if (player.hp > 0) {
        const reach = HEROES[player.hero].range + 26;
        ellipse(g, player.x, player.y, reach, reach, null, '#ffffff12', 2);
        if (player.hero === 'cairn') {
          g.save();
          g.translate(player.x, player.y);
          g.rotate(player.facing);
          poly(g, [[47, 0], [34, -7], [34, 7]], '#ffb67e', '#2a1911', 2);
          g.restore();
        }
      }
      for (const b of s.buildings) if (visible(b)) this.building(g, b, side);
      for (const t of s.training ? [] : [0, 1]) {
        const [x,y] = s.teamMatch ? TEAM_MAP.fountains[t] : [t ? 5090 : 110, 450];
        if (!visible({x,y})) continue;
        const color = COLORS[t];
        if (t !== side) {
          g.setLineDash([8, 12]);
          ellipse(g, x, y, 420, 420, null, color + '76', 2.5);
          g.setLineDash([]);
        }
        ellipse(g, x, y, 72, 41, '#152b31', color + '9e', 3);
        ellipse(g, x, y, 58, 30, '#2c5158', color + '77', 2);
        const pulse = 14 + (now * 100 % 30);
        ellipse(g, x, y-3, pulse, pulse * .59, null, color + '90', 2);
        this.crystal(g, x, y-12, 31, color);
      }
      if (s.orb && visible(s.orb)) {
        const { x, y, kind } = s.orb, color = ORBS[kind], u = y - 11 + Math.sin(now * 4) * 6;
        glow(g, x, u, 53, color + '92');
        this.crystal(g, x, u, 21, color);
        this.label(g, kind.toUpperCase(), x, y + 43, 13, color);
      }
      for (const [, side, rad, x, y, strike, duration, hero, ultimate, style, ability, wall] of s.areas) {
        if (!inView(x, y, rad + 150)) continue;
        if (wall) {
          this.iceWall(g, x, y, rad, wall, now);
          continue;
        }
        const color = style === 'meteor' ? '#ff9d56' : HEROES[hero]?.color || COLORS[side];
        const progress = clamp(1 - (strike - now) / (duration || 1), 0, 1);
        ellipse(g, x, y, rad, rad, color + '16', color + '9d', ultimate ? 3.5 : 2);
        this.groundSpell(g, x, y, rad, hero, ability, color, progress, false);
        if (style === 'meteor') this.meteor(g, x, y, 1, 0, now, (1 - progress) ** 2 * 240);
      }
      const casts = new Map();
      for (const e of s.effects) {
        const age = now - e.time;
        if (e.kind === 'cast' && age >= 0 && age < .38) casts.set(e.caster, e);
      }
      fighters.sort((a, b) => a.y - b.y);
      const selected = selectedId != null && (fighters.find(u => u.id === selectedId) ||
        s.buildings.find(u => u.id === selectedId && u.hp > 0 && visible(u)));
      if (selected) ellipse(g, selected.x, selected.y+4, selected.r+9, selected.r*.64+7, null, '#f8d28a', 3);
      for (const u of fighters) {
        if (u.dummy) this.dummy(g, u, now);
        else if (u.type === 'hero') this.hero(g, u, side, now, casts.get(u.id));
        else this.creep(g, u);
      }
      for (const u of fighters) if (u.type === 'creep') {
        const hpColor = u.team !== side ? '#ff6464' : u.flags & Lanebreak.CREEP_FLAGS.deniable ? '#c9a0ff' : '#6fd37a';
        this.bar(g,u,u.y-u.r-11,34,hpColor,5);
      }
      for (const [, side, kind, x, y, source, dx, dy, width, trail, ability] of s.projectiles) {
        if (!inView(x, y, 220)) continue;
        const color = source === 'building' ? '#fff0b0' : HEROES[source]?.color || COLORS[side];
        if (trail === 'wind') {
          ellipse(g, x, y + 3, 30, 12, '#101f3273');
          for (let i = 0; i < 4; i++) {
            const spin = Math.sin(now * 31 + i * 1.5) * (5 + i * 2);
            ellipse(g, x + spin, y - 8 - i * 12, 13 + i * 6, 6 + i * 2, '#8dedee26', '#b7feefd9', 2.5);
          }
        } else if (trail === 'meteor') {
          this.meteor(g, x, y, dx, dy, now);
        } else if (trail === 'shockwave') {
          g.save();
          g.translate(x, y);
          g.rotate(Math.atan2(dy, dx));
          g.beginPath();
          g.ellipse(-14, 0, 42, width, 0, -1.25, 1.25);
          g.strokeStyle = '#bd8df18f'; g.lineWidth = 13; g.stroke();
          g.strokeStyle = '#eee1ff'; g.lineWidth = 3; g.stroke();
          g.restore();
        } else if (kind === 'bolt') {
          this.spellBolt(g, x, y, dx, dy, width, source, ability, color, now);
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
        if (e.kind === 'fountain' && age >= 0 && age < .17 && (inView(e.x,e.y,0) || inView(e.toX,e.toY,30))) {
          g.globalAlpha = 1 - age / .17;
          line(g, [[e.x,e.y-29],[e.toX,e.toY-14]], COLORS[e.team], 20);
          line(g, [[e.x,e.y-29],[e.toX,e.toY-14]], '#fff6d9', 5);
          ellipse(g, e.toX, e.toY-14, 12 + age * 110, 8 + age * 70, null, '#fff6d9', 3);
          g.globalAlpha = 1;
          continue;
        }
        if (age < 0 || age > 1.08 || !inView(e.x, e.y, (e.radius || 65) + 100)) continue;
        if (e.kind === 'sweep' && age < .24) {
          g.globalAlpha = 1 - age / .24;
          line(g,[[e.fromX,e.fromY-12],[e.x,e.y-12]],'#ff754578',10);
          poly(g,[[e.x-33,e.y+18],[e.x-1,e.y-21],[e.x+31,e.y-26],[e.x+9,e.y-12]],'#ff8d56','#fff1be',2);
          g.globalAlpha = 1;
          continue;
        }
        if (e.kind === 'item' && age < .4) {
          const color = ITEMS[e.item].color;
          const radius = 18 + age * 100;
          g.globalAlpha = 1 - age / .4;
          ellipse(g, e.x, e.y - 12, radius, radius * .72, null, color, 3);
          if (e.item === 'gravemark' || e.item === 'faultline') {
            line(g, [[e.x - radius, e.y + 7], [e.x, e.y - 24], [e.x + radius, e.y + 7]], '#ffe6b7', 3);
          }
          g.globalAlpha = 1;
          continue;
        }
        if (e.kind === 'burst' || e.kind === 'impact' || e.kind === 'cast') {
          this.spellEffect(g, e, age);
          continue;
        }
        g.globalAlpha = clamp((1 - age) * 1.3, 0, 1);
        if (['gold','hit','level'].includes(e.kind)) {
          this.label(g, e.text, e.x + (e.id % 3 - 1) * 13, e.y - 31 - age * 30,
            e.kind === 'hit' ? 15 : 19, e.text === 'Denied' ? '#c9a0ff' : e.kind === 'hit' ? '#f1ded0' : '#ffd48b');
        }
        g.globalAlpha = 1;
      }
      if (pointer) {
        const at = this.toWorld(pointer.x, pointer.y);
        if (spell && (spell.kind === 'unit' || (spell.target && spell.target !== 'point'))) {
          const color = spell.target === 'ally' ? '#9aefbc' : '#ffe0a2';
          ellipse(g, player.x, player.y, spell.range, spell.range, null, color + '3d', 2);
          const target = Lanebreak.pickSpellTarget(s, player, spell, at);
          if (target) ellipse(g, target.x, target.y, target.r + 9, target.r + 9, color + '29', color, 3);
        } else if (spell) this.castPreview(g, player, spell, at, Boolean(s.training));
        else {
          const target = Lanebreak.pickTarget(s, team, at);
          if (target) ellipse(g, target.x, target.y, target.r + 7, target.r + 7, null, target.team === side ? '#c9a0ff' : '#ff6b6b', 2.5);
        }
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      this.vignette ||= gradient(g, 0, 0, 0, h, [[0,'#080e15c0'],[.23,'#080e1500'],[.66,'#080e1500'],[1,'#080e15a9']]);
      g.fillStyle = this.vignette;
      g.fillRect(0, 0, w, h);
      this.minimapElapsed += dt;
      if (this.minimapElapsed >= 1 / 15 - .001) {
        this.minimap(s, side, viewWidth, viewHeight);
        this.minimapElapsed = 0;
      }
    }
    groundSpell(g, x, y, radius, hero, ability, color, progress, impact) {
      g.save();
      g.translate(x, y);
      g.scale(radius / 100, radius / 100);
      const ink = impact ? '#fff1cf' : color;
      const travel = 27 + progress * 67;
      switch (hero) {
        case 'vesper':
          if (ability === 'Piercing Shot') {
            for (const angle of [-.55, 0, .55]) {
              line(g, [[-travel*.23,0],[Math.cos(angle)*travel,Math.sin(angle)*travel]], ink, 2.5);
            }
          } else if (ability === 'Arrow Storm') {
            for (let i = 0; i < 7; i++) {
              const px = (i * 47 % 151) - 75, py = (i * 59 % 110) - 50;
              const drop = impact ? -10 * progress : -74 * (1 - progress);
              line(g, [[px - 22, py + drop - 30], [px, py + drop]], ink, 2.2);
              poly(g, [[px, py + drop], [px - 2, py + drop - 10], [px - 8, py + drop - 5]], ink);
            }
          } else {
            g.rotate(Math.PI / 4);
            const span = impact ? 60 : 34 + 26 * progress;
            for (const offset of [-36, 0, 36]) {
              line(g, [[-span, offset], [span, offset]], ink, 1.8);
              line(g, [[offset, -span], [offset, span]], ink, 1.8);
            }
          }
          break;
        case 'brakk':
          for (let i = 0; i < 6; i++) {
            g.rotate(Math.PI / 3);
            line(g, [[12, 0], [travel * .48, -9], [travel * .67, 6], [travel, -5]], '#301d1c', 6);
            line(g, [[12, 0], [travel * .48, -9], [travel * .67, 6], [travel, -5]], ink, 2.4);
          }
          break;
        case 'orrin': {
          const r = ability === 'Collapse' && !impact ? 93 - progress * 71 : travel;
          g.rotate(progress * Math.PI / 3);
          poly(g, [[0,-r],[r,0],[0,r],[-r,0]], '#37235955', ink, 1.8);
          poly(g, [[0,-r*.48],[r*.48,0],[0,r*.48],[-r*.48,0]], color + '7d', '#ded7ff', 1.4);
          if (ability === 'Starfall' && !impact) {
            const fall = -112 * (1 - progress);
            poly(g, [[0,fall-23],[9,fall],[0,fall+16],[-9,fall]], '#fcf0ff', color, 3);
            line(g, [[0,fall-70],[0,fall-23]], color, 4);
          }
          break;
        }
        case 'kestrel':
          ellipse(g, 0, 0, travel, travel*.54, '#65e6ff24', color, 2.6);
          for (let i = 0; i < 4; i++) {
            g.rotate(Math.PI / 2);
            line(g, [[-10,-8],[travel*.45,-20],[travel*.44,8],[travel,0]], '#d8faff', 2.5);
          }
          break;
        case 'veyra': {
          const mantle = ability === 'Kiln Mantle';
          ellipse(g,0,0,travel,travel*(mantle ? .58 : .76), '#c1432938', '#ff925b', 2.3);
          for (let i = 0; i < 5; i++) {
            g.rotate(Math.PI * 2 / 5);
            poly(g,[[travel*.68,3],[travel*.86,-12],[travel+11,-17],[travel-1,2]],color,'#ffd18d',1.5);
          }
          break;
        }
        case 'neris':
          if (ability === 'Emberfall') {
            for (let i = 0; i < 6; i++) {
              g.rotate(Math.PI / 3);
              poly(g, [[17,5],[travel*.82,-9],[travel,0],[travel*.62,7]], '#ff7c3a99', '#ffcd7c', 1.6);
            }
          } else if (ability === 'Sky Needle' || ability === 'Pin Stitch') {
            const h = impact ? 55 - progress * 24 : 140 * (1 - progress);
            poly(g, [[-8,-h-19],[9,-h-19],[3,9],[0,18]], '#ffecc4', color, 1.8);
            line(g, [[-travel*.56,-12],[travel*.56,12]], color, 2.5);
          } else if (ability === 'Crosswind') {
            ellipse(g, 0, -15 - progress * 26, travel * .8, travel * .29, '#aefef834', '#b7feef', 4);
            ellipse(g, 0, -38 - progress * 26, travel, travel * .41, null, '#d1f9fd', 2);
          } else if (ability === 'Spool Break') {
            for (const offset of [-20, 16]) {
              line(g, [[-travel,-offset],[0,offset],[travel,-offset]], '#dfc5fa', 4);
            }
          } else {
            const r = ability === 'Hollow Seam' && !impact ? 87 - progress * 50 : travel;
            line(g, [[-r,0],[r*.56,-r*.59],[-r*.26,r*.72],[-r*.26,-r*.72],[r*.56,r*.59],[-r,0]], ink, 2.2);
          }
          break;
        case 'cairn': {
          const jets = CAIRN_JETS[ability] || 1;
          ellipse(g, 0, 0, travel, travel * .48, '#441d22a6', '#ff8a57', 2.4);
          for (let i = 0; i < jets; i++) {
            const px = (i - (jets - 1) / 2) * Math.min(45, 140 / jets);
            const height = impact ? (67 + 27 * progress) - 13 * (i % 2) : 8 + progress * 21;
            poly(g, [[px-16,5],[px-11,-height*.57],[px+5,-height],[px+15,-height*.3],[px+18,8]], '#f25b36bb', '#ffae69', 1.8);
            poly(g, [[px-6,4],[px+1,-height*.68],[px+8,2]], '#ffdc8e');
          }
          break;
        }
        case 'ecarg':
          for (const band of [-2, -1, 0, 1, 2]) {
            g.beginPath();
            g.moveTo(-travel, band * 12);
            g.quadraticCurveTo(0, band * 12 - 24 + progress * 48, travel, band * 12);
            g.strokeStyle = band === 0 ? '#e2f1ff' : color;
            g.lineWidth = band === 0 ? 3 : 1.7;
            g.stroke();
          }
          for (const note of ability === 'Grand Cadence' ? [-1, 0, 1] : [-.55, .55]) {
            const px = note * travel, py = -8 + Math.sin(note * 6 + progress * 3) * 19;
            ellipse(g, px, py, 6, 4, '#eff6ff');
            line(g, [[px+5,py],[px+5,py-20],[px+12,py-15]], '#eff6ff', 2);
          }
          break;
        default:
          ellipse(g, 0, 0, travel, travel, color + '20', ink, 2.5);
      }
      g.restore();
    }
    spellEffect(g, e, age) {
      const { x, y, hero, ability } = e;
      const color = e.spell === 'meteor' ? '#ff9d56' : HEROES[hero]?.color || COLORS[e.team] || '#fff0b0';
      const duration = e.kind === 'cast' ? .29 : e.kind === 'impact' ? .34 : .55;
      if (age >= duration) return;
      // For aimed spells the pose and the projectile or destination show the cast.
      if (e.kind === 'cast' && e.spell !== 'buff' && e.spell !== 'veil') return;
      const progress = age / duration;
      g.globalAlpha = (1 - progress) ** .72;
      const radius = e.radius || (e.ultimate ? 70 : 48);
      if (e.kind === 'impact' && ability !== 'Pin Stitch') {
        ellipse(g, x, y - 10, radius * (.55 + progress * .45), radius * (.4 + progress * .45), null, color, 3);
      }
      this.groundSpell(g, x, y, radius, hero, ability, e.accent ? '#e8f4ff' : color, progress, true);
      g.globalAlpha = 1;
    }
    spellBolt(g, x, y, dx, dy, width, hero, ability, color, now) {
      g.save();
      g.translate(x, y);
      g.rotate(Math.atan2(dy, dx));
      switch (hero) {
        case 'vesper':
          line(g, [[-125,0],[-18,0]], '#9cefd377', 4);
          line(g, [[-57,0],[3,0]], '#edfff0', 3);
          poly(g, [[7,0],[-10,-7],[-10,7]], '#e4fff1');
          line(g, [[-55,-8],[-45,0],[-55,8]], color, 2.4);
          break;
        case 'orrin':
          ellipse(g, -24, 0, 41, 9, '#6c43af70');
          ellipse(g, 0, 0, 13, 13, '#251641', '#dfc8ff', 3);
          g.rotate(now * 10);
          ellipse(g, 0, 0, 24, 9, null, color, 3);
          break;
        case 'ecarg':
          for (let i = 0; i < 3; i++) {
            const offset = -14 - i * 26;
            const spread = width * (.62 + i * .21);
            g.beginPath();
            g.ellipse(offset, 0, 26, spread, 0, -1.16, 1.16);
            g.strokeStyle = i === 0 ? '#edf4ff' : color + 'a4';
            g.lineWidth = i === 0 ? 3.5 : 2.5;
            g.stroke();
          }
          break;
        default:
          line(g, [[-70,0],[0,0]], color + '78', width * .5);
          line(g, [[-30,0],[0,0]], '#f5f1ee', 4);
      }
      g.restore();
    }
    castPreview(g, hero, spell, at, freeMana) {
      let end, stops;
      if (spell.kind === 'brandReturn') {
        let distance = Infinity;
        const brands = hero.brands || [];
        for (const brand of brands) {
          const d = Math.hypot(brand.x - at.x, brand.y - at.y);
          if (d < distance) { end = brand; distance = d; }
        }
        if (!end) return;
        const distanceFromHero = b => Math.hypot(b.x - hero.x, b.y - hero.y);
        stops = brands.filter(b => b !== end).sort((a, b) => distanceFromHero(a) - distanceFromHero(b));
      } else {
        end = Lanebreak.castPoint(hero, spell, at.x, at.y, this.height);
      }
      const cost = !freeMana && spell.distanceMana ? spell.mana + Math.hypot(end.x - hero.x, end.y - hero.y) * spell.distanceMana : 0;
      const color = cost > hero.mana ? '#ff8c8c' : '#ffe0a2';
      if (spell.target === 'point') ellipse(g, hero.x, hero.y, spell.range, spell.range, null, color + '45', 2);
      g.save();
      g.setLineDash([10, 7]);
      line(g, [[hero.x, hero.y], ...(stops || []).map(b => [b.x,b.y]), [end.x, end.y]], color + 'b0', 2);
      if (spell.roll) {
        const angle = at.x === hero.x && at.y === hero.y ? hero.facing : Math.atan2(at.y - hero.y, at.x - hero.x);
        line(g, [[end.x, end.y], [end.x + Math.cos(angle) * spell.roll, end.y + Math.sin(angle) * spell.roll]], '#ff9d56b0', 2);
      }
      g.setLineDash([]);
      if (spell.kind !== 'bolt' && spell.radius) {
        ellipse(g, end.x, end.y, spell.radius, spell.radius, color + '18', color + 'd0', 2.5);
      }
      ellipse(g, end.x, end.y, 11, 11, null, color, 2);
      line(g, [[end.x - 15, end.y], [end.x + 15, end.y]], color, 1.5);
      line(g, [[end.x, end.y - 15], [end.x, end.y + 15]], color, 1.5);
      if (cost) this.label(g, Math.ceil(cost) + ' mana', end.x, end.y - 24, 16, color);
      g.restore();
    }
    meteor(g, x, y, dx, dy, now, altitude = 0) {
      ellipse(g, x, y, 44, 23, '#36131c80', '#e97c4b88', 2);
      const centerY = y - altitude - 25;
      if (!altitude) line(g, [[x - dx * 110, y - dy * 110], [x, y]], '#fb613179', 34);
      glow(g, x, centerY, 63, '#ff843a9a');
      g.save();
      g.translate(x, centerY);
      g.rotate(now * 6);
      poly(g, [[-41,-3],[-26,-32],[5,-41],[34,-23],[43,8],[24,33],[-13,41],[-37,24]], '#662f37', '#ffab58', 4);
      line(g, [[-29,-21],[-11,-8],[-16,9],[1,26]], '#ff984d', 5);
      line(g, [[24,-27],[14,-11],[25,2],[22,21]], '#ffcd73', 4);
      g.restore();
    }
    iceWall(g, x, y, length, [dx, dy, depth, expires], now) {
      g.save();
      g.globalAlpha = clamp((expires - now) * 2, .22, 1);
      g.translate(x, y);
      g.rotate(Math.atan2(dy, dx));
      g.fillStyle = '#82def254';
      g.fillRect(-depth, -length, depth * 2, length * 2);
      g.strokeStyle = '#bcf4fa9e';
      g.lineWidth = 2.5;
      g.strokeRect(-depth, -length, depth * 2, length * 2);
      for (let at = -length + 20, i = 0; at < length; at += 53, i++) {
        const lean = i % 2 ? 1 : -1;
        poly(g, [[-18,at-20],[19*lean,at-18],[37*lean,at+4],[18,at+22],[-20,at+19]],
          i % 2 ? '#77badccf' : '#5687bade', '#d6f9ff', 2);
        line(g, [[lean*37,at+4],[0,at+1],[-20,at+19]], '#d6f9ffad', 2);
      }
      g.restore();
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
      const {x,y,r} = b, core = b.kind === 'core', alive = b.hp > 0;
      const key = alive ? `${r}:${b.team}:${core}:${!core && b.attack}` : 'ruin:' + r;
      let sprite = this.buildingSprites.get(key);
      const bounds = BUILDING_SPRITE;
      if (!sprite) {
        sprite = makeSprite(bounds, ctx => this.buildingBody(ctx, r, COLORS[b.team], core, alive, b.attack));
        this.buildingSprites.set(key, sprite);
      }
      g.drawImage(sprite, x - bounds.left, y - bounds.top, bounds.width, bounds.height);
      if (!alive) return;
      if (b.fortified) {
        ellipse(g,x,y-25,r+16,r+42,'#ffd87929','#ffe29d',3);
        ellipse(g,x,y+3,r+16,(r+16)*.55,null,'#ffd8799c',2);
      } else if (b.protected) {
        g.setLineDash([5, 5]);
        ellipse(g,x,y+3,r+10,r+10,null,'#e9e5cd9c',2);
        g.setLineDash([]);
      }
      this.bar(g,b,y - (core ? 102 : 109),core ? 130 : 86,b.team === team ? '#58d86a' : '#ff5a5a',8);
    }
    buildingBody(g, r, color, core, alive, attack) {
      const x = 0, y = 0;
      if (!alive) {
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
        const col = attack ? color : color + 'c5';
        poly(g, [[x-r*.53,y],[x-r*.4,y-62],[x+r*.4,y-62],[x+r*.53,y],[x+r*.25,y+12],[x-r*.25,y+12]], '#404d4a', '#18272a', 3);
        poly(g, [[x,y+12],[x,y-64],[x+r*.4,y-62],[x+r*.53,y],[x+r*.25,y+12]], '#2a3b3d');
        poly(g, [[x-r*.65,y-59],[x-r*.50,y-83],[x+r*.50,y-83],[x+r*.65,y-58],[x+r*.29,y-49],[x-r*.3,y-49]], '#63716a', '#27393a', 3);
        this.crystal(g,x,y-80,17,col);
        line(g, [[x-8,y-37],[x,y-28],[x+8,y-37]], col, 3);
      }
    }
    cyclone(g, u, now) {
      const time = u.cycloneUntil - now;
      if (!(time > 0)) return;
      for (let i = 0; i < 3; i++) {
        const sway = Math.sin(now * 24 + i * 2) * 7;
        ellipse(g, u.x + sway, u.y - 12 - i * 13, 23 + i * 7, 8 + i, null, '#bbecf7c4', 2.5);
      }
      this.label(g, time.toFixed(1) + 's', u.x + 54, u.y - 30, 15, '#d3f8ff');
    }
    dummy(g, u, now) {
      const { x } = u, y = u.y - (u.lifted ? 22 : 0);
      ellipse(g,x,u.y+7,37,15,'#171a18a0');
      line(g,[[x-24,y+9],[x+24,y+9]],'#956b49',7);
      line(g,[[x,y+9],[x,y-43]],'#b08457',9);
      line(g,[[x-32,y-28],[x+32,y-28]],'#b08457',6);
      ellipse(g,x,y-15,23,21,'#785438','#efd194',3);
      ellipse(g,x,y-15,14,13,null,'#d2775b',3);
      ellipse(g,x,y-15,6,6,'#ead29d');
      this.label(g,'Training dummy · ∞',x,y-61,16,'#f6d9a1');
      if (u.stitched) ellipse(g,x,y-15,29,27,null,'#d5bfea',2);
      if (u.burning) ellipse(g,x,y-15,26,25,null,'#fa8a55',3);
      if (u.resonating) ellipse(g,x,y-15,32,29,null,HEROES.ecarg.color,3);
      if (u.stunned) this.label(g,'✦ ✦',x,y-44,14,'#fff29a');
      this.cyclone(g, u, now);
    }
    hero(g, u, team, now, cast) {
      const {x} = u, y = u.y - (u.lifted ? 22 : 0), color = COLORS[u.team], armor = HEROES[u.hero].color;
      ellipse(g,x+7,u.y+10,30,16,'#102125a5');
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
      const lunge = u.attack && HEROES[u.hero].range < 200 ? 8 : 0;
      const progress = cast ? clamp((now - cast.time) / .38, 0, 1) : 1;
      const pose = CAST_POSES[u.hero];
      const effort = cast ? Math.sin(Math.PI * progress) : 0;
      if (cast?.spell === 'dash') {
        g.globalAlpha = 1 - progress;
        if (u.hero === 'kestrel') {
          const dx = x - cast.x, dy = y - cast.y;
          const trail = [[cast.x,cast.y], [cast.x+dx*.33,cast.y+dy*.33-12], [cast.x+dx*.63,cast.y+dy*.63+10], [x,y]];
          line(g, trail, '#65e6ff95', 16);
          line(g, trail, '#e6fdff', 3);
        } else if (u.hero === 'veyra') {
          line(g, [[cast.x,cast.y-8],[x,y-8]], '#f75f3f8c', 26);
          line(g, [[cast.x,cast.y-8],[x,y-8]], '#ffc277', 5);
        } else {
          line(g, [[cast.x,cast.y+7],[x,y+7]], '#60433285', 26);
          for (const fraction of [.35, .65, .9]) {
            ellipse(g, cast.x+(x-cast.x)*fraction, cast.y+(y-cast.y)*fraction+7, 13, 8, '#cda4758c');
          }
        }
        g.globalAlpha = 1;
      }
      g.save();
      if (u.veiled) g.globalAlpha = .44;
      const step = lunge + pose.step * effort;
      g.translate(x + Math.cos(facing)*step,y + Math.sin(facing)*step - pose.lift * effort);
      g.scale(Math.cos(facing) < 0 ? -1 : 1,1);
      g.rotate(pose.lean * effort);
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
      } else if (u.hero === 'orrin') {
        line(g,[[x+24,y+16],[x+27,y-35]],'#9b83c4',3);
        this.crystal(g,x+27,y-38,11,'#b494f7');
      } else {
        const bowStroke = cast && u.hero === 'ecarg' ? 15 * Math.sin(progress * 2 * Math.PI) * effort : 0;
        weapon(g,u.hero,x+23,y-9,.8,armor,bowStroke);
      }
      g.restore();
      if (u.marks?.length) {
        for (const [index, mark] of u.marks.entries()) {
          const angle = now * 2.5 + index * Math.PI * 2 / 3;
          weaveOrb(g, x + Math.cos(angle) * 39, y - 20 + Math.sin(angle) * 14, 6, mark);
        }
      }
      if (u.attack) ellipse(g,x,y,30,20,null,'#ead79488',2);
      if (u.stunned) this.label(g,'✦ ✦',x,y-77,17,'#fff29a');
      if (u.stitched) ellipse(g,x,y-19,33,30,null,'#d5bfea',2);
      if (u.burning) ellipse(g,x,y-19,30,28,null,'#fa8a55',3);
      if (u.resonating) ellipse(g,x,y-19,36,33,null,HEROES.ecarg.color,3);
      if (u.charged) ellipse(g,x,y+6,35,17,null,'#8ff5ff',2.5);
      if (u.spellBarrier) ellipse(g,x,y-14,39,37,'#80dcf916','#a5ebf7af',3);
      this.cyclone(g, u, now);
      if (u.disarmed) line(g,[[x-35,y-11],[x+35,y-11]],'#ffb29199',3);
      this.bar(g,u,y-55,74,u.team === team ? '#58d86a' : '#ff5a5a',8);
      this.bar(g,u,y-45,74,'#5a9bff',4,u.mana / u.maxMana);
      g.fillStyle = '#0008';
      for (let k = 250; k < u.maxHp; k += 250) g.fillRect(x-37+74*k/u.maxHp,y-55,1,8);
      this.label(g,String(u.level),x-47,y-46,14,'#ffe08a');
      this.label(g,u.name,x,y-62,14,'#f1f1dd');
    }
    creep(g, u) {
      const {x,y,r} = u, color = COLORS[u.team], flags = Lanebreak.CREEP_FLAGS;
      ellipse(g,x+4,y+6,r+3,r*.63,'#111e2385');
      const facing = u.facing ?? (u.team ? Math.PI : 0), lunge = u.kind === 'melee' && u.attack ? 5 : 0;
      const direction = Math.cos(facing) < 0 ? -1 : 1;
      const lift = u.flags & flags.lifted ? 16 : 0;
      const kind = u.flags & flags.sentry ? 'sentry' : u.kind;
      const key = `${kind}:${u.team}:${r}:${kind === 'sentry' ? 0 : direction}`;
      let sprite = this.creepSprites.get(key);
      const bounds = CREEP_SPRITE;
      if (!sprite) {
        sprite = makeSprite(bounds, ctx => this.creepBody(ctx, kind, color, r, direction));
        this.creepSprites.set(key, sprite);
      }
      g.drawImage(sprite, x + Math.cos(facing) * lunge - bounds.left,
        y + Math.sin(facing) * lunge - lift - bounds.top, bounds.width, bounds.height);
      if (u.attack) ellipse(g,x,y,15,8,null,color+'a0',1.4);
      if (u.flags & flags.stunned) this.label(g,'✦',x,y-r-17-lift,16,'#fff29a');
      if (u.flags & flags.rallied) ellipse(g,x,y,r+5,r+5,null,'#ffd95a',2);
    }
    creepBody(g, kind, color, r, direction) {
      const x = 0, y = 0;
      if (kind === 'sentry') {
        poly(g,[[x-16,y+8],[x-9,y-9],[x+9,y-9],[x+16,y+8]],'#3c3025',color,2);
        line(g,[[x,y+5],[x,y-20]],'#eac98b',2.5);
        this.crystal(g,x,y-16,9,'#f0c865');
      } else if (kind === 'siege') {
        poly(g,[[x-r,y-9],[x-r*.4,y-15],[x+r,y-10],[x+r,y+10],[x-r,y+10]],'#374d4c',color,2);
        ellipse(g,x-r*.64,y+7,7,7,'#18282b',color+'a9',1.4);
        ellipse(g,x+r*.61,y+7,7,7,'#18282b',color+'a9',1.4);
        line(g,[[x,y-13],[x+direction*24,y-16]],color,4);
      } else {
        poly(g,[[x-r,y+6],[x-r*.7,y-r*.52],[x+r*.61,y-r*.57],[x+r,y+4],[x+3,y+12]],'#243539',color,2);
        if (kind === 'ranged') this.crystal(g,x,y-8,9,color);
        else ellipse(g,x,y-8,8,8,color+'8e','#203236',1.5);
        line(g,[[x+direction*11,y-3],[x+direction*21,y+4]],'#e2d9b4',2.1);
      }
    }
    minimap(s, team, viewWidth, viewHeight) {
      const g = this.miniContext, w = this.mini.width, h = this.mini.height;
      const x = n => n / WIDTH * w, y = n => n / this.height * h;
      g.fillStyle = '#141c1e'; g.fillRect(0,0,w,h);
      if (s.teamMatch) {
        for (const path of TEAM_MAP.lanes) line(g, path.map(([px,py]) => [x(px),y(py)]), '#566552', 9);
        TEAM_MAP.fountains.forEach(([px,py], team) => ellipse(g, x(px), y(py), 10, 8, COLORS[team]));
      } else {
        g.fillStyle='#444331';g.fillRect(0,y(320),w,y(260));
        g.fillStyle='#315363'; g.fillRect(x(2510),0,x(180),h);
      }
      for (const b of s.buildings) if (b.hp > 0) {
        g.fillStyle = COLORS[b.team]; const r = b.kind === 'core' ? 7 : 4;
        g.fillRect(x(b.x)-r,y(b.y)-r,r*2,r*2);
      }
      for (const c of s.creeps) {
        g.fillStyle = COLORS[c[1]]+'b0'; g.fillRect(x(c[3])-2,y(c[4])-2,4,4);
      }
      for (const hero of s.heroes) if (hero.hp > 0) {
        const px = x(hero.x), py = y(hero.y);
        g.fillStyle = hero.dummy ? '#e9c181' : HEROES[hero.hero].color; g.fillRect(px-5,py-5,10,10);
        g.strokeStyle = COLORS[hero.team]; g.lineWidth = hero.team === team ? 3 : 2; g.strokeRect(px-6,py-6,12,12);
      }
      if (s.orb) ellipse(g,x(s.orb.x),y(s.orb.y),3.5,3.5,ORBS[s.orb.kind]);
      const viewTop = Math.max(1,y(this.camY));
      const viewBottom = Math.min(h-1,y(this.camY + viewHeight));
      g.lineWidth=1.7;g.strokeStyle='#e4e4ba9b';
      g.strokeRect(x(this.cam),viewTop,x(Math.min(viewWidth,WIDTH)),viewBottom-viewTop);
    }
  }
  globalThis.LanebreakPaint = { Renderer, portrait };
})();
