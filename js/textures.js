// 程序化纹理生成与场景共用工具
const GAME_W = 960, GAME_H = 540;   // 逻辑分辨率（游戏代码统一用这两个常量）
const HD_ZOOM = 2;                  // 高清渲染：画布缓冲 = 逻辑尺寸 × HD_ZOOM
const FW = 160, FH = 96;            // 鱼的画布尺寸
const FCY = FH / 2;                 // 画布中心 = 鱼身中心
const FISH_TEX_SS = 3;              // 鱼纹理超采样：3 倍生成，显示时缩回，画面不再模糊
const FISH_DRAW_SCALE = 0.72 / FISH_TEX_SS;   // 画布变大后的整体缩放修正
const PLAYER_TEX_SS = 2;            // 玩家纹理超采样倍数
let TEX_SS = 1;                     // 当前绘图倍率：仅生成纹理期间临时提高，画完恢复
const PUPIL = 0x222233;

// ---------- 地图：三种海底世界（菜单里 ← → 切换） ----------
const MAPS = {
  tropical:    { name: { zh: '热带',   en: 'Tropical' },
                 desc: { zh: '温暖的海域，长满海草和珊瑚', en: 'Warm waters full of seaweed and coral' } },
  subtropical: { name: { zh: '亚热带', en: 'Subtropical' },
                 desc: { zh: '浅海沙地，到处都是石头和细沙', en: 'Shallow sandy sea, with rocks and fine sand everywhere' } },
  arctic:      { name: { zh: '北极',   en: 'Arctic' },
                 desc: { zh: '安静的冰海，阳光洒下来波光粼粼', en: 'Quiet icy sea, sunlight sparkling on the water' } }
};
const MAP_KEYS = Object.keys(MAPS);

// 地图 key 兜底：优先用传入的，否则用注册表里上次选的，最后是热带
function getMapKey(scene, key) {
  if (MAPS[key]) return key;
  const saved = scene.registry.get('mapKey');
  return MAPS[saved] ? saved : 'tropical';
}

// ---------- 鱼类图鉴：每过一关解锁一种新鱼（索引 = 关卡序 - 1） ----------
// r = 碰撞半径基准（画布像素），shape 决定外形
const FISH_SPECIES = [
  { name: { zh: '条纹小鱼',   en: 'Striped Fish' },  shape: 'basic',     body: 0xff6b6b, accent: 0xfff3b0, r: 33 },
  { name: { zh: '圆河豚',     en: 'Pufferfish' },    shape: 'puffer',    body: 0xffb84d, accent: 0xfff0c0, r: 36 },
  { name: { zh: '小水母',     en: 'Jellyfish' },     shape: 'jellyfish', body: 0xb983ff, accent: 0xecd9ff, r: 32 },
  { name: { zh: '旗鱼',       en: 'Sailfish' },      shape: 'swordfish', body: 0x4ea8ff, accent: 0xd8ecff, r: 34 },
  { name: { zh: '小章鱼',     en: 'Octopus' },       shape: 'octopus',   body: 0xff9ff3, accent: 0xffe0fa, r: 33 },
  { name: { zh: '比目鱼',     en: 'Flounder' },      shape: 'flounder',  body: 0x8fd14f, accent: 0xe9f9c9, r: 36 },
  { name: { zh: '银带鱼',     en: 'Ribbonfish' },    shape: 'ribbon',    body: 0xd8e6f2, accent: 0x8fa6bb, r: 32 },
  { name: { zh: '小海龟',     en: 'Sea Turtle' },    shape: 'turtle',    body: 0x3fbf7f, accent: 0x2b7f57, r: 34 },
  { name: { zh: '鲨鱼',       en: 'Shark' },         shape: 'shark',     body: 0x9aa7b4, accent: 0xe8eef4, r: 36 },
  { name: { zh: '灯笼鱼',     en: 'Anglerfish' },    shape: 'angler',    body: 0x2f4858, accent: 0x9ff5ff, r: 38 },
  { name: { zh: '鲸鱼宝宝',   en: 'Baby Whale' },    shape: 'whale',     body: 0x6fb7ff, accent: 0xd9ecff, r: 40 },
  { name: { zh: '海星',       en: 'Starfish' },      shape: 'star',      body: 0xff8a5c, accent: 0xffd9a8, r: 36 },
  { name: { zh: '电鳗',       en: 'Electric Eel' },  shape: 'eel',       body: 0xffe14d, accent: 0x8a6a00, r: 32 },
  { name: { zh: '独角鲸',     en: 'Narwhal' },       shape: 'narwhal',   body: 0x7fd4ff, accent: 0xffffff, r: 36 },
  { name: { zh: '食人鱼',     en: 'Piranha' },       shape: 'piranha',   body: 0xd63b3b, accent: 0xffe0e0, r: 34 },
  { name: { zh: '小螃蟹',     en: 'Little Crab' },   shape: 'crab',      body: 0xe8623c, accent: 0xffd0b8, r: 37 },
  { name: { zh: '龙鱼',       en: 'Dragon Fish' },   shape: 'dragon',    body: 0xff4fa3, accent: 0xffd166, r: 36 },
  { name: { zh: '铁甲鱼',     en: 'Armored Fish' },  shape: 'armored',   body: 0x6b7280, accent: 0xcbd5e1, r: 38 },
  { name: { zh: '深海巨口鱼', en: 'Gulper Fish' },   shape: 'gulper',    body: 0x2b3348, accent: 0xa8d8ff, r: 40 },
  { name: { zh: '黄金鱼王',   en: 'Golden Fish King' }, shape: 'king',   body: 0xffd54a, accent: 0xff6b6b, r: 37 }
];
const MAX_SPECIES = FISH_SPECIES.length;
const FISH_COLORS = FISH_SPECIES.map(s => s.body);

