class GameScene extends Phaser.Scene {
  constructor() { super('GameScene'); }

  init(data) {
    this.levelIndex = (data && data.levelIndex) || 0;
    this.numPlayers = (data && data.players) || 1;
    this.difficulty = (data && data.difficulty) || 'normal';
    this.runTime = (data && data.runTime) || 0;   // 之前关卡累计用时（秒），用于最后评分
    this.mapKey = getMapKey(this, data && data.mapKey);   // 海底地图：热带 / 亚热带 / 北极
  }

  preload() {
    if (!this.cache.json.exists('levelsData')) {
      this.load.json('levelsData', 'levels.json');
    }
  }

  create() {
    generateTextures(this);
    this.levels = this.cache.json.get('levelsData').levels;
    const base = this.levels[this.levelIndex];
    const dm = DIFFICULTY_PRESETS[this.difficulty] || DIFFICULTY_PRESETS.normal;
    this.diffName = dm.name;
    this.cfg = {
      ...base,
      fishSpeed: [base.fishSpeed[0] * dm.speed, base.fishSpeed[1] * dm.speed],
      maxBigFishRatio: Math.min(0.9, base.maxBigFishRatio * dm.bigRatio),
      dashCooldown: base.dashCooldown * dm.cd,
      stealthCooldown: base.stealthCooldown * dm.cd,
      bigFishInterval: base.bigFishInterval * dm.interval
    };
    this.startWeight = 5;
    this.bigCap = Math.max(1, Math.round(this.cfg.fishCount * this.cfg.maxBigFishRatio));
    this.W = GAME_W;
    this.H = GAME_H;
    this.cameras.main.setZoom(HD_ZOOM).centerOn(GAME_W / 2, GAME_H / 2);   // 高清渲染：缓冲 1920x1080，逻辑仍是 960x540
    this.over = false;
    this.eatCount = 0;    // 本关吃掉的鱼数（语音按它报数）
    // 每过一关解锁一种新鱼：第1关只有1种，第20关20种
    this.speciesMax = Math.min(this.levelIndex + 1, MAX_SPECIES);
    this.bigNum = 0;      // 当前场上“能吃掉开局玩家”的鱼数量
    this.elapsed = 0;     // 本关已进行时间，用于逐步放鱼
    this.levelClock = 0;  // 本关耗时（秒），过关/失败时累加到 runTime

    drawSeaBackground(this, this.mapKey);
    createMapFX(this, this.mapKey);
    this.bubbles = createBubbles(this, 18);
    this.ambient = this.createAmbientFish();
    SeaAudio.init(this);
    SeaAudio.addHint(this);

    this.add.text(this.W / 2, 16, T('hudTop', {
      map: tx(MAPS[this.mapKey].name), level: T('level', { n: this.levelIndex + 1 }),
      diff: tx(this.diffName), target: this.cfg.targetWeight
    }), {
      fontSize: '20px', fontStyle: 'bold', color: '#cfe8ff',
      stroke: '#00253f', strokeThickness: 3
    }).setOrigin(0.5, 0);
    this.infoText = this.add.text(this.W / 2, 40, '', {
      fontSize: '13px', color: '#9fc6e8'
    }).setOrigin(0.5, 0);

    this.players = [];
    for (let i = 0; i < this.numPlayers; i++) this.players.push(this.createPlayer(i));

    // 开局全是小鱼，大鱼随时间一条条放出来（见 update / bigAllowed）
    this.fishes = [];
    for (let i = 0; i < this.cfg.fishCount; i++) this.fishes.push(this.spawnFish());

    this.createHud();
    this.createKeys();

    if (this.levelIndex > 0) this.showNewFishToast();
  }

  // 本关新登场的鱼种提示
  showNewFishToast() {
    const spec = FISH_SPECIES[this.speciesMax - 1];
    const c = this.W / 2, y = this.H * 0.3;
    const spr = this.add.sprite(c, y - 52, 'fish_' + (this.speciesMax - 1)).setScale(1.3 / FISH_TEX_SS);
    const txt = this.add.text(c, y + 34, T('newFish', { name: tx(spec.name) }), {
      fontSize: '30px', fontStyle: 'bold', color: '#ffe082',
      stroke: '#003355', strokeThickness: 6
    }).setOrigin(0.5);
    this.tweens.add({
      targets: [spr, txt], alpha: 0, y: `-=26`, delay: 1600, duration: 900,
      onComplete: () => { spr.destroy(); txt.destroy(); }
    });
  }

