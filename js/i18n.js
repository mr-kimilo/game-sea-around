// 多语言（i18n）：先支持中文 / 英文，界面文案和语音播报都跟着 LANG 走
// 设计：数据里的名字写成 { zh, en } 对象，用 tx() 取值；界面句子写在 TEXT 字典里，用 T(key) 取
const LANG_KEY = 'sea_around_lang';

// 语言列表：label = 菜单里显示的写法，tts = 语音合成用的语言，spoken = 切换语言时朗读的内容
const LANGS = [
  { code: 'zh', label: '中文',    tts: 'zh-CN', spoken: '中文' },
  { code: 'en', label: 'English', tts: 'en-US', spoken: 'English' }
];

let LANG = 'zh';
try {
  const saved = localStorage.getItem(LANG_KEY);
  if (LANGS.some(l => l.code === saved)) LANG = saved;
} catch (e) { /* file:// 下可能不可用，忽略 */ }

function getLang() { return LANG; }
function langObj() { return LANGS.find(l => l.code === LANG) || LANGS[0]; }
function ttsLang() { return langObj().tts; }
function langLabel() { return langObj().label; }

function setLang(code) {
  if (!LANGS.some(l => l.code === code)) return false;
  LANG = code;
  try { localStorage.setItem(LANG_KEY, code); } catch (e) { /* 忽略 */ }
  return true;
}
function toggleLang() { return setLang(LANG === 'zh' ? 'en' : 'zh'); }

// 取 { zh, en } 形式的文本
function tx(o) {
  if (o === null || o === undefined) return '';
  if (typeof o === 'string') return o;
  return o[LANG] !== undefined ? o[LANG] : (o.zh !== undefined ? o.zh : '');
}

// ---------- 数字读法：英文 one/two/…、中文 一/二/… ----------
const ZH_DIGITS = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const EN_ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function zhNumber(n) {
  n = Math.max(0, Math.round(n));
  if (n < 10) return ZH_DIGITS[n];
  if (n < 20) return '十' + (n % 10 ? ZH_DIGITS[n % 10] : '');
  return ZH_DIGITS[Math.floor(n / 10)] + '十' + (n % 10 ? ZH_DIGITS[n % 10] : '');
}

function enNumber(n) {
  n = Math.max(0, Math.round(n));
  if (n < 20) return EN_ONES[n];
  if (n < 100) {
    const o = n % 10;
    return EN_TENS[Math.floor(n / 10)] + (o ? '-' + EN_ONES[o] : '');
  }
  return String(n);
}

function numberWord(n) { return LANG === 'en' ? enNumber(n) : zhNumber(n); }