// 难度预设：speed 鱼速倍率，bigRatio 大鱼上限倍率，cd 技能冷却倍率，interval 大鱼放出间隔倍率
// parMul = 关内评分的“标准用时”倍率（越难给的时间越宽松）
const DIFFICULTY_PRESETS = {
  easy:   { name: { zh: '简单', en: 'Easy' }, desc: { zh: '鱼更慢，大鱼更少，技能冷却更短', en: 'Slower fish, fewer big fish, shorter skill cooldowns' }, speed: 0.8, bigRatio: 0.6, cd: 0.8, interval: 1.4, parMul: 0.9 },
  normal: { name: { zh: '普通', en: 'Normal' }, desc: { zh: '标准体验', en: 'The standard challenge' }, speed: 1, bigRatio: 1, cd: 1, interval: 1, parMul: 1 },
  hard:   { name: { zh: '困难', en: 'Hard' }, desc: { zh: '鱼更快，大鱼更多，技能冷却更长', en: 'Faster fish, more big fish, longer skill cooldowns' }, speed: 1.2, bigRatio: 1.5, cd: 1.2, interval: 0.7, parMul: 1.25 }
};

// ---------- 绘图小工具（坐标与线宽都乘以 TEX_SS，供纹理超采样） ----------
function poly(g, color, pts, alpha) {
  g.fillStyle(color, alpha === undefined ? 1 : alpha);
  g.fillPoints(pts.map(p => ({ x: p[0] * TEX_SS, y: p[1] * TEX_SS })), true);
}
function tri(g, color, x1, y1, x2, y2, x3, y3) {
  g.fillStyle(color, 1);
  g.fillTriangle(x1 * TEX_SS, y1 * TEX_SS, x2 * TEX_SS, y2 * TEX_SS, x3 * TEX_SS, y3 * TEX_SS);
}
function stroke(g, color, w, pts, alpha) {
  g.lineStyle(w * TEX_SS, color, alpha === undefined ? 1 : alpha);
  g.beginPath();
  g.moveTo(pts[0][0] * TEX_SS, pts[0][1] * TEX_SS);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0] * TEX_SS, pts[i][1] * TEX_SS);
  g.strokePath();
}
function dot(g, color, x, y, r, alpha) {
  g.fillStyle(color, alpha === undefined ? 1 : alpha);
  g.fillCircle(x * TEX_SS, y * TEX_SS, r * TEX_SS);
}
function oval(g, color, x, y, w, h, alpha) {
  g.fillStyle(color, alpha === undefined ? 1 : alpha);
  g.fillEllipse(x * TEX_SS, y * TEX_SS, w * TEX_SS, h * TEX_SS);
}
function eye(g, x, y, r, pupil) {
  dot(g, 0xffffff, x, y, r);
  dot(g, pupil === undefined ? PUPIL : pupil, x - r * 0.35, y, r * 0.5);
}