  createPlayer(i) {
    const x = this.numPlayers === 1 ? this.W / 2 : this.W * (i === 0 ? 0.3 : 0.7);
    const spr = this.add.sprite(0, 0, `player_p${i + 1}_open`);
    const txt = this.add.text(0, 34, '5', {
      fontSize: '20px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#003355', strokeThickness: 3
    }).setOrigin(0.5, 0);
    const c = this.add.container(x, this.H / 2, [spr, txt]);
    return {
      idx: i, c, spr, txt,
      weight: this.startWeight, radius: 20 + 5 * 1.3, alive: true,
      baseSpeed: 170,
      dashT: 0, dashCd: 0, stealthT: 0, stealthCd: 0,
      facing: 1, frame: true, animT: 0,
      prevDash: false, prevStealth: false
    };
  }

  createKeys() {
    const K = Phaser.Input.Keyboard.KeyCodes;
    const kb = this.input.keyboard;
    this.kb = [
      { up: kb.addKey(K.W), down: kb.addKey(K.S), left: kb.addKey(K.A), right: kb.addKey(K.D),
        dash: [kb.addKey(K.J)], stealth: [kb.addKey(K.K)] },
      { up: kb.addKey(K.UP), down: kb.addKey(K.DOWN), left: kb.addKey(K.LEFT), right: kb.addKey(K.RIGHT),
        dash: [kb.addKey(K.NUMPAD_ONE), kb.addKey(K.COMMA)],
        stealth: [kb.addKey(K.NUMPAD_TWO), kb.addKey(K.PERIOD)] }
    ];
  }

  readPad(i) {
    const pad = getPad(this, i);
    if (!pad) return null;
    let x = pad.leftStick.x, y = pad.leftStick.y;
    if (pad.left) x = -1; else if (pad.right) x = 1;
    if (pad.up) y = -1; else if (pad.down) y = 1;
    if (Math.hypot(x, y) < 0.2) { x = 0; y = 0; }
    return { x, y, dash: !!pad.A, stealth: !!pad.B };
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    updateBubbles(this, this.bubbles, dt);
    this.updateAmbient(dt);
    if (this.over) return;

    // 大鱼一条一条慢慢放：开局有一段安全期，之后每隔一个间隔才允许再放一条，且不超过上限
    this.elapsed += dt;
    this.levelClock += dt;
    if (this.bigNum < this.bigAllowed()) this.releaseBigFish();

    for (const p of this.players) this.updatePlayer(p, dt);
    for (const f of this.fishes) this.updateFish(f, dt);
    this.checkCollisions();
    this.updateHud();

    const alive = this.players.filter(p => p.alive);
    if (alive.length === 0) this.finish(false);
    else if (alive.some(p => p.weight >= this.cfg.targetWeight)) this.finish(true);
  }

  updatePlayer(p, dt) {
    if (!p.alive) return;
    p.dashCd = Math.max(0, p.dashCd - dt);
    p.stealthCd = Math.max(0, p.stealthCd - dt);
    p.dashT = Math.max(0, p.dashT - dt);
    p.stealthT = Math.max(0, p.stealthT - dt);

    // 手柄优先，无手柄输入时用键盘
    let ix = 0, iy = 0, dashDown = false, stealthDown = false;
    const pad = this.readPad(p.idx);
    const k = this.kb[p.idx];
    if (pad && (Math.hypot(pad.x, pad.y) > 0.25 || pad.dash || pad.stealth)) {
      ix = pad.x; iy = pad.y;
      dashDown = pad.dash; stealthDown = pad.stealth;
    } else {
      ix = (isDown(k.right) ? 1 : 0) - (isDown(k.left) ? 1 : 0);
      iy = (isDown(k.down) ? 1 : 0) - (isDown(k.up) ? 1 : 0);
      dashDown = isDown(k.dash);
      stealthDown = isDown(k.stealth);
    }

    if (dashDown && !p.prevDash && p.dashCd <= 0) {
      p.dashT = 1;
      p.dashCd = this.cfg.dashCooldown;
    }
    if (stealthDown && !p.prevStealth && p.stealthCd <= 0) {
      p.stealthT = this.cfg.stealthDuration;
      p.stealthCd = this.cfg.stealthCooldown;
    }
    p.prevDash = dashDown;
    p.prevStealth = stealthDown;

    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    const sp = p.baseSpeed * (p.dashT > 0 ? 2.5 : 1);
    p.c.x = Phaser.Math.Clamp(p.c.x + ix * sp * dt, p.radius, this.W - p.radius);
    p.c.y = Phaser.Math.Clamp(p.c.y + iy * sp * dt, p.radius, this.H - p.radius);

    if (ix > 0.1) p.facing = 1;
    else if (ix < -0.1) p.facing = -1;
    const s = p.radius / (54 * PLAYER_TEX_SS);   // 纹理按 PLAYER_TEX_SS 超采样生成，显示时缩回
    p.spr.setScale(s * p.facing, s);
    p.txt.y = p.radius + 4;
    p.txt.setText(String(p.weight));

    p.animT += dt;
    if (p.animT > 0.18) {
      p.animT = 0;
      p.frame = !p.frame;
      p.spr.setTexture(`player_p${p.idx + 1}_${p.frame ? 'open' : 'closed'}`);
    }
    p.c.setAlpha(p.stealthT > 0 ? 0.4 : 1);
  }

