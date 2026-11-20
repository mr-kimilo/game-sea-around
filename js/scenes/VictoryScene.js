// 全部通关后的庆祝：所有鱼游来游去 → 海底火山爆发 → 笑脸 + 按时长评分 + 10 颗黄星
class VictoryScene extends Phaser.Scene {
  constructor() { super('VictoryScene'); }

  init(data) {
    this.runTime = (data && data.runTime) || 0;      // 通关总用时（秒）
    this.numPlayers = (data && data.players) || 1;
    this.difficulty = (data && data.difficulty) || 'normal';
    this.mapKey = getMapKey(this, data && data.mapKey);
    this.score = calcScoreByTime(this.runTime);
    this.stars10 = Math.floor(this.score / 10);      // 满分 100 → 10 颗星
    this.stage = 'swim';                             // swim → erupt → result
    this.done = false;
    this.resultShown = false;
    this.timers = [];
    this.flee = 0;
    this.prevSkip = false;
  }

  create() {
    generateTextures(this);
    this.W = GAME_W;
    this.H = GAME_H;
    this.cameras.main.setZoom(HD_ZOOM).centerOn(GAME_W / 2, GAME_H / 2);   // 高清渲染：缓冲 1920x1080，逻辑仍是 960x540

    drawSeaBackground(this, this.mapKey);
    createMapFX(this, this.mapKey);
    this.bubbles = createBubbles(this, 20);
    this.swimmers = this.createSwimmers();
    SeaAudio.init(this);
    SeaAudio.addHint(this);

    // 火山：从屏幕下方升起，山口高度用于放置熔岩
    this.volcanoY = this.H - 14;
    this.craterY = this.volcanoY - 240;
    this.volcano = this.add.image(this.W / 2, this.H + 320, 'volcano').setOrigin(0.5, 1).setScale(0.5);   // 火山纹理是 2 倍超采样
    this.craterGlow = this.add.image(this.W / 2, this.craterY, 'lava')
      .setScale(3.4).setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);

    this.hint = this.add.text(this.W / 2, this.H - 8, T('skipHint'), {
      fontSize: '14px', color: '#cfe8ff', stroke: '#00253f', strokeThickness: 3
    }).setOrigin(0.5, 1);

    this.schedule(1200, () => this.riseVolcano());
    this.schedule(2700, () => this.startEruption());
    this.schedule(7600, () => this.showResult());