// ---------- 每种鱼的外形（统一朝左，头在左、尾在右） ----------
const SHAPES = {
  // 1 条纹小鱼
  basic(g, s) {
    tri(g, s.body, 94, FCY, 138, 26, 138, 70);          // 尾鳍根部压在身体里，不能悬空
    oval(g, s.body, 66, FCY, 80, 54);
    poly(g, s.accent, [[52, 28], [59, 26], [59, 70], [52, 72]]);
    poly(g, s.accent, [[67, 24], [74, 23], [74, 73], [67, 72]]);
    poly(g, s.accent, [[82, 27], [89, 28], [89, 68], [82, 69]]);
    eye(g, 42, 40, 7);
  },
  // 2 圆河豚
  puffer(g, s) {
    const cx = 78, cy = FCY, R = 33;
    tri(g, s.body, 94, cy, 136, 24, 136, 72);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2, a1 = a - 0.1, a2 = a + 0.1;
      poly(g, s.accent, [
        [cx + Math.cos(a1) * (R - 8), cy + Math.sin(a1) * (R - 8)],
        [cx + Math.cos(a2) * (R - 8), cy + Math.sin(a2) * (R - 8)],
        [cx + Math.cos(a) * (R + 12), cy + Math.sin(a) * (R + 12)]
      ]);
    }
    dot(g, s.body, cx, cy, R);
    dot(g, 0xffffff, cx - 14, cy + 10, 10, 0.5);
    eye(g, cx - 12, cy - 12, 6);
    eye(g, cx + 14, cy - 12, 6);
    dot(g, 0x8a4a00, cx + 1, cy + 16, 4);
  },
  // 3 小水母
  jellyfish(g, s) {
    const pts = [[46, 48]];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI + (i / 16) * Math.PI;
      pts.push([78 + Math.cos(a) * 32, 48 + Math.sin(a) * 32]);
    }
    pts.push([110, 48]);
    for (let i = 0; i < 5; i++) {
      const x = 52 + i * 13;
      stroke(g, i % 2 ? s.accent : s.body, 4, [[x, 46], [x - 5, 62], [x + 5, 74], [x - 3, 86]]);
    }
    poly(g, s.body, pts);
    dot(g, s.accent, 78, 24, 6, 0.7);
    eye(g, 66, 36, 6);
    eye(g, 90, 36, 6);
  },
  // 4 旗鱼
  swordfish(g, s) {
    poly(g, s.body, [[6, 46], [52, 40], [52, 56]]);
    poly(g, s.accent, [[58, 30], [96, 6], [114, 32]]);
    oval(g, s.body, 80, FCY, 78, 42);
    poly(g, s.body, [[100, FCY], [152, 20], [152, 76]]);   // 尾鳍（原来整块悬在身体上方）
    poly(g, s.accent, [[76, 64], [98, 86], [70, 68]]);
    eye(g, 34, 44, 6);
  },
  // 5 小章鱼
  octopus(g, s) {
    stroke(g, s.body, 9, [[60, 58], [50, 72], [58, 86]]);
    stroke(g, s.body, 9, [[74, 62], [70, 78], [78, 88]]);
    stroke(g, s.body, 9, [[92, 62], [96, 78], [88, 88]]);
    stroke(g, s.body, 9, [[104, 58], [114, 72], [104, 86]]);
    oval(g, s.body, 80, 40, 66, 56);
    dot(g, s.accent, 62, 56, 5, 0.6);
    dot(g, s.accent, 98, 56, 5, 0.6);
    eye(g, 66, 34, 7);
    eye(g, 94, 34, 7);
  },
  // 6 比目鱼
  flounder(g, s) {
    poly(g, s.body, [[14, 50], [40, 26], [86, 18], [130, 32], [146, 48], [112, 70], [58, 76], [26, 66]]);
    poly(g, s.accent, [[132, 48], [158, 32], [158, 64]]);
    dot(g, s.accent, 74, 46, 5);
    dot(g, s.accent, 96, 38, 4);
    dot(g, s.accent, 104, 58, 4);
    eye(g, 46, 36, 7);
    eye(g, 68, 32, 7);
  },
  // 7 银带鱼
  ribbon(g, s) {
    poly(g, s.body, [[10, 48], [42, 34], [112, 36], [154, 48], [112, 60], [42, 62]]);
    stroke(g, s.accent, 3, [[18, 48], [146, 48]]);
    poly(g, s.accent, [[58, 36], [88, 22], [116, 36]]);
    eye(g, 26, 46, 6);
  },
  // 8 小海龟
  turtle(g, s) {
    oval(g, s.body, 62, 76, 34, 18);
    oval(g, s.body, 110, 74, 30, 16);
    oval(g, s.body, 100, 24, 28, 14);
    poly(g, s.body, [[110, 48], [148, 40], [146, 56]]);
    dot(g, s.body, 38, 52, 14);
    oval(g, s.body, 84, 46, 78, 56);
    stroke(g, s.accent, 3, [[84, 20], [84, 72]]);
    stroke(g, s.accent, 3, [[50, 34], [118, 34]]);
    stroke(g, s.accent, 3, [[50, 58], [118, 58]]);
    eye(g, 34, 48, 5);
  },
  // 9 鲨鱼
  shark(g, s) {
    poly(g, s.body, [[8, 50], [44, 30], [100, 30], [136, 42], [142, 50], [102, 66], [46, 68]]);
    poly(g, s.body, [[64, 31], [92, 4], [112, 31]]);
    poly(g, s.body, [[62, 64], [88, 90], [106, 60]]);
    poly(g, s.body, [[130, 44], [158, 20], [150, 48], [158, 76]]);
    poly(g, s.accent, [[46, 60], [100, 60], [124, 50], [100, 64], [46, 66]]);
    stroke(g, s.accent, 2, [[56, 40], [56, 58]]);
    stroke(g, s.accent, 2, [[64, 38], [64, 60]]);
    eye(g, 26, 44, 6);
  },
  // 10 灯笼鱼
  angler(g, s) {
    poly(g, s.body, [[86, 26], [128, 34], [128, 64], [86, 70]]);
    oval(g, s.body, 62, 50, 76, 64);
    stroke(g, s.body, 3, [[48, 22], [46, 8], [58, 4]]);
    dot(g, s.accent, 60, 5, 11, 0.3);
    dot(g, s.accent, 60, 5, 6);
    poly(g, 0x0b1a24, [[26, 50], [70, 44], [72, 66], [30, 64]]);
    for (let i = 0; i < 5; i++) {
      const x = 30 + i * 9;
      tri(g, s.accent, x, 50, x + 6, 50, x + 3, 58);
    }
    eye(g, 48, 32, 7, 0xfff6c0);
  },
  // 11 鲸鱼宝宝
  whale(g, s) {
    poly(g, s.body, [[120, 44], [154, 22], [146, 48], [154, 72]]);
    oval(g, s.body, 76, FCY, 104, 58);
    oval(g, s.accent, 74, 63, 84, 20);
    poly(g, s.body, [[66, 62], [88, 86], [58, 68]]);
    stroke(g, s.accent, 3, [[58, 22], [54, 8]]);
    dot(g, s.accent, 50, 5, 5);
    dot(g, s.accent, 57, 4, 4);
    eye(g, 34, 44, 6);
  },
  // 12 海星
  star(g, s) {
    const cx = 80, cy = 47, pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 40 : 17;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    poly(g, s.body, pts);
    dot(g, s.accent, cx, cy, 9, 0.75);
    eye(g, cx - 9, cy - 4, 6);
    eye(g, cx + 9, cy - 4, 6);
  },
  // 13 电鳗
  eel(g, s) {
    stroke(g, s.body, 15, [[18, 54], [44, 36], [74, 56], [104, 36], [134, 52]]);
    stroke(g, s.accent, 3, [[26, 52], [38, 44], [50, 50], [62, 50], [74, 50], [86, 44], [98, 42], [112, 46], [126, 50]]);
    dot(g, s.body, 20, 52, 13);
    eye(g, 15, 47, 5);
    stroke(g, s.body, 6, [[134, 52], [156, 44]]);
  },
  // 14 独角鲸
  narwhal(g, s) {
    poly(g, s.accent, [[44, 42], [4, 14], [46, 50]]);
    poly(g, s.body, [[118, 44], [152, 22], [144, 48], [152, 72]]);
    oval(g, s.body, 78, FCY, 100, 54);
    oval(g, s.accent, 76, 60, 76, 18);
    poly(g, s.body, [[72, 62], [94, 86], [64, 68]]);
    dot(g, s.accent, 96, 40, 4);
    eye(g, 44, 42, 6);
  },
  // 15 食人鱼
  piranha(g, s) {
    tri(g, s.body, 94, FCY, 140, 22, 140, 74);          // 尾鳍根部压在身体里，不能悬空
    oval(g, s.body, 70, FCY, 78, 58);
    poly(g, 0x2a0808, [[30, 52], [78, 50], [78, 70], [30, 68]]);
    for (let i = 0; i < 5; i++) {
      const x = 34 + i * 9;
      tri(g, s.accent, x, 52, x + 7, 52, x + 3.5, 62);
    }
    eye(g, 46, 36, 8, 0x7a1010);
  },
  // 16 小螃蟹
  crab(g, s) {
    stroke(g, s.body, 6, [[58, 30], [34, 16], [18, 24]]);
    stroke(g, s.body, 6, [[102, 30], [126, 16], [142, 24]]);
    stroke(g, s.body, 6, [[56, 44], [28, 40], [14, 46]]);
    stroke(g, s.body, 6, [[104, 44], [132, 40], [146, 46]]);
    stroke(g, s.body, 6, [[60, 64], [36, 74], [24, 88]]);
    stroke(g, s.body, 6, [[100, 64], [124, 74], [136, 88]]);
    poly(g, s.body, [[18, 26], [4, 12], [26, 10], [24, 28]]);
    poly(g, s.body, [[142, 26], [156, 12], [134, 10], [136, 28]]);
    oval(g, s.body, 80, FCY, 74, 50);
    dot(g, s.accent, 66, 40, 5, 0.7);
    dot(g, s.accent, 94, 40, 5, 0.7);
    dot(g, s.accent, 80, 56, 5, 0.7);
    stroke(g, s.body, 4, [[72, 26], [70, 16]]);
    stroke(g, s.body, 4, [[88, 26], [90, 16]]);
    dot(g, 0xffffff, 70, 14, 6);
    dot(g, 0xffffff, 90, 14, 6);
    dot(g, PUPIL, 70, 14, 3);
    dot(g, PUPIL, 90, 14, 3);
  },
  // 17 龙鱼
  dragon(g, s) {
    poly(g, s.body, [[6, 48], [42, 28], [104, 30], [138, 46], [104, 64], [42, 66]]);
    // 背鳍沿背线插下 8px，避免最后一片悬空断开
    const backEdge = x => (x <= 104 ? 28 + (x - 42) * (2 / 62) : 30 + (x - 104) * (16 / 34));
    for (let i = 0; i < 5; i++) {
      const x = 46 + i * 17, yb = backEdge(x) + 8;
      tri(g, s.accent, x, yb, x + 15, yb, x + 7.5, yb - 24);
    }
    poly(g, s.accent, [[58, 60], [42, 88], [78, 64]]);
    poly(g, s.body, [[134, 46], [158, 22], [152, 46], [158, 70]]);
    dot(g, s.accent, 70, 48, 4);
    dot(g, s.accent, 88, 48, 4);
    eye(g, 24, 42, 7, 0xffe066);
  },
  // 18 铁甲鱼
  armored(g, s) {
    poly(g, s.body, [[10, 48], [38, 24], [104, 24], [142, 48], [104, 72], [38, 72]]);
    for (let i = 0; i < 3; i++) {
      const x = 54 + i * 22;
      tri(g, s.accent, x, 25, x + 14, 25, x + 7, 8);
    }
    for (let i = 0; i < 4; i++) {
      const x = 46 + i * 20;
      stroke(g, s.accent, 3, [[x, 30], [x, 66]]);
    }
    dot(g, s.accent, 84, 40, 4);
    dot(g, s.accent, 84, 56, 4);
    eye(g, 30, 44, 6);
  },
  // 19 深海巨口鱼
  gulper(g, s) {
    poly(g, s.body, [[64, 36], [116, 28], [156, 46], [120, 72], [66, 62]]);
    dot(g, s.accent, 88, 44, 4, 0.9);
    dot(g, s.accent, 106, 40, 5, 0.9);
    dot(g, s.accent, 126, 44, 6, 0.9);
    poly(g, 0x070b14, [[2, 42], [66, 26], [72, 68], [6, 62]]);
    for (let i = 0; i < 6; i++) {
      const x = 10 + i * 10;
      tri(g, s.accent, x, 44, x + 8, 44, x + 4, 33);
      tri(g, s.accent, x, 56, x + 8, 56, x + 4, 65);
    }
    eye(g, 62, 26, 6, 0xfff2a8);
  },
  // 20 黄金鱼王
  king(g, s) {
    poly(g, s.accent, [[40, 22], [46, 2], [56, 16], [66, 0], [78, 16], [88, 2], [96, 22]]);
    poly(g, s.body, [[94, 40], [148, 8], [148, 46]]);     // 上尾鳍（根部压进身体）
    poly(g, s.body, [[94, 56], [148, 88], [148, 50]]);    // 下尾鳍（根部压进身体）
    oval(g, s.body, 72, FCY, 92, 58);
    poly(g, s.accent, [[58, 72], [86, 92], [46, 78]]);
    stroke(g, s.accent, 3, [[40, 30], [64, 24], [84, 32]]);
    stroke(g, s.accent, 3, [[38, 62], [62, 68], [84, 60]]);
    eye(g, 42, 40, 8);
  }
};