  // ---------- 鱼群 ----------

  // 大鱼 = 重量 >= 玩家初始重量，即开局就能吃掉玩家的鱼
  isBig(w) { return w >= this.startWeight; }

  // 该时刻允许有多少条大鱼：0 起步，每隔 bigFishInterval 放一条，直到上限
  bigAllowed() {
    return Math.min(this.bigCap, Math.floor(this.elapsed / this.cfg.bigFishInterval));
  }

  // 本关已解锁的鱼种范围
  randSpecies() {
    return Phaser.Math.Between(0, this.speciesMax - 1);
  }

  smallWeight() {
    const lo = this.cfg.fishWeightRange[0], hi = this.cfg.fishWeightRange[1];
    return Phaser.Math.Between(lo, Math.min(this.startWeight - 1, hi));
  }

  bigWeight() {
    const hi = this.cfg.fishWeightRange[1];
    return Phaser.Math.Between(this.startWeight, Math.max(this.startWeight, hi));
  }

  // 补充鱼：大多数时候是小鱼，少量中鱼，且大鱼数量始终受时间与上限约束
  randWeight() {
    const lo = this.cfg.fishWeightRange[0], hi = this.cfg.fishWeightRange[1];
    if (this.bigNum >= this.bigAllowed()) return this.smallWeight();
    if (Math.random() < 0.6) return this.smallWeight();
    const t = Math.pow(Math.random(), 1.6);   // 偏向小重量，避免难度突变
    return Phaser.Math.Between(lo, Math.max(lo, Math.round(lo + t * (hi - lo))));
  }

  spawnFish() {
    const sp = this.randSpecies();
    const spr = this.add.sprite(0, 0, 'fish_' + sp);
    const txt = this.add.text(0, 0, '', {
      fontSize: '17px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#00253f', strokeThickness: 3
    }).setOrigin(0.5);
    const c = this.add.container(0, 0, [spr, txt]);
    const f = {
      c, spr, txt, w: 1, scale: 1, radius: 10, spec: FISH_SPECIES[sp],
      angle: Math.random() * Math.PI * 2,
      speed: Phaser.Math.Between(this.cfg.fishSpeed[0], this.cfg.fishSpeed[1]),
      turnT: 0, drift: 0, labelState: '', labelPhase: Math.random() * Math.PI * 2
    };
    this.setFishWeight(f, this.smallWeight());
    this.placeFish(f);
    return f;
  }

  // 每隔一段时间把一条小鱼变成大鱼，逐步提升压力
  releaseBigFish() {
    if (this.over) return;
    const smalls = this.fishes.filter(f => !this.isBig(f.w));
    if (!smalls.length) return;
    const f = smalls[Phaser.Math.Between(0, smalls.length - 1)];
    this.setFishWeight(f, this.bigWeight());
    this.placeFish(f);
  }

  setFishWeight(f, w) {
    const wasBig = this.isBig(f.w);
    f.w = w;
    f.txt.setText(String(w));
    f.scale = (0.55 + w * 0.075) * FISH_DRAW_SCALE;
    f.radius = (f.spec ? f.spec.r : 33) * f.scale;
    f.spr.setScale(f.scale, f.scale);
    const nowBig = this.isBig(w);
    if (wasBig !== nowBig) this.bigNum += nowBig ? 1 : -1;
    // 有大鱼出现 → 叮叮叮提醒
    if (!wasBig && nowBig) SeaAudio.ding();
  }

