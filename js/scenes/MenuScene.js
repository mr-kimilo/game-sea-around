class MenuScene extends Phaser.Scene {
  constructor() { super('MenuScene'); }

  create() {
    generateTextures(this);
    this.mapKeys = MAP_KEYS;
    this.selMap = Math.max(0, this.mapKeys.indexOf(this.registry.get('mapKey') || 'tropical'));
    this.bg = null;
    this.mapFx = [];
    this.applyMap();                  // 背景按当前选中的地图实时预览
    this.bubbles = createBubbles(this, 16);
    this.started = false;
    SeaAudio.init(this);       // 海底背景音（海浪 + 水泡），首次按键/点击后开始播
    SeaAudio.addHint(this);

    const cx = GAME_W / 2;
    this.cameras.main.setZoom(HD_ZOOM).centerOn(GAME_W / 2, GAME_H / 2);   // 高清渲染：缓冲 1920x1080，逻辑仍是 960x540
    // 统一的纵向节奏：标题 → 副标题 → 开始方式 → 地图选择 → 底部操作说明
    // 顶部留出安全边距（≥50px），即使外层容器顶部有少量遮挡也不会切到标题
    this.add.text(cx, 84, T('title'), {
      fontSize: '60px', fontStyle: 'bold', color: '#ffe082',
      stroke: '#004c7f', strokeThickness: 8
    }).setOrigin(0.5);
    this.add.text(cx, 140, T('subtitle'), {
      fontSize: '20px', color: '#cfe8ff'
    }).setOrigin(0.5);
    this.add.text(cx, 196, T('press1'), {
      fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#003355', strokeThickness: 4
    }).setOrigin(0.5);
    this.add.text(cx, 236, T('press2'), {
      fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#003355', strokeThickness: 4
    }).setOrigin(0.5);

    // 地图选择：← → 切换，背景实时预览（三个选项等距排列）
    this.add.text(cx, 290, T('mapLabel'), {
      fontSize: '19px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#003355', strokeThickness: 3
    }).setOrigin(0.5);
    this.mapTexts = this.mapKeys.map((k, i) =>
      this.add.text(cx + (i - 1) * 200, 326, tx(MAPS[k].name), {
        fontSize: '26px', fontStyle: 'bold', color: '#ffffff',
        stroke: '#003355', strokeThickness: 4
      }).setOrigin(0.5)
    );
    this.mapDesc = this.add.text(cx, 358, '', {
      fontSize: '16px', color: '#ffe082'
    }).setOrigin(0.5);
    this.refreshMapUI();

    // 语言选择：按 L 在 中文 / English 之间切换，界面文案与语音播报都跟着换
    this.add.text(cx, 396, T('langLabel'), {
      fontSize: '16px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#003355', strokeThickness: 3
    }).setOrigin(0.5);
    this.langTexts = LANGS.map((l, i) => {
      // 两个选项以画布中线对称排列（i=0 左、i=1 右）
      const t = this.add.text(cx + (i - (LANGS.length - 1) / 2) * 220, 424, l.label, {
        fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
        stroke: '#003355', strokeThickness: 4
      }).setOrigin(0.5);
      t.setInteractive({ useHandCursor: true });      // 直接点语言名也能切换（鼠标 / 触屏）
      t.on('pointerdown', () => this.switchLang(i));
      return t;
    });
    this.refreshLangUI();

    // 底部操作说明面板：两行居中、行距一致
    this.add.rectangle(cx, 488, 920, 76, 0x021426, 0.45);
    this.add.text(cx, 488, T('keyboardHelp'), {
      fontSize: '14px', color: '#9fc6e8', align: 'center', lineSpacing: 10
    }).setOrigin(0.5);

    const kb = this.input.keyboard;
    // 第一次按键/点击时播欢迎语（浏览器要求先有用户操作才允许出声）；
    // 若这次操作就是开始游戏或换地图，就让位给那句更具体的播报，不打断它
    this.sayBase = SeaAudio.state().sayCount;
    this.greeted = false;
    this.greet = () => {
      if (this.greeted || this.started) return;
      this.greeted = true;
      this.time.delayedCall(260, () => {
        if (this.started || SeaAudio.state().sayCount !== this.sayBase) return;
        SeaAudio.welcome();
      });
    };
    kb.on('keydown', this.greet);
    this.input.on('pointerdown', this.greet);

    kb.on('keydown-ONE', () => this.startGame(1));
    kb.on('keydown-NUMPAD_ONE', () => this.startGame(1));
    kb.on('keydown-TWO', () => this.startGame(2));
    kb.on('keydown-NUMPAD_TWO', () => this.startGame(2));
    kb.on('keydown-LEFT', () => this.moveMap(-1));
    kb.on('keydown-RIGHT', () => this.moveMap(1));
    kb.on('keydown-L', () => this.switchLang());

    // 手柄输入锁，防止按住按键直接穿过场景
    this.lock = true;
    this.padPrev = { a: true, b: true, left: true, right: true, lang: true };
    this.time.delayedCall(400, () => {
      this.lock = false;
      this.padPrev = this.currentPad();
    });
  }

  // 切换地图：销毁旧背景和装饰，按新地图重画（实时预览）
  applyMap() {
    if (this.bg) this.bg.destroy();
    if (this.mapFx) this.mapFx.forEach(o => o.destroy());
    const key = this.mapKeys[this.selMap];
    this.registry.set('mapKey', key);   // 记住选择，下次回来还是这张地图
    this.bg = drawSeaBackground(this, key);
    this.mapFx = createMapFX(this, key);
  }

  refreshMapUI() {
    this.mapTexts.forEach((t, i) => {
      const sel = i === this.selMap;
      t.setText((sel ? '【' : '') + tx(MAPS[this.mapKeys[i]].name) + (sel ? '】' : ''));
      t.setColor(sel ? '#ffe082' : '#ffffff');
      t.setScale(sel ? 1.15 : 1);
    });
    this.mapDesc.setText(tx(MAPS[this.mapKeys[this.selMap]].desc));
  }

  // 语言高亮：当前语言用【】框起来
  refreshLangUI() {
    this.langTexts.forEach((t, i) => {
      const sel = LANGS[i].code === LANG;
      t.setText((sel ? '【' : '') + LANGS[i].label + (sel ? '】' : ''));
      t.setColor(sel ? '#ffe082' : '#ffffff');
      t.setScale(sel ? 1.15 : 1);
    });
  }

  // 切换语言：界面整屏重画（文案全部换语言），并用新语言念一遍语言名
  // idx = 点某个语言名（鼠标/触屏）；不传就是键 / 手柄切换
  switchLang(idx) {
    if (this.started) return;
    const same = (typeof idx === 'number') && LANGS[idx] && LANGS[idx].code === LANG;
    if (typeof idx === 'number' && LANGS[idx]) setLang(LANGS[idx].code);
    else toggleLang();
    SeaAudio.say(langObj().spoken, { interrupt: true });
    if (same) { this.refreshLangUI(); return; }      // 点的就是当前语言，不用重画
    this.scene.restart();
  }

  moveMap(d) {
    if (this.started) return;
    this.selMap = (this.selMap + d + this.mapKeys.length) % this.mapKeys.length;
    this.refreshMapUI();
    this.applyMap();
    SeaAudio.say(tx(MAPS[this.mapKeys[this.selMap]].name), { interrupt: true });   // 播报当前地图名
  }

  currentPad() {
    const pad = getPad(this, 0);
    return pad
      ? { a: !!pad.A, b: !!pad.B, left: !!pad.left, right: !!pad.right,
          lang: !!(pad.L1 || pad.R1 || pad.L2 || pad.R2) }
      : { a: false, b: false, left: false, right: false, lang: false };
  }

  update(time, delta) {
    updateBubbles(this, this.bubbles, Math.min(delta / 1000, 0.05));
    if (this.lock || this.started) return;
    const cur = this.currentPad();
    if (cur.a && !this.padPrev.a) this.startGame(1);
    else if (cur.b && !this.padPrev.b) this.startGame(2);
    else if (cur.left && !this.padPrev.left) this.moveMap(-1);
    else if (cur.right && !this.padPrev.right) this.moveMap(1);
    else if (cur.lang && !this.padPrev.lang) this.switchLang();   // 手柄 L1/R1/L2/R2 切语言
    this.padPrev = cur;
  }

  startGame(players) {
    if (this.started) return;
    this.started = true;
    SeaAudio.say(T(players === 1 ? 'player1' : 'player2'), { interrupt: true });   // 播报几个玩家
    this.scene.start('GameScene', {
      levelIndex: 0, players, difficulty: 'normal', runTime: 0,
      mapKey: this.mapKeys[this.selMap]
    });
  }
}