function makeSpecies(scene, key, spec) {
  const g = scene.make.graphics({ add: false });
  TEX_SS = FISH_TEX_SS;           // 超采样绘制，生成高清纹理
  (SHAPES[spec.shape] || SHAPES.basic)(g, spec);
  g.generateTexture(key, FW * FISH_TEX_SS, FH * FISH_TEX_SS);
  TEX_SS = 1;
  g.destroy();
}

// ---------- 通关庆祝用纹理 ----------

// 大大的笑脸
function makeSmiley(scene) {
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xffe066, 1);
  g.fillCircle(100, 100, 92);
  g.lineStyle(6, 0xffb52e, 1);
  g.strokeCircle(100, 100, 92);
  g.fillStyle(0xff9a9a, 0.65);
  g.fillCircle(46, 116, 15);
  g.fillCircle(154, 116, 15);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(70, 76, 21);
  g.fillCircle(130, 76, 21);
  g.fillStyle(0x222233, 1);
  g.fillCircle(75, 79, 9.5);
  g.fillCircle(135, 79, 9.5);
  g.lineStyle(10, 0x8a4a00, 1);
  g.beginPath();
  g.arc(100, 106, 48, 0.12 * Math.PI, 0.88 * Math.PI);
  g.strokePath();
  g.generateTexture('smiley', 200, 200);
  g.destroy();
}