    this.bindInput();
  }

  // ---------- 流程调度（可被“跳过”一次性取消） ----------
  schedule(delay, fn) {
    this.timers.push(this.time.delayedCall(delay, fn));
  }

  clearTimers() {
    this.timers.forEach(t => t.remove());
    this.timers = [];
  }

  // ---------- 鱼群：所有鱼种一起游来游去 ----------
  createSwimmers() {
    const arr = [];
    const order = FISH_SPECIES.map((s, i) => i);
    for (let i = 0; i < 8; i++) order.push(Phaser.Math.Between(0, MAX_SPECIES - 1));
    order.forEach(i => {
      const s = Phaser.Math.FloatBetween(0.55, 0.95) / FISH_TEX_SS;   // 鱼纹理是 3 倍超采样，显示时缩回
      const img = this.add.image(
        Phaser.Math.Between(60, this.W - 60),
        Phaser.Math.Between(50, this.H - 150),
        'fish_' + i
      ).setScale(s);
      img.setData('vx', Phaser.Math.FloatBetween(25, 70) * (Math.random() < 0.5 ? -1 : 1));
      img.setData('vy', Phaser.Math.FloatBetween(-14, 14));
      img.setData('ph', Math.random() * Math.PI * 2);
      arr.push(img);
    });
    return arr;
  }

  updateSwimmers(dt) {
    const t = this.time.now / 1000;
    for (const f of this.swimmers) {
      let vx = f.getData('vx'), vy = f.getData('vy');
      if (this.flee > 0) {           // 火山爆发时鱼群惊慌上游
        vy = -Math.abs(vy) - 60;
        vx *= 1.7;
      }
      f.x += vx * dt;
      f.y += vy * dt + Math.sin(t * 2 + f.getData('ph')) * 10 * dt;
      f.setFlipX(vx > 0);
      const m = 80;
      if (f.x < -m) f.x = this.W + m;
      else if (f.x > this.W + m) f.x = -m;
      const top = 40, bottom = this.H - 110;
      if (f.y < top) f.y = top;
      else if (this.flee <= 0 && f.y > bottom) f.y = bottom;
    }
  }

  // ---------- 火山 ----------
  riseVolcano() {
    if (this.resultShown) return;
    this.stage = 'erupt';
    this.cameras.main.shake(1400, 0.006);
    this.tweens.add({ targets: this.volcano, y: this.volcanoY, duration: 1400, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: this.craterGlow, alpha: 0.85, duration: 1200 });
  }

  startEruption() {
    if (this.resultShown) return;
    this.flee = 7;
    this.cameras.main.flash(260, 255, 150, 60);
    this.erupt = this.time.addEvent({ delay: 360, repeat: 11, callback: () => this.burst(7) });
  }

  // 一次喷发：熔岩火球抛射 + 火山灰 + 闪光震动
  burst(count) {
    if (this.done) return;
    const cx = this.W / 2, cy = this.craterY;
    for (let i = 0; i < count; i++) {
      const x = cx + Phaser.Math.Between(-26, 26);
      const vx = Phaser.Math.Between(-170, 170);
      const h = Phaser.Math.Between(130, 240);
      const img = this.add.image(x, cy, 'lava')
        .setScale(Phaser.Math.FloatBetween(0.6, 1.5))
        .setBlendMode(Phaser.BlendModes.ADD);
      const rise = Phaser.Math.Between(420, 680);
      this.tweens.add({
        targets: img, x: x + vx, y: cy - h, scale: img.scale * 0.75,
        duration: rise, ease: 'Quad.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: img, x: x + vx * 1.7, y: this.craterY + 300, alpha: 0.15,
            duration: Phaser.Math.Between(650, 950), ease: 'Quad.easeIn',
            onComplete: () => img.destroy()
          });
        }
      });
    }
    for (let i = 0; i < 4; i++) {
      const s = this.add.image(cx + Phaser.Math.Between(-40, 40), cy, 'smoke')
        .setScale(Phaser.Math.FloatBetween(0.8, 1.3));
      this.tweens.add({
        targets: s, x: s.x + Phaser.Math.Between(-90, 90),
        y: cy - Phaser.Math.Between(120, 230), scale: s.scale * 2.4, alpha: 0,
        duration: Phaser.Math.Between(1500, 2100), ease: 'Quad.easeOut',
        onComplete: () => s.destroy()
      });
    }
    if (this.flee > 0) this.cameras.main.shake(180, 0.007);   // 结果阶段的余烬不再震屏
  }

  // ---------- 结果：笑脸 + 分数 + 十颗星 ----------
  showResult() {
    if (this.resultShown) return;
    this.resultShown = true;
    this.stage = 'result';
    this.clearTimers();
    if (this.erupt) { this.erupt.remove(); this.erupt = null; }
    this.tweens.killTweensOf(this.volcano);
    this.tweens.killTweensOf(this.craterGlow);
    this.volcano.setY(this.volcanoY).setAlpha(1);
    this.craterGlow.setAlpha(0.5);
    this.flee = 0;
    this.hint.setVisible(false);
    // 余烬：时不时再冒一点
    this.erupt = this.time.addEvent({ delay: 1500, loop: true, callback: () => this.burst(3) });

    this.buildResultUI();
  }

  buildResultUI() {
    const cx = this.W / 2;

    // 文字底衬，保证压在火山上也看得清
    const panel = this.add.rectangle(cx, 350, 700, 330, 0x021426, 0.62).setAlpha(0);
    this.tweens.add({ targets: panel, alpha: 1, duration: 600 });

    const title = this.add.text(cx, 40, T('victory'), {
      fontSize: '42px', fontStyle: 'bold', color: '#ffe082',
      stroke: '#00253f', strokeThickness: 7
    }).setOrigin(0.5).setAlpha(0);

    const face = this.add.image(cx, 190, 'smiley').setScale(0).setAlpha(0);
    const praise = this.add.text(cx, 300, T('praise'), {
      fontSize: '34px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#003355', strokeThickness: 6
    }).setOrigin(0.5).setAlpha(0);

    const panelTop = this.add.rectangle(cx, 124, 460, 96, 0x021426, 0.45).setAlpha(0);

    // 分数（从 0 滚到实际分数）
    this.scoreText = this.add.text(cx, 372, T('score', { n: 0 }), {
      fontSize: '40px', fontStyle: 'bold', color: '#8dff8d',
      stroke: '#003300', strokeThickness: 5
    }).setOrigin(0.5).setAlpha(0);

    this.subText = this.add.text(cx, 418, '', {
      fontSize: '20px', color: '#cfe8ff'
    }).setOrigin(0.5).setAlpha(0);

    // 10 颗星
    this.starImgs = [];
    for (let i = 0; i < 10; i++) {
      const img = this.add.image(cx + (i - 4.5) * 52, 462, i < this.stars10 ? 'star_full' : 'star_empty')
        .setScale(0).setAlpha(0);
      this.starImgs.push(img);
    }

    this.optionText = this.add.text(cx, 503, T('option'), {
      fontSize: '20px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#003355', strokeThickness: 4
    }).setOrigin(0.5).setAlpha(0);
    this.padText = this.add.text(cx, 526, T('padOption'), {
      fontSize: '13px', color: '#9fc6e8'
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({ targets: [panelTop, title], alpha: 1, duration: 500 });
    this.tweens.add({
      targets: face, alpha: 1, scale: 0.85, duration: 520, ease: 'Back.easeOut'
    });
    this.tweens.add({ targets: face, angle: 4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.schedule(620, () => this.tweens.add({ targets: praise, alpha: 1, duration: 400 }));
    this.schedule(900, () => {
      this.tweens.add({ targets: [this.scoreText, this.subText], alpha: 1, duration: 400 });
      const counter = { v: 0 };
      this.tweens.add({
        targets: counter, v: this.score, duration: 900, ease: 'Cubic.easeOut',
        onUpdate: () => this.scoreText.setText(T('score', { n: Math.round(counter.v) })),
        onComplete: () => this.scoreText.setText(T('score', { n: this.score }))
      });
      this.subText.setText(T('summary', {
        t: formatTime(this.runTime),
        d: tx((DIFFICULTY_PRESETS[this.difficulty] || DIFFICULTY_PRESETS.normal).name),
        m: tx(MAPS[this.mapKey].name)
      }) + '\n' + scoreComment(this.score));
    });

    // 星星逐个蹦出来
    for (let i = 0; i < 10; i++) {
      this.schedule(1300 + i * 150, () => {
        const img = this.starImgs[i];
        SeaAudio.starBing(i);            // 每蹦一颗星星“bing”一声（音调逐颗升高）
        this.tweens.add({ targets: img, alpha: 1, scale: 1.3, duration: 240, ease: 'Back.easeOut',
          onComplete: () => this.tweens.add({ targets: img, scale: 1, duration: 160 }) });
        if (i < this.stars10) this.cameras.main.flash(90, 110, 95, 25);
      });
    }
    this.schedule(1300 + 10 * 150, () => {
      this.tweens.add({ targets: [this.optionText, this.padText], alpha: 1, duration: 400 });
      this.ready = true;
    });
  }

  // ---------- 输入 ----------
  bindInput() {
    const K = Phaser.Input.Keyboard.KeyCodes;
    const kb = this.input.keyboard;
    this.keys = {
      skip: [kb.addKey(K.SPACE), kb.addKey(K.ENTER)],
      replay: [kb.addKey(K.ONE), kb.addKey(K.NUMPAD_ONE)],
      menu: [kb.addKey(K.TWO), kb.addKey(K.NUMPAD_TWO), kb.addKey(K.ESC)]
    };
    this.lock = true;
    this.padPrev = { a: false, b: false };
    this.time.delayedCall(600, () => {
      this.lock = false;
      this.padPrev = this.currentPad();
    });
  }

  currentPad() {
    const pad = getPad(this, 0);
    return pad ? { a: !!pad.A, b: !!pad.B } : { a: false, b: false };
  }

  replay() {
    if (this.done) return;
    this.done = true;
    this.scene.start('GameScene', {
      levelIndex: 0, players: this.numPlayers, difficulty: this.difficulty, runTime: 0,
      mapKey: this.mapKey
    });
  }

  toMenu() {
    if (this.done) return;
    this.done = true;
    this.scene.start('MenuScene');
  }

  update(time, delta) {
    const dt = Math.min(delta / 1000, 0.05);
    updateBubbles(this, this.bubbles, dt);
    this.updateSwimmers(dt);

    const pad = this.currentPad();
    if (!this.lock) {
      if (isDown(this.keys.replay)) this.replay();
      else if (isDown(this.keys.menu)) this.toMenu();
      else if (this.stage !== 'result') {
        const skip = isDown(this.keys.skip) || pad.a;
        if (skip && !this.prevSkip) this.showResult();
        this.prevSkip = skip;
      } else if (pad.a && !this.padPrev.a) this.replay();
      else if (pad.b && !this.padPrev.b) this.toMenu();
    }
    this.padPrev = pad;
  }
}