  placeFish(f) {
    let x = 0, y = 0;
    for (let t = 0; t < 15; t++) {
      x = Phaser.Math.Between(60, this.W - 60);
      y = Phaser.Math.Between(80, this.H - 60);
      const ok = this.players.every(p => !p.alive ||
        Phaser.Math.Distance.Between(x, y, p.c.x, p.c.y) > 180);
      if (ok) break;
    }
    f.c.setPosition(x, y);
    f.angle = Math.random() * Math.PI * 2;
  }

  respawnFish(f) {
    this.setFishWeight(f, this.randWeight());
    f.speed = Phaser.Math.Between(this.cfg.fishSpeed[0], this.cfg.fishSpeed[1]);
    this.placeFish(f);
  }

  // 数字反馈：比玩家小的鱼 = 绿色加大加粗；能吃掉玩家的鱼 = 红色加大加粗
  // 以最近的存活玩家为参照，玩家变重（5→6→…）后颜色随体重实时切换；
  // 数字带同色的发光描影，并按各自相位一亮一亮地呼吸闪烁
  updateFishLabel(f) {
    let ref = null, best = 1e9;
    for (const p of this.players) {
      if (!p.alive) continue;
      const d = Phaser.Math.Distance.Between(f.c.x, f.c.y, p.c.x, p.c.y);
      if (d < best) { best = d; ref = p; }
    }
    if (!ref) return;
    const key = f.w >= ref.weight ? 'danger' : 'safe';
    if (f.labelState !== key) {
      f.labelState = key;
      if (key === 'danger') {
        f.txt.setColor('#ff5252').setFontSize(26).setStroke('#4d0000', 4);
        f.txt.setShadow(0, 0, '#ff2020', 14, true, true);   // 红色光晕
      } else {
        f.txt.setColor('#59ff59').setFontSize(24).setStroke('#003d00', 4);
        f.txt.setShadow(0, 0, '#2aff2a', 14, true, true);   // 绿色光晕
      }
    }
    // 一亮一亮：透明度呼吸闪烁（只改 alpha，不重绘文字纹理，开销极小）
    const pulse = (Math.sin(this.time.now / 220 + f.labelPhase) + 1) / 2;   // 0~1
    f.txt.setAlpha(0.68 + 0.32 * pulse);
  }

  updateFish(f, dt) {
    this.updateFishLabel(f);
    // 能吃掉玩家的鱼追击最近的非隐身玩家；会被玩家吃的鱼逃离
    let chase = null, flee = null, dChase = 1e9, dFlee = 1e9;
    for (const p of this.players) {
      if (!p.alive || p.stealthT > 0) continue;
      const d = Phaser.Math.Distance.Between(f.c.x, f.c.y, p.c.x, p.c.y);
      if (f.w >= p.weight) { if (d < dChase) { dChase = d; chase = p; } }
      else { if (d < dFlee) { dFlee = d; flee = p; } }
    }

    let sp = 1;
    if (chase) {
      const target = Math.atan2(chase.c.y - f.c.y, chase.c.x - f.c.x);
      f.angle = rotateToward(f.angle, target, 2.5 * dt);
      sp = 1.15;
    } else if (flee && dFlee < 260) {
      const target = Math.atan2(f.c.y - flee.c.y, f.c.x - flee.c.x);
      f.angle = rotateToward(f.angle, target, 3 * dt);
      sp = 1.1;
    } else {
      f.turnT -= dt;
      if (f.turnT <= 0) {
        f.drift = Phaser.Math.FloatBetween(-1.2, 1.2);
        f.turnT = Phaser.Math.FloatBetween(0.8, 2.2);
      }
      f.angle += f.drift * dt;
    }

    const v = f.speed * sp;
    f.c.x += Math.cos(f.angle) * v * dt;
    f.c.y += Math.sin(f.angle) * v * dt;

    // 边界回弹
    const m = f.radius;
    const sx = Math.sin(f.angle), cx = Math.cos(f.angle);
    if (f.c.x < m) { f.c.x = m; f.angle = Math.atan2(sx, Math.abs(cx)); }
    else if (f.c.x > this.W - m) { f.c.x = this.W - m; f.angle = Math.atan2(sx, -Math.abs(cx)); }
    if (f.c.y < m) { f.c.y = m; f.angle = Math.atan2(Math.abs(sx), Math.cos(f.angle)); }
    else if (f.c.y > this.H - m) { f.c.y = this.H - m; f.angle = Math.atan2(-Math.abs(sx), Math.cos(f.angle)); }

    // 纹理朝左，向右游时翻转
    const dir = Math.cos(f.angle) < 0 ? 1 : -1;
    f.spr.setScale(f.scale * dir, f.scale);
  }