// 黄色五角星：亮星 + 空星
function makeStar(scene) {
  const mk = (key, fill, line) => {
    const g = scene.make.graphics({ add: false });
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 === 0 ? 22 : 9;
      pts.push({ x: 24 + Math.cos(a) * r, y: 26 + Math.sin(a) * r });
    }
    g.fillStyle(fill, 1);
    g.fillPoints(pts, true);
    g.lineStyle(3, line, 1);
    g.strokePoints(pts, true);
    g.generateTexture(key, 48, 52);
    g.destroy();
  };
  mk('star_full', 0xffd93d, 0xd39a00);
  mk('star_empty', 0x274357, 0x547b96);
}

// 海底火山（原点在底部中点，2 倍超采样，显示时用 0.5 缩放）
function makeVolcano(scene) {
  const g = scene.make.graphics({ add: false });
  TEX_SS = 2;
  poly(g, 0x4a3a31, [[6, 300], [150, 96], [210, 62], [274, 96], [414, 300]]);
  poly(g, 0x5f4c41, [[150, 96], [210, 62], [210, 300], [120, 300]]);
  dot(g, 0x3a2c25, 120, 236, 16);
  dot(g, 0x3a2c25, 300, 252, 20);
  dot(g, 0x3a2c25, 262, 186, 12);
  dot(g, 0x3a2c25, 168, 148, 10);
  poly(g, 0xff7a2b, [[184, 74], [208, 76], [196, 300], [166, 300]], 0.95);
  poly(g, 0xff7a2b, [[226, 74], [250, 78], [274, 300], [244, 300]], 0.95);
  oval(g, 0x2a1f1a, 210, 64, 124, 34);
  oval(g, 0xff6b2b, 210, 62, 96, 24);
  oval(g, 0xffd93d, 210, 60, 60, 13);
  g.generateTexture('volcano', 420 * 2, 300 * 2);
  TEX_SS = 1;
  g.destroy();
}

// 熔岩火球
function makeLava(scene) {
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0xff6b2b, 0.35);
  g.fillCircle(16, 16, 16);
  g.fillStyle(0xff9a3c, 0.6);
  g.fillCircle(16, 16, 14);
  g.fillStyle(0xffd93d, 1);
  g.fillCircle(16, 16, 10);
  g.generateTexture('lava', 32, 32);
  g.destroy();
}

// 火山灰烟
function makeSmoke(scene) {
  const g = scene.make.graphics({ add: false });
  g.fillStyle(0x8b949f, 0.5);
  g.fillCircle(24, 24, 21);
  g.fillStyle(0x5f6873, 0.5);
  g.fillCircle(15, 17, 12);
  g.fillCircle(33, 20, 11);
  g.generateTexture('smoke', 48, 48);
  g.destroy();
}

function generateTextures(scene) {
  if (scene.textures.exists('player_p1_open')) return;
  makePlayer(scene, 'player_p1', 0xffb347);
  makePlayer(scene, 'player_p2', 0x6fd66f);
  FISH_SPECIES.forEach((spec, i) => makeSpecies(scene, 'fish_' + i, spec));
  makeBubble(scene);
  makeIcon(scene, 'icon_dash', 0xffcc33);
  makeIcon(scene, 'icon_stealth', 0x66ccff);
  makeIcon(scene, 'icon_mask', 0x111122);
  makeRing(scene);
  makeSmiley(scene);
  makeStar(scene);
  makeVolcano(scene);
  makeLava(scene);
  makeSmoke(scene);
}

