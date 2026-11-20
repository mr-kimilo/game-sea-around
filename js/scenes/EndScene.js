class EndScene extends Phaser.Scene {
  constructor() { super('EndScene'); }

  init(data) {
    this.result = (data && data.result) || 'lose';
    this.levelIndex = (data && data.levelIndex) || 0;
    this.players = (data && data.players) || 1;
    this.lastLevel = !!(data && data.lastLevel);
    this.difficulty = (data && data.difficulty) || 'normal';
    this.runTime = (data && data.runTime) || 0;   // 累计用时（秒）
    this.levelTime = (data && data.levelTime) || 0;   // 本关用时（秒）
    this.levelScore = (data && data.levelScore) || 0;  // 本关得分（满分 100 = 10 颗黄星）
    this.mapKey = getMapKey(this, data && data.mapKey);
    this.diffKeys = ['easy', 'normal', 'hard'];
    this.selDiff = Math.max(0, this.diffKeys.indexOf(this.difficulty));
    this.done = false;
    this.starShown = 0;
    this.starTimer = null;      // 上一局可能留下的计时器引用，这里清掉
  }

  create() {
    generateTextures(this);
    drawSeaBackground(this, this.mapKey);
    createMapFX(this, this.mapKey);
    this.bubbles = createBubbles(this, 14);
    SeaAudio.init(this);
    SeaAudio.addHint(this);

    const cx = GAME_W / 2;
    this.cameras.main.setZoom(HD_ZOOM).centerOn(GAME_W / 2, GAME_H / 2);   // 高清渲染：缓冲 1920x1080，逻辑仍是 960x540
    const kb = this.input.keyboard;

    if (this.result === 'win') {
      const title = T(this.lastLevel ? 'allClear' : 'levelClear');
      const primary = T(this.lastLevel ? 'replay1' : 'next1');
      this.add.text(cx, 104, title, {
        fontSize: '48px', fontStyle: 'bold', color: this.lastLevel ? '#ffe082' : '#8dff8d',
        stroke: '#00253f', strokeThickness: 6
      }).setOrigin(0.5);
      this.add.text(cx, 152, this.lastLevel
        ? T('king')
        : T('nextTease', { n: this.levelIndex + 2 }), {
        fontSize: '19px', color: '#cfe8ff'
      }).setOrigin(0.5);
      this.add.text(cx, 182, T('timeLine', { t: formatTime(this.levelTime), t2: formatTime(this.runTime) }), {
        fontSize: '17px', color: '#ffd93d'
      }).setOrigin(0.5);

      // 得分：10 颗黄星一颗一颗蹦出来，每蹦一颗“bing”一声
      this.scoreText = this.add.text(cx, 222, T('scoreLine', { n: 0 }), {
        fontSize: '26px', fontStyle: 'bold', color: '#8dff8d',
        stroke: '#003300', strokeThickness: 4
      }).setOrigin(0.5);
      this.starImgs = [];
      for (let i = 0; i < 10; i++) {
        this.starImgs.push(this.add.image(cx + (i - 4.5) * 52, 282, 'star_empty')
          .setScale(0).setAlpha(0));
      }
      this.starTarget = Math.floor(this.levelScore / 10);   // 每 10 分点亮 1 颗
      this.commentText = this.add.text(cx, 324, '', {
        fontSize: '17px', color: '#cfe8ff'
      }).setOrigin(0.5).setAlpha(0);
      this.starTimer = this.time.addEvent({ delay: 240, loop: true, callback: () => this.revealStar() });

      this.add.text(cx, 392, `${primary}\n${T('back2')}`, {
        fontSize: '26px', fontStyle: 'bold', color: '#ffffff', align: 'center',
        stroke: '#003355', strokeThickness: 4
      }).setOrigin(0.5);
      this.add.text(cx, 452, T('padConfirm'), {
        fontSize: '15px', color: '#9fc6e8'
      }).setOrigin(0.5);

      kb.on('keydown-ONE', () => this.primary());
      kb.on('keydown-NUMPAD_ONE', () => this.primary());
      kb.on('keydown-ENTER', () => this.primary());
      kb.on('keydown-TWO', () => this.toMenu());
      kb.on('keydown-NUMPAD_TWO', () => this.toMenu());
      kb.on('keydown-ESC', () => this.toMenu());
    } else {
      this.add.text(cx, 110, T('dead'), {
        fontSize: '56px', fontStyle: 'bold', color: '#ff9090',
        stroke: '#00253f', strokeThickness: 6
      }).setOrigin(0.5);
      this.add.text(cx, 165, T('levelOf', { n: this.levelIndex + 1 }), {
        fontSize: '22px', fontStyle: 'bold', color: '#ffe082',
        stroke: '#003355', strokeThickness: 4
      }).setOrigin(0.5);
      this.add.text(cx, 205, T('chooseDiff'), {
        fontSize: '26px', fontStyle: 'bold', color: '#ffffff',
        stroke: '#003355', strokeThickness: 4
      }).setOrigin(0.5);

      this.diffTexts = this.diffKeys.map((k, i) =>
        this.add.text(cx + (i - 1) * 190, 260, tx(DIFFICULTY_PRESETS[k].name), {
          fontSize: '30px', fontStyle: 'bold', color: '#ffffff',
          stroke: '#003355', strokeThickness: 4
        }).setOrigin(0.5)
      );
      this.diffDesc = this.add.text(cx, 315, '', {
        fontSize: '17px', color: '#9fc6e8'
      }).setOrigin(0.5);
      this.refreshDiffUI();

      this.add.text(cx, 395, T('diffHelp'), {
        fontSize: '18px', color: '#9fc6e8', align: 'center'
      }).setOrigin(0.5);

      kb.on('keydown-LEFT', () => this.moveSel(-1));
      kb.on('keydown-RIGHT', () => this.moveSel(1));
      kb.on('keydown-UP', () => this.moveSel(-1));
      kb.on('keydown-DOWN', () => this.moveSel(1));
      kb.on('keydown-ONE', () => this.startWith(0));
      kb.on('keydown-NUMPAD_ONE', () => this.startWith(0));
      kb.on('keydown-TWO', () => this.startWith(1));
      kb.on('keydown-NUMPAD_TWO', () => this.startWith(1));
      kb.on('keydown-THREE', () => this.startWith(2));
      kb.on('keydown-NUMPAD_THREE', () => this.startWith(2));
      kb.on('keydown-ENTER', () => this.confirm());
      kb.on('keydown-SPACE', () => this.confirm());
      kb.on('keydown-ESC', () => this.toMenu());
    }

    this.lock = true;
    this.padPrev = { a: false, b: false, left: false, right: false };
    this.time.delayedCall(500, () => {
      this.lock = false;
      this.padPrev = this.currentPad();
    });
  }

  // 星星一颗一颗蹦出来：每 10 分点亮一颗，每颗一声“bing”（音调逐颗升高）
  revealStar() {
    const i = this.starShown;
    if (i >= 10) {
      if (this.starTimer) { this.starTimer.remove(); this.starTimer = null; }
      this.scoreText.setText(T('scoreLine', { n: this.levelScore }));
      this.commentText.setText(scoreComment(this.levelScore));
      this.tweens.add({ targets: this.commentText, alpha: 1, duration: 400 });
      return;
    }
    const got = i < this.starTarget;          // 这一颗是不是挣到的（黄星）
    const img = this.starImgs[i];
    if (got) img.setTexture('star_full');
    img.setAlpha(1);
    this.tweens.add({
      targets: img, scale: got ? 1.28 : 0.9, duration: 220, ease: 'Back.easeOut',
      onComplete: () => this.tweens.add({ targets: img, scale: got ? 1 : 0.86, duration: 140 })
    });
    SeaAudio.starBing(i);
    this.starShown = i + 1;
    this.scoreText.setText(T('scoreLine', { n: this.starShown * 10 }));
  }

  refreshDiffUI() {
    this.diffTexts.forEach((t, i) => {
      const sel = i === this.selDiff;
      t.setText((sel ? '【' : '') + tx(DIFFICULTY_PRESETS[this.diffKeys[i]].name) + (sel ? '】' : ''));
      t.setColor(sel ? '#ffe082' : '#ffffff');
      t.setScale(sel ? 1.15 : 1);
    });
    this.diffDesc.setText(tx(DIFFICULTY_PRESETS[this.diffKeys[this.selDiff]].desc));
  }

  moveSel(d) {
    if (this.done) return;
    this.selDiff = (this.selDiff + d + this.diffKeys.length) % this.diffKeys.length;
    this.refreshDiffUI();
  }

  startWith(i) {
    if (this.done) return;
    this.selDiff = i;
    this.confirm();
  }

  confirm() {
    if (this.done) return;
    this.done = true;
    this.scene.start('GameScene', {
      levelIndex: this.levelIndex,
      players: this.players,
      difficulty: this.diffKeys[this.selDiff],
      runTime: this.runTime,
      mapKey: this.mapKey
    });
  }

  primary() {
    if (this.done) return;
    this.done = true;
    const next = (this.result === 'win' && !this.lastLevel) ? this.levelIndex + 1 : this.levelIndex;
    this.scene.start('GameScene', {
      levelIndex: next,
      players: this.players,
      difficulty: this.difficulty,
      runTime: this.runTime,
      mapKey: this.mapKey
    });
  }

  toMenu() {
    if (this.done) return;
    this.done = true;
    this.scene.start('MenuScene');
  }

  currentPad() {
    const pad = getPad(this, 0);
    return pad
      ? { a: !!pad.A, b: !!pad.B, left: !!pad.left, right: !!pad.right }
      : { a: false, b: false, left: false, right: false };
  }

  update(time, delta) {
    updateBubbles(this, this.bubbles, Math.min(delta / 1000, 0.05));
    if (this.lock || this.done) return;
    const cur = this.currentPad();
    if (this.result === 'lose') {
      if (cur.left && !this.padPrev.left) this.moveSel(-1);
      else if (cur.right && !this.padPrev.right) this.moveSel(1);
      if (cur.a && !this.padPrev.a) this.confirm();
      else if (cur.b && !this.padPrev.b) this.toMenu();
    } else {
      if (cur.a && !this.padPrev.a) this.primary();
      else if (cur.b && !this.padPrev.b) this.toMenu();
    }
    this.padPrev = cur;
  }
}