  // ---------- 碰撞与结算 ----------

  checkCollisions() {
    for (const p of this.players) {
      if (!p.alive) continue;
      for (const f of this.fishes) {
        const d = Phaser.Math.Distance.Between(p.c.x, p.c.y, f.c.x, f.c.y);
        if (d >= p.radius * 0.8 + f.radius * 0.8) continue;
        if (f.w < p.weight) {
          p.weight++;
          p.radius = 20 + p.weight * 1.3;
          this.eatCount = (this.eatCount || 0) + 1;
          SeaAudio.eatFish(this.eatCount);   // 按当前语言播报第几条鱼（one/two/three… 或 一条鱼/二条鱼…）
          const t = this.add.text(f.c.x, f.c.y, '+1', {
            fontSize: '20px', fontStyle: 'bold', color: '#8dff8d',
            stroke: '#003300', strokeThickness: 3
          }).setOrigin(0.5);
          this.tweens.add({ targets: t, y: t.y - 40, alpha: 0, duration: 700, onComplete: () => t.destroy() });
          this.respawnFish(f);
        } else if (p.stealthT <= 0) {
          this.killPlayer(p);
          break;
        }
      }
    }
  }

  killPlayer(p) {
    p.alive = false;
    p.c.setVisible(false);
    const t = this.add.text(p.c.x, p.c.y, T('eaten'), {
      fontSize: '26px', fontStyle: 'bold', color: '#ff8080',
      stroke: '#440000', strokeThickness: 4
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: t.y - 50, alpha: 0, duration: 1200, onComplete: () => t.destroy() });
  }

  finish(win) {
    if (this.over) return;
    this.over = true;
    const total = this.runTime + this.levelClock;
    const lastLevel = this.levelIndex >= this.levels.length - 1;
    // 每关完成后的评分：按本关用时，满分 100 分（10 颗黄星，每 10 分一颗）
    const dm = DIFFICULTY_PRESETS[this.difficulty] || DIFFICULTY_PRESETS.normal;
    const levelScore = win ? calcLevelScore(this.levelClock, this.cfg, dm.parMul) : 0;
    this.time.delayedCall(1000, () => {
      // 最后一关通关：进庆祝场景（所有鱼游动 + 火山爆发 + 笑脸 + 评分）
      if (win && lastLevel) {
        this.scene.start('VictoryScene', {
          runTime: total,
          players: this.numPlayers,
          difficulty: this.difficulty,
          mapKey: this.mapKey
        });
        return;
      }
      this.scene.start('EndScene', {
        result: win ? 'win' : 'lose',
        levelIndex: this.levelIndex,
        players: this.numPlayers,
        lastLevel,
        difficulty: this.difficulty,
        runTime: total,
        levelTime: this.levelClock,
        levelScore,
        mapKey: this.mapKey
      });
    });
  }

  // ---------- HUD ----------

  createHud() {
    this.huds = this.players.map((p, i) => {
      const right = i === 1;
      const x = right ? this.W - 14 : 14;
      const o = right ? 1 : 0;
      const color = i === 0 ? '#ffb347' : '#7ee87e';
      this.add.text(x, 18, 'P' + (i + 1), {
        fontSize: '20px', fontStyle: 'bold', color,
        stroke: '#00253f', strokeThickness: 3
      }).setOrigin(o, 0);
      const weight = this.add.text(x, 42, '', {
        fontSize: '26px', fontStyle: 'bold', color: '#ffffff',
        stroke: '#00253f', strokeThickness: 4
      }).setOrigin(o, 0);
      const mkIcon = (slot, tex, ch, hint) => {
        const ix = right ? x - slot * 56 : x + slot * 56;
        const cx = right ? ix - 22 : ix + 22;
        const glow = this.add.image(cx, 96, 'icon_ring').setAlpha(0)
          .setBlendMode(Phaser.BlendModes.ADD);
        const img = this.add.image(ix, 96, tex).setOrigin(o, 0.5);
        this.add.text(cx, 96, ch, {
          fontSize: '15px', fontStyle: 'bold', color: '#123'
        }).setOrigin(0.5).setAlpha(0.9);
        const mask = this.add.image(ix, 96, 'icon_mask').setOrigin(o, 0.5).setAlpha(0.5).setVisible(false);
        const cd = this.add.text(cx, 96, '', {
          fontSize: '18px', fontStyle: 'bold', color: '#ffee58',
          stroke: '#000000', strokeThickness: 3
        }).setOrigin(0.5);
        this.add.text(cx, 120, hint, { fontSize: '11px', color: '#9fc6e8' }).setOrigin(0.5, 0);
        return { img, mask, cd, glow, cx, cy: 96, state: '', pulse: null };
      };
      const dashHint = T(i === 0 ? 'dashHintP1' : 'dashHintP2');
      const stHint = T(i === 0 ? 'stealthHintP1' : 'stealthHintP2');
      return { weight, dash: mkIcon(0, 'icon_dash', T('dashCh'), dashHint),
               stealth: mkIcon(1, 'icon_stealth', T('stealthCh'), stHint) };
    });
  }