// 玩家：圆脸带表情，朝右，张嘴/闭嘴两帧（按 PLAYER_TEX_SS 超采样生成）
function makePlayer(scene, base, color) {
  const S = PLAYER_TEX_SS, C = 64 * S;
  let g = scene.make.graphics({ add: false });
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(C, C);
  g.arc(C, C, 54 * S, 0.55, Math.PI * 2 - 0.55);
  g.closePath();
  g.fillPath();
  g.fillStyle(0xffffff, 1);
  g.fillCircle(50 * S, 42 * S, 10 * S);
  g.fillCircle(82 * S, 42 * S, 10 * S);
  g.fillStyle(0x222233, 1);
  g.fillCircle(53 * S, 42 * S, 4.5 * S);
  g.fillCircle(85 * S, 42 * S, 4.5 * S);
  g.generateTexture(base + '_open', 128 * S, 128 * S);
  g.destroy();

  g = scene.make.graphics({ add: false });
  g.fillStyle(color, 1);
  g.fillCircle(C, C, 54 * S);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(50 * S, 42 * S, 10 * S);
  g.fillCircle(82 * S, 42 * S, 10 * S);
  g.fillStyle(0x222233, 1);
  g.fillCircle(53 * S, 42 * S, 4.5 * S);
  g.fillCircle(85 * S, 42 * S, 4.5 * S);
  g.lineStyle(5 * S, 0x8a4a00, 1);
  g.beginPath();
  g.arc(70 * S, 64 * S, 16 * S, 0.15 * Math.PI, 0.85 * Math.PI);
  g.strokePath();
  g.generateTexture(base + '_closed', 128 * S, 128 * S);
  g.destroy();
}

function makeBubble(scene) {
  const g = scene.make.graphics({ add: false });
  g.lineStyle(6, 0xffffff, 0.8);
  g.strokeCircle(32, 32, 24);
  g.fillStyle(0xffffff, 0.5);
  g.fillCircle(22, 22, 6);
  g.generateTexture('bubble', 64, 64);   // 2 倍超采样，显示时用 0.5 缩放
  g.destroy();
}

function makeIcon(scene, key, color) {
  const g = scene.make.graphics({ add: false });
  g.fillStyle(color, 1);
  g.fillCircle(22, 22, 20);
  g.lineStyle(3, 0xffffff, 0.9);
  g.strokeCircle(22, 22, 20);
  g.generateTexture(key, 44, 44);
  g.destroy();
}

// CD 就绪提示圈
function makeRing(scene) {
  const g = scene.make.graphics({ add: false });
  g.lineStyle(6, 0xffee58, 1);
  g.strokeCircle(32, 32, 26);
  g.lineStyle(2, 0xffffff, 0.9);
  g.strokeCircle(32, 32, 20);
  g.generateTexture('icon_ring', 64, 64);
  g.destroy();
}

// 海底背景：按地图画出完全不同的海底世界（静态部分）
function drawSeaBackground(scene, mapKey) {
  const key = getMapKey(scene, mapKey);
  const w = GAME_W, h = GAME_H;
  const g = scene.add.graphics().setDepth(-100);
  if (key === 'subtropical') drawSubtropicalBg(g, w, h);
  else if (key === 'arctic') drawArcticBg(g, w, h);
  else drawTropicalBg(g, w, h);
  return g;
}

// 热带： turquoise 海水 + 金色沙滩 + 珊瑚丛（动态海草在 createMapFX 里）
function drawTropicalBg(g, w, h) {
  g.fillGradientStyle(0x35c8b0, 0x35c8b0, 0x075c6b, 0x075c6b, 1);
  g.fillRect(0, 0, w, h);
  g.fillStyle(0xfff6c0, 0.07);
  for (let i = 0; i < 4; i++) {
    const x = 80 + i * 220;
    g.fillTriangle(x, 0, x + 90, 0, x + 30, h);
  }
  // 金色沙滩
  g.fillStyle(0xe3c98d, 1);
  g.fillRect(0, h - 26, w, 26);
  g.fillStyle(0xf0dcab, 1);
  g.fillEllipse(w * 0.25, h - 26, 240, 36);
  g.fillEllipse(w * 0.7, h - 26, 280, 40);
  g.fillStyle(0xd4b678, 1);
  g.fillEllipse(w * 0.48, h - 22, 120, 18);
  // 珊瑚丛：分支珊瑚 + 圆脑珊瑚 + 小管珊瑚
  drawBranchCoral(g, w * 0.12, h - 24, 0xff7a9e, 64);
  drawBranchCoral(g, w * 0.2, h - 24, 0xffa25e, 48);
  drawBranchCoral(g, w * 0.86, h - 24, 0xc78bff, 58);
  drawBranchCoral(g, w * 0.94, h - 24, 0xff7a9e, 44);
  for (const [x, r, c] of [[w * 0.32, 16, 0xff9d76], [w * 0.42, 12, 0xffd166], [w * 0.6, 15, 0xff8fb3], [w * 0.74, 11, 0xffa25e]]) {
    dot(g, c, x, h - 24 - r * 0.5, r);
    dot(g, 0xffffff, x - r * 0.3, h - 24 - r * 0.7, r * 0.28, 0.35);
  }
  // 小海草芽（静态）
  for (let i = 0; i < 8; i++) {
    const x = 40 + i * (w - 80) / 7;
    stroke(g, 0x2e9e5b, 4, [[x, h - 24], [x - 4, h - 40], [x + 3, h - 52]]);
  }
}

