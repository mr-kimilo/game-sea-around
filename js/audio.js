// 程序化音效：海底水泡 + 海浪 + 大鱼登场的“叮叮叮”
// 全部用 Web Audio 实时合成，不依赖任何音频文件（file:// 直接打开也能出声）
const SeaAudio = (() => {
  const MUTE_KEY = 'sea_around_muted';
  const DING_LOCK = 0.5;      // 两串“叮叮叮”之间的最小间隔（秒），防止叠成一团
  const WAVES_ENABLED = false; // 海浪已按要求关闭，只保留水泡声（想要回海浪改成 true 即可）

  let ctx = null;
  let master = null;          // 总音量：静音开关作用在这一层
  let ambBus = null;          // 环境音总线：海浪 + 水泡
  let sfxBus = null;          // 音效总线：叮叮叮
  let waves = null;           // 海浪的持续音源
  let bubbleTimer = null;     // 水泡的随机调度
  let ambientOn = false;
  let unlocked = false;
  let muted = false;
  let lastDingAt = -10;
  let dingCount = 0;
  let bound = false;
  const hints = [];

  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { muted = false; }

  // ---------- 底层 ----------

  // 优先复用 Phaser 的 AudioContext，拿不到就自己建一个
  function ensureCtx(scene) {
    if (ctx) return ctx;
    try {
      if (scene && scene.sound && scene.sound.context) ctx = scene.sound.context;
    } catch (e) { /* 退回自建 */ }
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ctx.destination);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.55; ambBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 1;    sfxBus.connect(master);
    return ctx;
  }

  // 粉红噪声缓冲：低通之后就是海浪的“沙沙”声
  function noiseBuffer(seconds) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
    }
    // 首尾交叉淡化，循环时听不到接缝
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      d[len - fade + i] = d[len - fade + i] * (1 - t) + d[i] * t;
    }
    return buf;
  }

  // ---------- 环境音 1：海浪 ----------
  function startWaves() {
    if (!ctx || waves) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(4);
    src.loop = true;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 110;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 480; lp.Q.value = 0.7;

    const g = ctx.createGain();
    g.gain.value = 0.34;

    // 潮汐：慢速 LFO 让音量和亮度一来一回，像海浪一层层涌上来
    const swell = ctx.createOscillator(); swell.frequency.value = 0.07;   // 约 14 秒一个来回
    const swellAmt = ctx.createGain();    swellAmt.gain.value = 0.2;
    swell.connect(swellAmt); swellAmt.connect(g.gain);

    const lfo = ctx.createOscillator();   lfo.frequency.value = 0.043;
    const lfoAmt = ctx.createGain();      lfoAmt.gain.value = 200;
    lfo.connect(lfoAmt); lfoAmt.connect(lp.frequency);

    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(ambBus);
    src.start(); swell.start(); lfo.start();
    waves = { src, g, swell, lfo };
  }

  // ---------- 环境音 2：水泡 ----------
  // 单个水泡：正弦波快速上滑 + 极短包络 = “咕噜”一声
  function bubbleBlip() {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.02;
    const f0 = 300 + Math.random() * 560;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * 2.4, t + 0.1);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 + Math.random() * 0.16, t + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);

    osc.connect(g); g.connect(ambBus);
    osc.start(t); osc.stop(t + 0.18);
  }

  function bubbleLoop() {
    if (!ambientOn) return;
    // 静音或上下文没跑起来时只做空转调度，避免恢复时一起炸出来
    if (!muted && ctx && ctx.state === 'running') {
      const n = Math.random() < 0.35 ? 2 + Math.floor(Math.random() * 2) : 1;
      for (let i = 0; i < n; i++) setTimeout(bubbleBlip, i * (60 + Math.random() * 90));
    }
    bubbleTimer = setTimeout(bubbleLoop, 280 + Math.random() * 900);
  }

  function startAmbient() {
    if (!ctx || ambientOn) return;
    ambientOn = true;
    if (WAVES_ENABLED) startWaves();   // 海浪：默认关闭
    bubbleLoop();                      // 水泡：只留它
  }

  function stopAmbient() {
    ambientOn = false;
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null; }
    if (waves) {
      try { waves.src.stop(); waves.swell.stop(); waves.lfo.stop(); } catch (e) { /* 忽略 */ }
      waves = null;
    }
  }

  // ---------- 音效：大鱼登场“叮叮叮” ----------
  // 一个铃音 = 基频 + 几个非整数倍泛音，快速衰减
  function bell(t, freq, level, dur) {
    const life = dur === undefined ? 0.5 : dur;
    const out = ctx.createGain();
    out.gain.value = level;
    out.connect(sfxBus);
    const partials = [[1, 1], [2.01, 0.45], [2.76, 0.26], [5.4, 0.1]];
    for (const [mult, amp] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * mult;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + life / (mult > 2 ? 2 : 1));
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + life + 0.1);
    }
    // 起音的一点金属感
    const nb = ctx.createBufferSource();
    nb.buffer = noiseBuffer(0.05);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq * 2.5; bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.14, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    nb.connect(bp); bp.connect(ng); ng.connect(out);
    nb.start(t); nb.stop(t + 0.06);
  }

  // 星星一颗一颗蹦出来时的“bing”：一声比一声高（大调音阶）
  const STAR_STEPS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16];
  function starBing(i) {
    if (!ctx || muted) return;
    const k = Math.max(0, Math.min(STAR_STEPS.length - 1, i | 0));
    bell(ctx.currentTime + 0.01, 1046.5 * Math.pow(2, STAR_STEPS[k] / 12), 0.13, 0.3);
  }

  // ---------- 语音播报：语言跟着 LANG 走（中/英文，见 i18n.js） ----------
  let praiseIdx = 0;
  let sayCount = 0;
  let lastSay = '';
  let lastEatAt = -1e9;
  let praiseCount = 0;
  let spokeCount = 0;
  let lastPraiseMs = -1e9;
  let speakStartedMs = 0;
  const SPEAK_WATCHDOG = 2500;   // 语音卡住超过这么久就清掉（例如没有声音设备时 onend 不会来）

  const nowMs = () => ((window.performance && performance.now) ? performance.now() : Date.now());

  function ttsReady() {
    return !!(window.speechSynthesis && typeof window.SpeechSynthesisUtterance === 'function');
  }

  // 有些浏览器能建 utterance，但系统里一条语音都没有（会完全没声音）→ 这种算“不可用”，退回小音效
  function ttsUsable() {
    if (!ttsReady()) return false;
    return ((window.speechSynthesis.getVoices && window.speechSynthesis.getVoices()) || []).length > 0;
  }

  function ttsBusy() {
    const ss = window.speechSynthesis;
    return !!(ss && (ss.speaking || ss.pending));
  }

  // 按语言挑一个系统语音（中文用 zh-CN，英文用 en-US）
  function pickVoice(lang) {
    const ss = window.speechSynthesis;
    const list = (ss && ss.getVoices && ss.getVoices()) || [];
    if (!list.length) return null;
    const pre = lang.slice(0, 2).toLowerCase();
    return list.find(v => String(v.lang || '').toLowerCase().replace('_', '-').startsWith(pre)) || null;
  }

  function speak(text, lang) {
    const ss = window.speechSynthesis;
    const u = new window.SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 1.1;
    u.pitch = 1.4;      // 童趣一点的高音
    u.volume = 1;
    const v = pickVoice(lang);
    if (v) { try { u.voice = v; } catch (e) { /* 某些环境不接受这个 voice，用默认  */ } }
    try { ss.speak(u); } catch (e) { return false; }
    return true;
  }

  // 没有语音合成时退回一段上扬小音效，保证“吃到鱼一定有反馈”
  function cheer() {
    if (!ctx) return;
    const now = ctx.currentTime;
    [1046.5, 1318.51, 1567.98].forEach((f, i) => bell(now + 0.02 + i * 0.07, f, 0.16, 0.26));
  }

  // 每吃掉一条鱼叫一声：按当前语言播报数量（one/two/three… 或 一条鱼/二条鱼…），
  // 每满 3 条再跟一句夸奖（真棒！/ Yes! / Very good! / Unbelievable! 循环）
  function eatFish(n) {
    if (muted) return false;
    const ms = nowMs();
    if (ms - lastEatAt < 700) return false;    // 连吃几条鱼时不至于吵成一团
    lastEatAt = ms;
    praiseCount++;
    const count = T('fishCount', { n: numberWord(n) });
    const text = (n > 0 && n % 3 === 0) ? count + T('sep') + praiseWord(praiseIdx++) : count;
    return say(text, { interrupt: true });
  }

  // 菜单欢迎语（第一次按键/点击后才播得出来）
  function welcome() {
    return say(T('welcome'), { interrupt: true });
  }

  // 保留旧接口：只播一句夸奖
  function praise() {
    return say(praiseWord(praiseIdx++), { interrupt: true });
  }

  // 通用播报：interrupt=true 时打断上一句（切换地图/语言、开始游戏这类即时反馈用）
  function say(text, opts) {
    opts = opts || {};
    if (muted || !text) return false;
    const lang = opts.lang || ttsLang();
    if (!ttsUsable()) {
      if (opts.chime !== false) cheer();       // 没有语音合成时用音效代替
      return false;
    }
    const ms = nowMs();
    if (ttsBusy()) {
      const stale = speakStartedMs && ms - speakStartedMs > SPEAK_WATCHDOG;
      if (!opts.interrupt && !stale) return false;
      try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
      speakStartedMs = 0;
    }
    if (speak(text, lang)) {
      sayCount++; lastSay = text; spokeCount++; speakStartedMs = ms;
      return true;
    }
    cheer();
    return false;
  }

  // 大鱼出现时：三声上行铃音（叮·叮·叮），醒目不刺耳
  function ding() {
    if (!ctx || muted) return;
    const now = ctx.currentTime;
    if (now - lastDingAt < DING_LOCK) return;
    lastDingAt = now;
    dingCount++;
    const notes = [880, 1108.73, 1318.51];   // A5 / C#6 / E6
    notes.forEach((f, i) => bell(now + 0.02 + i * 0.14, f, 0.17));
  }

  // ---------- 静音开关 ----------
  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch (e) { /* 忽略 */ }
    if (muted && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
      speakStartedMs = 0;
    }
    if (ctx && master) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(muted ? 0 : 1, t + 0.25);
    }
    hints.forEach(fn => fn(muted));
  }

  function toggleMute() { setMuted(!muted); }

  // 右下角的小提示，切换静音时自动更新，场景销毁时自动移除
  function addHint(scene) {
    if (!scene || !scene.add) return;
    const txt = scene.add.text(GAME_W - 12, GAME_H - 20, '', {
      fontSize: '13px', color: '#9fc6e8', stroke: '#00253f', strokeThickness: 3
    }).setOrigin(1, 0.5).setDepth(999);
    const upd = m => {
      txt.setText(m ? T('soundOff') : T('soundOn'));
      txt.setColor(m ? '#7d8896' : '#9fc6e8');
    };
    upd(muted);
    hints.push(upd);
    scene.events.once('shutdown', () => {
      const i = hints.indexOf(upd);
      if (i >= 0) hints.splice(i, 1);
    });
  }

  // ---------- 解锁与绑定 ----------
  // 浏览器要求先有用户操作才能出声，所以在第一次按键/点击时才真正开始播
  function tryUnlock() {
    if (!ctx) return;
    if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
    unlocked = true;
    startAmbient();
  }

  function onKey(e) {
    tryUnlock();
    if (e.key === 'm' || e.key === 'M') toggleMute();
  }

  function bindGlobal() {
    if (bound) return;
    bound = true;
    window.addEventListener('pointerdown', tryUnlock);
    window.addEventListener('touchstart', tryUnlock);
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && unlocked && ctx && ctx.state === 'suspended') ctx.resume();
    });
  }

  // 场景调用：准备好音频、绑定首次交互、必要时直接开播环境音
  function init(scene) {
    if (!ensureCtx(scene)) return false;
    bindGlobal();
    if (ctx.state === 'running') unlocked = true;
    if (unlocked) startAmbient();
    return true;
  }

  // 自检用状态（调试/验证）
  function state() {
    return {
      available: !!ctx,
      ctxState: ctx ? ctx.state : 'none',
      unlocked, muted, ambientOn,
      wavesEnabled: WAVES_ENABLED,
      waves: !!waves,
      bubbleLoop: bubbleTimer !== null,
      masterGain: master ? master.gain.value : null,
      dingCount,
      tts: ttsReady(),
      ttsUsable: ttsUsable(),
      ttsVoices: ttsReady() ? (window.speechSynthesis.getVoices() || []).length : 0,
      praiseCount, spokeCount,
      lang: LANG, ttsLang: ttsLang(), sayCount, lastSay,
      lastPraise: praiseWord(praiseIdx - 1)
    };
  }

  return { init, addHint, ding, starBing, praise, eatFish, say, welcome, toggleMute, setMuted,
           isMuted: () => muted, startAmbient, stopAmbient, state, unlock: tryUnlock };
})();
