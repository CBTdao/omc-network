# -*- coding: utf-8 -*-
"""
生成 omc-website/barbarian-age-play.html（并同步 game/index.html）：
  内核 = 蛮荒时代/_proto/rts5_desk.html（v2.32 桌面横屏版，含相机 + 2.5D；窄屏自动回落到竖屏 360×640）
  head = 现有 OMC head（title/canonical/og/twitter/favicon/4 块 JSON-LD，逐字保留）
  外壳 = #app 双栏（≥1120px 右侧 330px 侧栏）+ JS 精确计算 16:9 / 9:16 舞台
  键盘层 = 优先读内核发布的 __BA_UI（数据驱动），竖屏回落到 360×640 坐标表

用法：python tools/build-barbarian-play.py
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, '..', '..', '2026-10-16-12-05-33', '蛮荒时代', '_proto', 'rts5_desk.html')
OLD = os.path.join(ROOT, 'barbarian-age-play.html')
OUT = OLD
OUT2 = os.path.join(ROOT, 'game', 'index.html')

if not os.path.exists(GAME):
    sys.exit('MISS kernel: ' + GAME)

src = io.open(GAME, encoding='utf-8').read()
old = io.open(OLD, encoding='utf-8').read()

# ---- 1) 内核脚本块：从 <script>\nwindow.__BA_LAYOUT 起，到配对的 </script> ----
m = re.search(r'<script>\s*\n\s*window\.__BA_LAYOUT', src)
if not m:
    sys.exit('MISS __BA_LAYOUT script in kernel')
start = m.start()
end = src.index('</script>', start) + len('</script>')
kernel = src[start:end]
# 布局在运行时决定：宽屏 → desktop（1280×720），窄屏 → 竖屏 360×640
LAYOUT_OLD = "window.__BA_LAYOUT = 'desktop';"
if LAYOUT_OLD not in kernel:
    sys.exit('MISS layout assignment in kernel')
kernel = kernel.replace(
    LAYOUT_OLD,
    "window.__BA_LAYOUT = (window.matchMedia && window.matchMedia('(min-aspect-ratio: 1/1)').matches) ? 'desktop' : '';"
)
# 精灵图在 OMC 上没有资产，直接指到不存在的路径也不会报错（imgReady 为假 → 走程序化绘制），保持与旧版一致
kernel = kernel.replace("'../a_", "'/game/a_")

# ---- 2) head：保留 <style> 之前的所有内容 + </style> 之后的 preconnect/dns-prefetch/ </head> ----
hs = old.index('<style>')
se = old.index('</style>')
he = old.index('</head>') + len('</head>')
head_pre = old[:hs]
head_post = old[se:he]

CSS = """<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; height: 100%; background: #120d07; overflow: hidden;
    font-family: "Microsoft YaHei", "PingFang SC", sans-serif; color: #e9dfc9; }
  #app { height: 100%; display: flex; align-items: center; justify-content: center; gap: 26px; padding: 14px; }
  #stage { flex: 1; min-width: 0; height: 100%; display: flex; align-items: center; justify-content: center; }
  #stage:fullscreen, #stage:-webkit-full-screen { width: 100vw; height: 100vh; padding: 0; }
  /* 舞台尺寸由 JS 精确计算（宽屏 16:9 / 窄屏 9:16），避免 aspect-ratio + max-height 失真 */
  #wrap { position: relative; }
  canvas { background: #1a1208; width: 100%; height: 100%; display: block; border-radius: 10px;
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.55); touch-action: none; }
  /* desktop side rail — hidden on narrow screens, the game fills the viewport there */
  #rail { display: none; width: 330px; flex-shrink: 0; max-height: 100%; overflow: auto; }
  @media (min-width: 1120px) { #rail { display: block; } }
  #rail::-webkit-scrollbar { width: 8px; }
  #rail::-webkit-scrollbar-thumb { background: #3a2f1d; border-radius: 4px; }
  .rail-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
  .rail-back { color: #c9b489; text-decoration: none; font-size: 13px; font-weight: 700; }
  .rail-back:hover { color: #ffd479; }
  #fsBtn { background: rgba(255, 212, 121, 0.12); border: 1px solid rgba(255, 212, 121, 0.45); color: #ffd479;
    font: 700 12.5px/1 "Microsoft YaHei", "PingFang SC", sans-serif; padding: 8px 13px; border-radius: 8px; cursor: pointer; }
  #fsBtn:hover { background: rgba(255, 212, 121, 0.22); }
  .rail-title { margin: 0 0 4px; font-size: 26px; color: #f5e9cf; letter-spacing: 0.02em; }
  .rail-title span { color: #ffd479; }
  .rail-sub { margin: 0 0 16px; font-size: 12.5px; color: #a5947a; line-height: 1.6; }
  .rail-card { background: rgba(38, 30, 17, 0.55); border: 1px solid rgba(255, 212, 121, 0.16); border-radius: 12px;
    padding: 13px 15px; margin-bottom: 12px; }
  .rail-card h2 { margin: 0 0 8px; font-size: 13px; color: #ffd479; letter-spacing: 0.06em; }
  .rail-card p { margin: 0 0 6px; font-size: 12.5px; line-height: 1.65; color: #d8cbb0; }
  .rail-card p.dim { color: #97876c; font-size: 11.5px; margin: 0; }
  .rail-keys { width: 100%; border-collapse: collapse; }
  .rail-keys td { padding: 3.5px 0; font-size: 12px; color: #d8cbb0; vertical-align: top; }
  .rail-keys td:first-child { width: 92px; white-space: nowrap; padding-right: 8px; }
  kbd { display: inline-block; background: #2b2113; border: 1px solid #4a3a20; border-bottom-width: 2px; border-radius: 5px;
    padding: 1px 6px; font: 700 11px/1.5 Consolas, monospace; color: #ffd479; }
  .rail-eco a { display: block; color: #c9b489; text-decoration: none; font-size: 12.5px; font-weight: 600;
    padding: 6px 0; border-bottom: 1px dashed rgba(255, 212, 121, 0.14); }
  .rail-eco a:last-child { border-bottom: 0; }
  .rail-eco a:hover { color: #ffd479; }
</style>
"""

BODY = """<body>
  <div id="app">
    <div id="stage"><div id="wrap"><canvas id="cv"></canvas></div></div>
    <aside id="rail">
      <div class="rail-top">
        <a class="rail-back" href="https://omc.network/barbarian-age">&larr; OMC &middot; 蛮荒时代</a>
        <button id="fsBtn" type="button">&#9974; 全屏游戏</button>
      </div>
      <h1 class="rail-title">蛮荒时代 <span>网页版</span></h1>
      <p class="rail-sub">《国家的崛起》致敬作 &middot; 横屏全页面战场 + 相机缩放 &middot; 浏览器直接玩，无需安装。Free to play — no wallet, no token.</p>
      <div class="rail-card">
        <h2>怎么玩 &middot; HOW TO PLAY</h2>
        <p>鼠标 = 手指：点底部按钮建造建筑、训练部队；拖框选中部队，再点地面移动、点敌人攻击。<strong>滚轮</strong>以光标为锚点缩放战场，<strong>右键拖拽</strong>平移视野。</p>
        <p class="dim">Mouse works like touch. Scroll to zoom around the cursor, right-drag to pan.</p>
      </div>
      <div class="rail-card">
        <h2>键盘快捷键 &middot; KEYBOARD</h2>
        <table class="rail-keys">
          <tr><td><kbd>1</kbd>&ndash;<kbd>6</kbd></td><td>训练：步兵 / 弓手 / 勇士 / 村民 / 骑兵 / 投石</td></tr>
          <tr><td><kbd>Space</kbd></td><td>暂停 / 继续</td></tr>
          <tr><td><kbd>A</kbd></td><td>全军框选 / 取消选择</td></tr>
          <tr><td><kbd>T</kbd></td><td>科技树开关</td></tr>
          <tr><td><kbd>R</kbd></td><td>集结回防</td></tr>
          <tr><td><kbd>F2</kbd></td><td>切换阵型（方阵/横排/楔形/圆环）</td></tr>
          <tr><td><kbd>H</kbd></td><td>冲锋号角（全军加速&middot;攻击）</td></tr>
          <tr><td><kbd>G</kbd></td><td>主公战吼（击退敌军）</td></tr>
          <tr><td><kbd>Q</kbd></td><td>神罚 &middot; 超级武器（需祭坛）</td></tr>
          <tr><td><kbd>M</kbd></td><td>声音开关</td></tr>
          <tr><td><kbd>Esc</kbd></td><td>取消放置 / 取消瞄准</td></tr>
          <tr><td><kbd>+</kbd> <kbd>&minus;</kbd> <kbd>0</kbd></td><td>战场放大 / 缩小 / 复位视野</td></tr>
          <tr><td><kbd>&larr;&uarr;&darr;&rarr;</kbd></td><td>平移视野</td></tr>
          <tr><td><kbd>F</kbd></td><td>全屏 / 退出全屏</td></tr>
        </table>
        <p class="dim">Keys 1&ndash;6 train infantry / archer / heavy / villager / cavalry / siege.</p>
      </div>
      <div class="rail-card rail-eco">
        <h2>生态 &middot; ECOSYSTEM</h2>
        <a href="https://top.omc.network" target="_blank" rel="noopener">AITop &mdash; AI 工具站</a>
        <a href="https://forum.omc.network" target="_blank" rel="noopener">DCF &mdash; 算力论坛</a>
        <a href="https://omc.network/barbarian-age">蛮荒时代 &middot; 游戏介绍页</a>
      </div>
    </aside>
  </div>
"""

SHELL = """<script>
/* 外壳层：舞台尺寸 + 全屏 + 键盘合成点击。
   游戏内核一字节未改——只派发它自己已在监听的 MouseEvent（mousedown/mouseup on #cv）。
   坐标优先取自内核发布的 __BA_UI（桌面横屏），竖屏回落到 360x640 逻辑坐标表。 */
(function(){
  var cv=document.getElementById('cv'), stage=document.getElementById('stage'), wrap=document.getElementById('wrap');
  function isWide(){ return !!(window.matchMedia && window.matchMedia('(min-aspect-ratio: 1/1)').matches); }
  var LAY0=isWide();
  function layout(){
    if(!stage||!wrap) return;
    var r=stage.getBoundingClientRect();
    var ar=LAY0?(16/9):(360/640);
    var w=r.width, h=r.height;
    if(w<=0||h<=0) return;
    if(w/h>ar) w=h*ar; else h=w*ar;
    wrap.style.width=Math.max(120,Math.round(w))+'px';
    wrap.style.height=Math.max(120,Math.round(h))+'px';
  }
  window.addEventListener('resize', function(){
    /* 布局是在内核加载时定死的（__BA_Layout），跨过宽/窄阈值只能重载才能换内核布局 */
    if(isWide()!==LAY0){ location.reload(); return; }
    layout();
  });
  window.addEventListener('orientationchange', function(){ setTimeout(function(){ if(isWide()!==LAY0){ location.reload(); } else { layout(); } },260); });
  layout();

  function tapRect(p){
    var UI=window.__BA_UI;
    var x,y;
    if(UI&&UI.toClient){ var c=UI.toClient(p.x,p.y); x=c[0]; y=c[1]; }
    else { var r=cv.getBoundingClientRect(); x=r.left+p.x*r.width/360; y=r.top+p.y*r.height/640; }
    var o={clientX:x,clientY:y,bubbles:true,cancelable:true,button:0};
    cv.dispatchEvent(new MouseEvent('mousedown',o));
    cv.dispatchEvent(new MouseEvent('mouseup',o));
  }
  /* 竖屏回落坐标表（360x640 逻辑空间），与桌面键位一一对应 */
  var LEGACY={ KeyA:[41,137], KeyT:[327,19], Space:[310,49], KeyH:[310,111], F2:[310,137],
    KeyG:[310,163], KeyR:[41,163], KeyQ:[310,189], KeyM:[41,83] };
  var LEGACY_TRAIN=[27,78.5,130,181.5,233,284.5];
  for(var i=0;i<LEGACY_TRAIN.length;i++) LEGACY['Digit'+(i+1)]=[LEGACY_TRAIN[i],598];
  LEGACY.Escape=[336,598];
  function pick(code){
    var UI=window.__BA_UI;
    if(UI&&UI.toClient){
      var m=/^Digit([1-6])$/.exec(code);
      if(m) return UI.train[+m[1]-1];
      if(code==='KeyA') return UI.sel;
      if(code==='F2') return UI.form;
      if(code==='KeyR') return UI.recall;
      if(code==='KeyH') return UI.horn;
      if(code==='KeyG') return UI.hero;
      if(code==='KeyQ') return UI.sp;
      if(code==='KeyT') return UI.tech;
      if(code==='Space') return UI.pause;
      if(code==='KeyM') return UI.snd;
      if(code==='Escape') return UI.esc;
      return null;
    }
    return LEGACY[code]?{x:LEGACY[code][0],y:LEGACY[code][1]}:null;
  }
  document.addEventListener('keydown', function(e){
    if(e.repeat||e.metaKey||e.ctrlKey||e.altKey) return;
    if(e.code==='KeyF'&&!e.shiftKey){
      e.preventDefault();
      if(document.fullscreenElement||document.webkitFullscreenElement){ (document.exitFullscreen||document.webkitExitFullscreen).call(document); }
      else if(stage&&stage.requestFullscreen){ stage.requestFullscreen(); }
      else if(stage&&stage.webkitRequestFullscreen){ stage.webkitRequestFullscreen(); }
      return;
    }
    var p=pick(e.code); if(!p) return;
    e.preventDefault(); tapRect(p);
  });
  /* #play：自测/截图用，加载后直接点「开始游戏」 */
  if(location.hash==='#play') setTimeout(function(){
    var UI=window.__BA_UI;
    /* 横屏主菜单「开始游戏」= (W/2, 274)；竖屏 = (180, 245) */
    tapRect(UI&&UI.W>600?{x:Math.round(UI.W/2),y:274}:{x:180,y:245});
  },600);
  var fsBtn=document.getElementById('fsBtn');
  if(fsBtn&&stage){
    fsBtn.addEventListener('click', function(){
      if(document.fullscreenElement||document.webkitFullscreenElement){ (document.exitFullscreen||document.webkitExitFullscreen).call(document); }
      else if(stage.requestFullscreen){ stage.requestFullscreen(); }
      else if(stage.webkitRequestFullscreen){ stage.webkitRequestFullscreen(); }
    });
    function fsLabel(){ fsBtn.textContent=(document.fullscreenElement||document.webkitFullscreenElement)?'\\u26F6 退出全屏':'\\u26F6 全屏游戏'; }
    document.addEventListener('fullscreenchange',fsLabel);
    document.addEventListener('webkitfullscreenchange',fsLabel);
  }
})();
</script>
</body>
</html>
"""

page = head_pre + CSS + head_post + '\n' + BODY + kernel + '\n' + SHELL
io.open(OUT, 'w', encoding='utf-8', newline='\n').write(page)
print('barbarian-age-play.html -> %d bytes' % len(page.encode('utf-8')))

# game 子域副本（去掉本站侧栏链接里的绝对路径不变，仅同步一份）
io.open(OUT2, 'w', encoding='utf-8', newline='\n').write(page)
print('game/index.html        -> %d bytes' % len(page.encode('utf-8')))
