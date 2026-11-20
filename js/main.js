window.addEventListener('load', () => {
  // 高清渲染：逻辑尺寸保持 960x540（GAME_W/GAME_H），画布缓冲放大 HD_ZOOM 倍，
  // 各场景相机 setZoom(HD_ZOOM) 后逻辑坐标不变，文字/背景/鱼都不再发虚
  // 文字默认按 HD_ZOOM 倍生成字形（否则相机放大后文字会糊）
  const origText = Phaser.GameObjects.GameObjectFactory.prototype.text;
  Phaser.GameObjects.GameObjectFactory.prototype.text = function (x, y, text, style) {
    style = style || {};
    if (style.resolution === undefined) style.resolution = HD_ZOOM;
    return origText.call(this, x, y, text, style);
  };
  window.__game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#03182e',
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      expandParent: false,          // 别去改 #game 的尺寸，否则 FIT 的基准会漂移
      width: GAME_W * HD_ZOOM,
      height: GAME_H * HD_ZOOM
    },
    input: { gamepad: true },
    scene: [MenuScene, GameScene, EndScene, VictoryScene]
  });

  // ---------- 视口自适应看门狗 ----------
  // 只要画布的显示尺寸和「当前视口的 FIT 尺寸」不一致，就重新适配。
  // 这样窗口/编辑器面板/webview 尺寸变化、浏览器缩放、初始测量偏差等
  // 任何原因造成的「画布比视口大 → 顶部被切掉（标题看不见）」都会自动纠正。
  const fitToViewport = () => {
    const g = window.__game;
    if (!g || !g.scale || !g.scale.gameSize || !g.canvas) return;
    const gw = GAME_W * HD_ZOOM, gh = GAME_H * HD_ZOOM;
    const vw = window.innerWidth || document.documentElement.clientWidth || 0;
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!vw || !vh) return;
    const want = Math.min(vw / gw, vh / gh);              // 当前视口下应有的缩放
    const wantW = Math.round(gw * want), wantH = Math.round(gh * want);
    const off = (v, target) => !isFinite(v) || Math.abs(v - target) > 1;

    if (off(g.scale.displaySize.width, wantW) || off(g.scale.displaySize.height, wantH)) {
      g.scale.resize(gw, gh);   // 先回到基准尺寸
      g.scale.refresh();        // 再按父元素（= 视口）重新 FIT + 居中
    }
    // 兜底：Phaser 内部尺寸已正确、但画布元素仍是旧尺寸时直接写回（避免顶部被切）
    if (off(parseFloat(g.canvas.style.width), wantW) || off(parseFloat(g.canvas.style.height), wantH)) {
      g.canvas.style.width = wantW + 'px';
      g.canvas.style.height = wantH + 'px';
      g.scale.refresh();
    }
  };
  window.__fitToViewport = fitToViewport;

  window.addEventListener('resize', fitToViewport);
  window.addEventListener('orientationchange', fitToViewport);
  window.addEventListener('pageshow', fitToViewport);
  document.addEventListener('visibilitychange', fitToViewport);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fitToViewport);
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(fitToViewport);
    const host = document.getElementById('game');
    if (host) ro.observe(host);
    ro.observe(document.documentElement);
  }
  // webview / 面板的初始尺寸可能晚一拍才稳定，加载后多校正几次；之后每秒巡检兜底
  [0, 150, 500, 1200, 2500].forEach(ms => window.setTimeout(fitToViewport, ms));
  window.setInterval(fitToViewport, 1000);
});