// ---------- 界面文案 ----------
const TEXT = {
  zh: {
    title: '海底吃吃乐',
    subtitle: '吃掉比你小的鱼，躲开比你大的鱼！共 20 关，每关都有新鱼登场',
    press1: '按 1 ：单人游戏',
    press2: '按 2 ：双人游戏',
    mapLabel: '选择地图（← → 切换）',
    langLabel: '语言 Language（按 L 键 / 手柄 L1·R1 / 点一下也能切）',
    keyboardHelp: '键盘：P1 = WASD 移动，J 加速，K 隐身　　P2 = 方向键移动，小键盘1(或逗号) 加速，小键盘2(或句号) 隐身　　L = 语言\n' +
      '手柄：左摇杆/十字键移动，A 加速，B 隐身（菜单里 十字键←→ 选地图，A/B=开始，L1/R1=语言）',
    soundOn: '声音：开（M 键切换）',
    soundOff: '声音：关（M 键切换）',

    // 语音
    welcome: '欢迎来到海底吃吃乐，要一个人玩，还是两个人玩？',
    player1: '一个玩家',
    player2: '两个玩家',
    fishCount: '{n}条鱼',
    sep: '，',

    // 游戏内
    level: '第 {n} 关',
    hudTop: '{map} · {level} · {diff}　目标重量：{target}',
    newFish: '新鱼登场：{name}',
    speciesInfo: '鱼种 {n}/{max}（本关新鱼：{name}）　危险鱼 {n2}/{max2}',
    weight: '重量：{n}',
    out: '出局',
    eaten: '被吃掉了！',
    dashHintP1: 'J', stealthHintP1: 'K',
    dashHintP2: '，/1', stealthHintP2: '。/2',
    dashCh: '速', stealthCh: '隐',

    // 过关 / 失败 / 通关
    levelClear: '过关啦！',
    allClear: '恭喜！20 关全部通关！',
    king: '你吃成了海底之王！',
    nextTease: '第 {n} 关会再来一种新鱼，难度也会再升一点',
    timeLine: '本关用时 {t}　累计用时 {t2}',
    scoreLine: '本关得分 {n} / 100',
    next1: '按 1 ：进入下一关',
    replay1: '按 1 ：再玩一次',
    back2: '按 2 ：返回菜单',
    padConfirm: '手柄：A 确定 / B 返回菜单',
    dead: '被吃掉了……',
    levelOf: '第 {n} 关 / 共 20 关',
    chooseDiff: '选择难度重新挑战本关：',
    diffHelp: '← → 选择难度，按 Enter / 手柄A 开始（也可直接按 1 / 2 / 3）\n按 Esc / 手柄B 返回菜单',

    victory: '全部通关！',
    praise: '你真厉害！',
    score: '得分 {n} / 100 分',
    summary: '总用时 {t} · 难度 {d} · 地图 {m}',
    option: '按 1 再玩一次　　按 2 返回菜单',
    padOption: '手柄：A 再玩一次 / B 返回菜单',
    skipHint: '通关庆祝动画播放中…… 按 空格 跳过',

    timeFmt: '{m}分{s}秒',
    praises: ['真棒！', '太棒了！', '好厉害！'],
    comments: {
      perfect: '完美！你就是海底之王！',
      great: '非常棒！游得又快又稳！',
      good: '很棒哦！再快一点就更好啦',
      ok: '不错！多练练会更快',
      low: '慢慢来，下次一定更快！'
    }
  },

  en: {
    title: 'Undersea Yum Yum',
    subtitle: 'Eat smaller fish, dodge bigger fish! 20 levels, a new fish each level',
    press1: 'Press 1: one player',
    press2: 'Press 2: two players',
    mapLabel: 'Choose a map (← → to switch)',
    langLabel: 'Language 语言 (key L / gamepad L1·R1 / or tap it)',
    keyboardHelp: 'Keyboard: P1 = WASD + J dash + K hide　　P2 = arrows + Numpad1(,) dash + Numpad2(.) hide\n' +
      'L = language　　Gamepad: stick/D-pad move, A dash, B hide　　Menu: ←→ map, A/B = start, L1/R1 = language',
    soundOn: 'Sound: on (press M)',
    soundOff: 'Sound: off (press M)',

    welcome: 'Welcome to Undersea Yum Yum! How many players? One or two?',
    player1: 'One player',
    player2: 'Two players',
    fishCount: '{n} fish',
    sep: ', ',

    level: 'Level {n}',
    hudTop: '{map} · {level} · {diff}　Target weight: {target}',
    newFish: 'New fish: {name}',
    speciesInfo: 'Fish types {n}/{max} (new: {name})　Big fish {n2}/{max2}',
    weight: 'Weight: {n}',
    out: 'Out',
    eaten: 'Eaten!',
    dashHintP1: 'J', stealthHintP1: 'K',
    dashHintP2: ', / 1', stealthHintP2: '. / 2',
    dashCh: 'D', stealthCh: 'H',

    levelClear: 'Level Clear!',
    allClear: 'Congratulations! All 20 levels cleared!',
    king: 'You are the king of the sea!',
    nextTease: 'Level {n} brings a new fish and a little more challenge',
    timeLine: 'This level {t}　Total {t2}',
    scoreLine: 'Level score {n} / 100',
    next1: 'Press 1: next level',
    replay1: 'Press 1: play again',
    back2: 'Press 2: back to menu',
    padConfirm: 'Gamepad: A confirm / B back to menu',
    dead: 'You were eaten…',
    levelOf: 'Level {n} of 20',
    chooseDiff: 'Pick a difficulty to try this level again:',
    diffHelp: '← → pick difficulty, Enter / gamepad A to start (or press 1 / 2 / 3)\n' +
      'Esc / gamepad B to go back to the menu',

    victory: 'All Cleared!',
    praise: 'You are amazing!',
    score: 'Score {n} / 100',
    summary: 'Total time {t} · Difficulty {d} · Map {m}',
    option: 'Press 1 to play again　　Press 2 for the menu',
    padOption: 'Gamepad: A play again / B menu',
    skipHint: 'Celebration playing… press Space to skip',

    timeFmt: '{m}m {s}s',
    praises: ['Yes!', 'Very good!', 'Unbelievable!'],
    comments: {
      perfect: 'Perfect! You are the king of the sea!',
      great: 'Awesome! Fast and steady!',
      good: 'Great! A little faster would be even better',
      ok: 'Nice! Practice makes you faster',
      low: 'Take your time, you will be faster next time!'
    }
  }
};

// 取界面文案，{key} 用 vars 里的值替换
function T(key, vars) {
  const pack = TEXT[LANG] || TEXT.zh;
  let s = pack[key];
  if (s === undefined) s = TEXT.zh[key];
  if (s === undefined) return key;
  if (typeof s === 'string' && vars) {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined ? m : String(vars[k])));
  }
  return s;
}

function praiseWord(idx) {
  const list = T('praises');
  const arr = Array.isArray(list) ? list : TEXT.zh.praises;
  return arr[((idx % arr.length) + arr.length) % arr.length];
}