  // 冷却中：图标变暗 + 遮罩 + 倒计时；就绪：恢复本色 + 呼吸光晕 + 就绪瞬间闪光
  setCd(icon, cd) {
    if (cd > 0) {
      if (icon.state !== 'cooling') {
        icon.state = 'cooling';
        icon.mask.setVisible(true);
        icon.img.setTint(0x5a6472);      // 颜色一：冷却中的暗灰蓝
        icon.img.setAlpha(0.9);
        icon.cd.setColor('#e8f1ff');
        this.hideReadyGlow(icon);
      }
      icon.cd.setText(String(Math.ceil(cd)));
    } else if (icon.state !== 'ready') {
      const wasCooling = icon.state === 'cooling';
      icon.state = 'ready';
      icon.mask.setVisible(false);
      icon.cd.setText('');
      icon.img.clearTint();            // 颜色二：就绪时恢复技能本色
      icon.img.setAlpha(1);
      this.showReadyGlow(icon);
      if (wasCooling) this.flashReady(icon);   // 就绪瞬间的亮眼特效
    }
  }

  showReadyGlow(icon) {
    this.tweens.killTweensOf(icon.glow);
    icon.glow.setVisible(true).setScale(1).setAlpha(0.55);
    icon.pulse = this.tweens.add({
      targets: icon.glow, scale: 1.5, alpha: 0.06,
      duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  hideReadyGlow(icon) {
    if (icon.pulse) { icon.pulse.stop(); icon.pulse = null; }
    this.tweens.killTweensOf(icon.glow);
    icon.glow.setAlpha(0);
  }

  flashReady(icon) {
    const ring = this.add.image(icon.cx, icon.cy, 'icon_ring')
      .setScale(0.5).setAlpha(1).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: ring, scale: 2.3, alpha: 0, duration: 520,
      onComplete: () => ring.destroy()
    });
    this.tweens.add({ targets: icon.img, scale: 1.45, duration: 130, yoyo: true, repeat: 2 });
  }

  updateHud() {
    this.players.forEach((p, i) => {
      const h = this.huds[i];
      h.weight.setText(p.alive ? T('weight', { n: p.weight }) : T('out'));
      this.setCd(h.dash, p.dashCd);
      this.setCd(h.stealth, p.stealthCd);
    });
    const spec = FISH_SPECIES[this.speciesMax - 1];
    this.infoText.setText(T('speciesInfo', {
      n: this.speciesMax, max: MAX_SPECIES, name: tx(spec.name),
      n2: this.bigNum, max2: this.bigCap
    }));
  }

  // ---------- 背景装饰鱼 ----------

  createAmbientFish() {
    const arr = [];
    for (let i = 0; i < 4; i++) {
      const img = this.add.image(
        Math.random() * this.W,
        80 + Math.random() * (this.H - 160),
        'fish_' + this.randSpecies()
      );
      img.setAlpha(0.25).setScale(1.1 / FISH_TEX_SS);
      img.setData('sp', Phaser.Math.Between(15, 40) * (Math.random() < 0.5 ? -1 : 1));
      arr.push(img);
    }
    return arr;
  }

  updateAmbient(dt) {
    for (const img of this.ambient) {
      const sp = img.getData('sp');
      img.x += sp * dt;
      img.setFlipX(sp > 0);
      if (sp > 0 && img.x > this.W + 60) img.x = -60;
      if (sp < 0 && img.x < -60) img.x = this.W + 60;
    }
  }
}