// 分支珊瑚：一条主干 + 两侧小枝
function drawBranchCoral(g, x, baseY, color, hgt) {
  const tips = [[x, baseY - hgt]];
  stroke(g, color, 7, [[x, baseY], [x - 3, baseY - hgt * 0.5], tips[0]]);
  for (const side of [-1, 1]) {
    const y0 = baseY - hgt * 0.45, bh = hgt * 0.42;
    const tip = [x + side * 16, y0 - bh * 0.7];
    stroke(g, color, 5, [[x - 2, y0], [x + side * 9, y0 - bh * 0.35], tip]);
    tips.push(tip);
  }
  for (const t of tips) dot(g, 0xffffff, t[0], t[1], 3.4, 0.85);
}

// 亚热带：蓝色海水 + 大片细沙 + 许多石头
function drawSubtropicalBg(g, w, h) {
  g.fillGradientStyle(0x2e86b8, 0x2e86b8, 0x0d3450, 0x0d3450, 1);
  g.fillRect(0, 0, w, h);
  g.fillStyle(0xffffff, 0.05);
  for (let i = 0; i < 3; i++) {
    const x = 140 + i * 300;
    g.fillTriangle(x, 0, x + 80, 0, x + 28, h);
  }
  // 沙地（更厚、颜色更浅）
  g.fillStyle(0xcdb37a, 1);
  g.fillRect(0, h - 34, w, 34);
  g.fillStyle(0xdcc48c, 1);
  g.fillEllipse(w * 0.2, h - 32, 260, 40);
  g.fillEllipse(w * 0.55, h - 30, 300, 44);
  g.fillEllipse(w * 0.88, h - 32, 240, 36);
  // 沙纹
  g.lineStyle(2, 0xb89a5e, 0.7);
  for (let i = 0; i < 9; i++) {
    const x = 30 + i * (w - 60) / 8;
    g.beginPath();
    g.moveTo(x, h - 12);
    g.lineTo(x + 26, h - 16);
    g.strokePath();
  }
  // 石头：大礁石 + 鹅卵石
  for (const [x, rw, rh, c] of [
    [w * 0.1, 90, 52, 0x8a8f96], [w * 0.3, 64, 40, 0x757b84], [w * 0.47, 100, 58, 0x93989f],
    [w * 0.68, 72, 44, 0x7e848d], [w * 0.88, 96, 54, 0x8a8f96]
  ]) {
    g.fillStyle(c, 1);
    g.fillEllipse(x, h - 26 - rh * 0.15, rw, rh);
    g.fillStyle(0xffffff, 0.14);
    g.fillEllipse(x - rw * 0.18, h - 26 - rh * 0.38, rw * 0.5, rh * 0.4);
  }
  for (let i = 0; i < 16; i++) {
    const x = 20 + i * (w - 40) / 15;
    dot(g, i % 2 ? 0x6e747c : 0x9aa0a8, x, h - 8 - (i % 3) * 5, 3 + (i % 3));
  }
}

// 北极：明亮的冰海，雪白海床 + 碎冰，水很安静（动态光束在 createMapFX 里）
function drawArcticBg(g, w, h) {
  g.fillGradientStyle(0xaadcee, 0xaadcee, 0x0d3050, 0x0d3050, 1);
  g.fillRect(0, 0, w, h);
  // 顶部冰面反光
  g.fillStyle(0xffffff, 0.16);
  g.fillRect(0, 0, w, 14);
  g.fillStyle(0xffffff, 0.08);
  g.fillRect(0, 14, w, 16);
  // 雪白沙床
  g.fillStyle(0xe8eef2, 1);
  g.fillRect(0, h - 24, w, 24);
  g.fillStyle(0xf5fafc, 1);
  g.fillEllipse(w * 0.3, h - 24, 280, 34);
  g.fillEllipse(w * 0.75, h - 24, 300, 38);
  // 碎冰块
  for (const [x, rw, rh] of [[w * 0.14, 70, 34], [w * 0.52, 90, 40], [w * 0.86, 64, 30]]) {
    g.fillStyle(0xd3e7f2, 1);
    g.fillEllipse(x, h - 22 - rh * 0.2, rw, rh);
    g.fillStyle(0xffffff, 0.6);
    g.fillEllipse(x - rw * 0.15, h - 22 - rh * 0.42, rw * 0.5, rh * 0.45);
  }
}

// 地图动态装饰：返回创建的对象列表（方便菜单切换地图时销毁）
function createMapFX(scene, mapKey) {
  const key = getMapKey(scene, mapKey);
  const w = GAME_W, h = GAME_H;
  const objs = [];
  if (key === 'tropical') {
    // 摇摆的大海草：底部固定，叶片左右摇摆
    for (let i = 0; i < 9; i++) {
      const x = 30 + i * (w - 60) / 8 + Phaser.Math.Between(-16, 16);
      const hgt = Phaser.Math.Between(80, 160);
      const g = scene.add.graphics().setDepth(-99);
      g.setPosition(x, h - 22);
      drawSeaweedBlade(g, hgt, i % 2 ? 0x27ae60 : 0x1f8a4c);
      scene.tweens.add({
        targets: g, rotation: Phaser.Math.FloatBetween(0.06, 0.13) * (i % 2 ? 1 : -1),
        duration: Phaser.Math.Between(1100, 1900),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: Phaser.Math.Between(0, 600)
      });
      objs.push(g);
    }
  } else if (key === 'arctic') {
    // 阳光从上面照下来：几道慢慢呼吸的光束
    for (let i = 0; i < 5; i++) {
      const x = 50 + i * (w - 100) / 4 + Phaser.Math.Between(-24, 24);
      const g = scene.add.graphics().setDepth(-99);
      g.fillStyle(0xeaf7ff, 0.11);
      g.fillTriangle(0, 0, 74, 0, 30, h * 0.85);
      g.setPosition(x, 0);
      g.setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: g, alpha: { from: 0.25, to: 1 }, x: x + Phaser.Math.Between(-14, 14),
        duration: Phaser.Math.Between(1800, 3200),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: Phaser.Math.Between(0, 900)
      });
      objs.push(g);
    }
    // 波光粼粼：上层水里一闪一闪的光点
    for (let i = 0; i < 14; i++) {
      const s = scene.add.image(
        Phaser.Math.Between(20, w - 20),
        Phaser.Math.Between(30, Math.round(h * 0.5)),
        'bubble'
      ).setScale(Phaser.Math.FloatBetween(0.1, 0.21)).setAlpha(0)   // bubble 纹理是 2 倍超采样
        .setDepth(-98).setBlendMode(Phaser.BlendModes.ADD);
      scene.tweens.add({
        targets: s, alpha: Phaser.Math.FloatBetween(0.5, 0.9),
        duration: Phaser.Math.Between(500, 1100),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: Phaser.Math.Between(0, 1600)
      });
      objs.push(s);
    }
  }
  return objs;
}

// 一片波浪形海草叶（原点在底部）
function drawSeaweedBlade(g, hgt, color) {
  const w0 = 7, pts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push({ x: Math.sin(t * 4.5) * 8 - w0 * (1 - t), y: -t * hgt });
  }
  for (let i = 6; i >= 0; i--) {
    const t = i / 6;
    pts.push({ x: Math.sin(t * 4.5) * 8 + w0 * (1 - t), y: -t * hgt });
  }
  g.fillStyle(color, 0.95);
  g.fillPoints(pts, true);
}

// 水泡
function createBubbles(scene, count) {
  const arr = [];
  for (let i = 0; i < count; i++) {
    const img = scene.add.image(
      Phaser.Math.Between(0, GAME_W),
      Phaser.Math.Between(0, GAME_H),
      'bubble'
    );
    img.setScale(Phaser.Math.FloatBetween(0.2, 0.6)).setAlpha(0.6);   // bubble 纹理是 2 倍超采样
    img.setData('speed', Phaser.Math.FloatBetween(20, 60));
    arr.push(img);
  }
  return arr;
}

function updateBubbles(scene, arr, dt) {
  for (const b of arr) {
    b.y -= b.getData('speed') * dt;
    if (b.y < -20) {
      b.y = GAME_H + 20;
      b.x = Phaser.Math.Between(0, GAME_W);
    }
  }
}

// 手柄安全获取
function getPad(scene, i) {
  const gp = scene.input.gamepad;
  if (!gp || !gp.gamepads || gp.gamepads.length <= i) return null;
  const pad = gp.getPad(i);
  return (pad && pad.connected) ? pad : null;
}

// 按键按下判定（单个按键或按键数组）
function isDown(k) {
  return Array.isArray(k) ? k.some(x => x.isDown) : k.isDown;
}

// 秒 → “x分yy秒” / “x m yy s”
function formatTime(sec) {
  const t = Math.max(0, Math.round(sec));
  return T('timeFmt', { m: Math.floor(t / 60), s: String(t % 60).padStart(2, '0') });
}

// 通关评分：<=12 分钟满分 100，>=40 分钟 0 分，中间线性
const SCORE_PERFECT_TIME = 720;
const SCORE_ZERO_TIME = 2400;
function calcScoreByTime(sec) {
  if (sec <= SCORE_PERFECT_TIME) return 100;
  if (sec >= SCORE_ZERO_TIME) return 0;
  return Math.round(100 * (SCORE_ZERO_TIME - sec) / (SCORE_ZERO_TIME - SCORE_PERFECT_TIME));
}

// 按分数给出的评价
function scoreComment(score) {
  if (score >= 100) return T('comments').perfect;
  if (score >= 85) return T('comments').great;
  if (score >= 70) return T('comments').good;
  if (score >= 50) return T('comments').ok;
  return T('comments').low;
}

// ---------- 每一关的评分（满分 100 = 10 颗黄星，每 10 分一颗） ----------
// 标准用时按“要多吃几口（目标重量）+ 场上鱼多不多”估算：够快就是 100 分，拖到 2.5 倍就是 0 分
function levelParTime(cfg, parMul) {
  const m = parMul === undefined ? 1 : parMul;
  return ((cfg.targetWeight - 5) * 2.2 + cfg.fishCount * 0.8) * m;
}
function calcLevelScore(sec, cfg, parMul) {
  const par = levelParTime(cfg, parMul);
  const zero = par * 2.5;
  if (sec <= par) return 100;
  if (sec >= zero) return 0;
  return Math.round(100 * (zero - sec) / (zero - par));
}

// 角度朝目标旋转，步长受限
function rotateToward(a, target, maxStep) {
  let diff = ((target - a + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  if (diff > maxStep) diff = maxStep;
  else if (diff < -maxStep) diff = -maxStep;
  return a + diff;
}
