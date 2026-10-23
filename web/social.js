/* ==========================================================================
   澳門城市島 · 市民中心（會員、圖鑑、任務、提案與排行）
   以 overlay 形式掛載於 3D 主頁，不影響原有場景與 HUD
   ========================================================================== */
(function () {
  'use strict';

  const state = {
    me: null,
    districts: null,
    landmarks: null,
    atlasDistrict: null,
    proposals: null,
    board: 'weekly',
    tab: 'profile',
    city: null,
    sandbox: null,
    sandboxSlot: null,
    sandboxVisit: null,
    guildView: null,
    friendSearch: null,
    messages: null,
    msgUser: null,
    msgThread: null,
    activities: null,
    activityView: null,
    activityCategory: '',
    festival: null,
    festivalFired: false,
    open: false,
  };

  const CATEGORY_LABELS = {
    transport: '交通改善',
    climate: '防災與氣候',
    publicspace: '公共空間',
    culture: '文旅活動',
    community: '社區設施',
    green: '環境與綠化',
  };

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
      ...opts,
    });
    let data = null;
    try { data = await res.json(); } catch { /* 空回應 */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---------- DOM 骨架 ----------
  const root = document.createElement('div');
  root.id = 'mc-root';
  root.innerHTML = `
    <button id="mc-fab" type="button" aria-label="開啟市民中心">
      <span class="mc-fab-dot" hidden></span>
      <span class="mc-fab-icon">🏙</span>
      <span class="mc-fab-label">市民</span>
    </button>
    <div id="mc-backdrop"></div>
    <section id="mc-panel" role="dialog" aria-modal="true" aria-label="市民中心" aria-hidden="true">
      <header class="mc-head">
        <div class="mc-head-avatar" id="mc-head-avatar">🏙</div>
        <div class="mc-head-main">
          <div class="mc-head-name" id="mc-head-name">未登入</div>
          <div class="mc-head-sub" id="mc-head-sub">用 Google 登入，開始經營你的澳門島</div>
          <div class="mc-xpbar" id="mc-xpbar" hidden><i style="width:0%"></i></div>
        </div>
        <button class="mc-close" id="mc-close" type="button" aria-label="關閉">×</button>
      </header>
      <nav class="mc-tabs" id="mc-tabs">
        <button class="mc-tab mc-active" data-tab="profile" type="button">市民檔案</button>
        <button class="mc-tab" data-tab="atlas" type="button">探索圖鑑</button>
        <button class="mc-tab" data-tab="sandbox" type="button">建設沙盤</button>
        <button class="mc-tab" data-tab="community" type="button">好友社團</button>
        <button class="mc-tab" data-tab="messages" type="button">私訊</button>
        <button class="mc-tab" data-tab="tasks" type="button">每日任務</button>
        <button class="mc-tab" data-tab="proposals" type="button">提案牆</button>
        <button class="mc-tab" data-tab="activities" type="button">城市活動</button>
        <button class="mc-tab" data-tab="ranking" type="button">排行榜</button>
      </nav>
      <div class="mc-body" id="mc-body"></div>
    </section>
    <div id="mc-toasts"></div>
  `;
  document.body.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const fab = $('#mc-fab');
  const panel = $('#mc-panel');
  const backdrop = $('#mc-backdrop');
  const body = $('#mc-body');
  const tabs = $('#mc-tabs');

  // ---------- 公仔建構器 DOM ----------
  const avRoot = document.createElement('div');
  avRoot.id = 'mc-av';
  avRoot.hidden = true;
  avRoot.innerHTML = `
    <div class="mc-av-backdrop" data-av-close></div>
    <section class="mc-av-dialog" role="dialog" aria-modal="true" aria-label="公仔建構器">
      <header class="mc-av-head">
        <div>
          <div class="mc-av-title">🎨 公仔建構器</div>
          <div class="mc-av-sub">自由組合臉型、髮型、身型、服裝與配件</div>
        </div>
        <button class="mc-close" type="button" data-av-close aria-label="關閉">×</button>
      </header>
      <div class="mc-av-main">
        <div class="mc-av-stage">
          <div class="mc-av-figure" id="mc-av-figure"></div>
          <div class="mc-av-summary" id="mc-av-summary"></div>
          <div class="mc-row" style="justify-content:center;gap:8px;">
            <button class="mc-btn ghost" id="mc-av-random" type="button">🎲 隨機造型</button>
            <button class="mc-btn ghost" id="mc-av-reset" type="button">↩ 重設</button>
          </div>
        </div>
        <div class="mc-av-side">
          <nav class="mc-av-tabs" id="mc-av-tabs">
            <button type="button" data-av-tab="face">臉部</button>
            <button type="button" data-av-tab="hair">髮型</button>
            <button type="button" data-av-tab="body">身型</button>
            <button type="button" data-av-tab="outfit">服裝</button>
            <button type="button" data-av-tab="extra">配件</button>
            <button type="button" data-av-tab="color">顏色</button>
          </nav>
          <div class="mc-av-pane" id="mc-av-pane"></div>
        </div>
      </div>
      <footer class="mc-av-foot">
        <span class="mc-av-hint">儲存後 3D 地圖上的公仔立即更新</span>
        <div class="mc-row">
          <button class="mc-btn ghost" id="mc-av-cancel" type="button">取消</button>
          <button class="mc-btn" id="mc-av-save" type="button">儲存並同步 3D</button>
        </div>
      </footer>
    </section>`;
  root.appendChild(avRoot);

  // 市民入口放到頂部工具列（與全景／清單／語言同排）
  const topToolbar = document.querySelector('.top-toolbar');
  if (topToolbar) {
    fab.classList.add('mc-fab-toolbar');
    topToolbar.insertBefore(fab, topToolbar.firstChild);
  }

  function toast(msg) {
    const box = $('#mc-toasts');
    const el = document.createElement('div');
    el.className = 'mc-toast';
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(() => el.remove(), 320);
    }, 2600);
  }

  function openPanel(tab) {
    state.open = true;
    if (tab) state.tab = tab;
    syncTabs();
    panel.classList.add('mc-open');
    backdrop.classList.add('mc-open');
    panel.setAttribute('aria-hidden', 'false');
    render();
  }
  function closePanel() {
    state.open = false;
    panel.classList.remove('mc-open');
    backdrop.classList.remove('mc-open');
    panel.setAttribute('aria-hidden', 'true');
  }
  function syncTabs() {
    tabs.querySelectorAll('.mc-tab').forEach((b) => {
      b.classList.toggle('mc-active', b.dataset.tab === state.tab);
    });
  }

  fab.addEventListener('click', () => openPanel());
  $('#mc-close').addEventListener('click', closePanel);
  backdrop.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.open) closePanel();
  });
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('.mc-tab');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    syncTabs();
    render();
  });
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-board]');
    if (!btn) return;
    state.board = btn.dataset.board;
    renderRanking();
  });

  // ---------- 頭像與摘要 ----------
  function paintHead() {
    const me = state.me;
    const avatar = $('#mc-head-avatar');
    const xpbar = $('#mc-xpbar');
    if (!me || !me.authenticated) {
      avatar.innerHTML = '🏙';
      $('#mc-head-name').textContent = '未登入';
      $('#mc-head-sub').textContent = '用 Google 登入，開始經營你的澳門島';
      xpbar.hidden = true;
      return;
    }
    const u = me.user;
    avatar.innerHTML = u.avatarUrl
      ? `<img src="${esc(u.avatarUrl)}" alt="" referrerpolicy="no-referrer">`
      : `<span style="font-size:22px;">${esc(u.avatarEmoji || '🏙')}</span>`;
    const lv = u.levelInfo || { level: 1, title: '城市觀察員', progress: 0 };
    $('#mc-head-name').textContent = `${u.nickname} · Lv.${lv.level} ${lv.title}`;
    const reputation = u.counts ? (u.counts.reputation || 0) : 0;
    $('#mc-head-sub').textContent =
      `💰 ${u.coins} 城市幣 · ⭐ ${u.xp} XP · 🏅 聲望 ${reputation} · 🔥 連續 ${me.streak} 天`
      + (u.district ? ` · ${u.district.icon} ${u.district.name.slice(0, 14)}` : '');
    xpbar.hidden = false;
    xpbar.querySelector('i').style.width = `${Math.round((lv.progress || 0) * 100)}%`;
  }

  // 未登入提示卡
  function loginCard(intro) {
    return `
      <div class="mc-card">
        <div style="font-size:13px;font-weight:800;margin-bottom:6px;">${esc(intro || '登入後即可探索、收集與提案')}</div>
        <div class="mc-muted" style="line-height:1.7;margin-bottom:12px;">
          以 Google 帳戶建立市民檔案，選擇你的居住分區，完成每日任務可獲得城市幣與經驗值，
          收集 82 個地標徽章，並在提案牆為社區發聲。
        </div>
        <a class="mc-btn google" href="/api/auth/google">
          <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 3-2.2 5.5-4.6 7.2l7.1 5.5c4.2-3.9 6.6-9.6 6.6-17.2z"/><path fill="#FBBC05" d="M10.4 28.7a14.6 14.6 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z"/><path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.6l-7.1-5.5c-2 1.4-4.7 2.2-8.1 2.2-6.4 0-11.7-3.7-13.6-8.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
          使用 Google 登入
        </a>
      </div>`;
  }

  // ======================================================================
  //  公仔建構器：臉部／髮型／身型／服裝／配件／顏色
  // ======================================================================
  const AV_GROUPS = {
    face: [
      { key: 'face', label: '臉型', options: [['oval', '鵝蛋臉'], ['round', '圓臉'], ['square', '方臉'], ['heart', '心形臉'], ['long', '長臉']] },
      { key: 'eyes', label: '眼睛', options: [['almond', '杏眼'], ['round', '圓眼'], ['sharp', '銳利'], ['sleepy', '慵懶'], ['wide', '大眼']] },
      { key: 'brow', label: '眉毛', options: [['natural', '自然'], ['thick', '濃眉'], ['thin', '細眉'], ['raised', '上揚']] },
      { key: 'nose', label: '鼻子', options: [['button', '小巧'], ['straight', '挺直'], ['wide', '寬鼻'], ['small', '迷你']] },
      { key: 'mouth', label: '嘴巴', options: [['smile', '微笑'], ['neutral', '平嘴'], ['grin', '露齒'], ['pout', '嘟嘴']] },
      { key: 'facialHair', label: '鬍子', options: [['none', '無'], ['beard', '落腮鬍'], ['mustache', '八字鬍'], ['goatee', '山羊鬍']] },
    ],
    hair: [
      { key: 'hair', label: '髮型', options: [['short', '短髮'], ['fade', '兩側削短'], ['buzz', '寸頭'], ['curly', '捲髮'], ['long', '長髮'], ['ponytail', '馬尾'], ['bun', '丸子頭'], ['mohawk', '莫西干']] },
    ],
    body: [
      { key: 'body', label: '身型', options: [['slim', '纖瘦'], ['average', '標準'], ['athletic', '健碩'], ['heavy', '豐滿']] },
      { key: 'height', label: '身高', options: [['short', '矮'], ['normal', '中等'], ['tall', '高']] },
    ],
    outfit: [
      { key: 'top', label: '上衣', options: [['tee', 'T恤'], ['shirt', '襯衫'], ['hoodie', '連帽衛衣'], ['jacket', '夾克'], ['blazer', '西裝'], ['dress', '連身裙'], ['tank', '背心']] },
      { key: 'bottom', label: '下身', options: [['jeans', '牛仔褲'], ['shorts', '短褲'], ['skirt', '裙子'], ['trousers', '長褲'], ['leggings', '緊身褲']] },
      { key: 'shoes', label: '鞋子', options: [['sneakers', '波鞋'], ['boots', '靴子'], ['dress', '皮鞋'], ['sandals', '涼鞋']] },
      { key: 'outer', label: '外套', options: [['none', '不穿'], ['coat', '大衣'], ['vest', '背心外套'], ['apron', '圍裙']] },
    ],
    extra: [
      { key: 'glasses', label: '眼鏡', options: [['none', '無'], ['round', '圓框'], ['square', '方框'], ['sun', '太陽眼鏡']] },
      { key: 'hat', label: '帽子', options: [['none', '不戴'], ['cap', '棒球帽'], ['beanie', '毛帽'], ['bucket', '漁夫帽'], ['helmet', '頭盔']] },
      { key: 'accessory', label: '配件', options: [['none', '無'], ['backpack', '背包'], ['scarf', '頸巾'], ['badge', '胸章'], ['headphones', '耳機']] },
    ],
    color: [],
  };

  const AV_COLORS = [
    { key: 'skin', label: '膚色', presets: ['#f7ddc8', '#f2c9a8', '#e8b78f', '#d9a273', '#b87c4e', '#8d5a34'] },
    { key: 'hairColor', label: '髮色', presets: ['#2f2622', '#4a3328', '#6b4a2f', '#a9713f', '#c9a26b', '#d9534f', '#4b6a88', '#8a8f95'] },
    { key: 'topColor', label: '上衣顏色', presets: ['#db6a41', '#e9c46a', '#3e7c8c', '#007562', '#6a4c93', '#c9483f', '#f2f2f2', '#2b2320'] },
    { key: 'bottomColor', label: '下身顏色', presets: ['#3e5c76', '#2b2320', '#6b7d8f', '#8d6e5a', '#c9b79c', '#4a5a3f'] },
    { key: 'shoesColor', label: '鞋子顏色', presets: ['#f7f7f7', '#2b2320', '#6b4a2f', '#c9483f', '#3e7c8c'] },
    { key: 'outerColor', label: '外套顏色', presets: ['#6a9b7a', '#3e5c76', '#8d6e5a', '#2b2320', '#c9b79c'] },
    { key: 'hatColor', label: '帽子顏色', presets: ['#3e7c8c', '#c9483f', '#2b2320', '#e9c46a', '#6a9b7a'] },
    { key: 'accessoryColor', label: '配件顏色', presets: ['#f2c14e', '#c9483f', '#3e7c8c', '#6a4c93', '#2b2320'] },
  ];

  const AV_DEFAULTS = {
    face: 'oval', eyes: 'almond', brow: 'natural', nose: 'button', mouth: 'smile',
    facialHair: 'none', hair: 'short', body: 'average', height: 'normal',
    top: 'tee', bottom: 'jeans', shoes: 'sneakers', outer: 'none',
    glasses: 'none', hat: 'none', accessory: 'none',
    skin: '#f2c9a8', hairColor: '#2f2622', topColor: '#db6a41', bottomColor: '#3e5c76',
    shoesColor: '#f7f7f7', outerColor: '#6a9b7a', hatColor: '#3e7c8c', accessoryColor: '#f2c14e',
  };
  const AV_ENUM_KEYS = ['face', 'eyes', 'brow', 'nose', 'mouth', 'facialHair', 'hair', 'body', 'height', 'top', 'bottom', 'shoes', 'outer', 'glasses', 'hat', 'accessory'];
  const AV_COLOR_KEYS = ['skin', 'hairColor', 'topColor', 'bottomColor', 'shoesColor', 'outerColor', 'hatColor', 'accessoryColor'];

  let avDraft = null;
  let avTab = 'face';

  function normalizeAvatarClient(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    AV_ENUM_KEYS.forEach((key) => {
      const list = (AV_GROUPS.face.concat(AV_GROUPS.hair, AV_GROUPS.body, AV_GROUPS.outfit, AV_GROUPS.extra)
        .find((g) => g.key === key) || { options: [] }).options.map((o) => o[0]);
      out[key] = list.indexOf(src[key]) >= 0 ? src[key] : AV_DEFAULTS[key];
    });
    AV_COLOR_KEYS.forEach((key) => {
      out[key] = /^#[0-9a-fA-F]{6}$/.test(String(src[key] || '')) ? String(src[key]).toLowerCase() : AV_DEFAULTS[key];
    });
    return out;
  }

  function avOptionLabel(key, value) {
    for (const group of Object.keys(AV_GROUPS)) {
      const hit = AV_GROUPS[group].find((g) => g.key === key);
      if (!hit) continue;
      const opt = hit.options.find((o) => o[0] === value);
      if (opt) return opt[1];
    }
    return '';
  }

  // 依設定即時繪製 2D 預覽（與 3D 公仔同一套選項）
  function avatarSVG(a) {
    const W = { slim: 0.88, average: 1, athletic: 1.12, heavy: 1.2 }[a.body] || 1;
    const H = { short: 0.95, normal: 1, tall: 1.06 }[a.height] || 1;
    const skin = a.skin;
    const hair = a.hairColor;
    const top = a.topColor;
    const bottom = a.bottomColor;
    const shoe = a.shoesColor;
    const outer = a.outerColor;
    const hat = a.hatColor;
    const acc = a.accessoryColor;
    const isDress = a.top === 'dress';
    const bareArms = a.top === 'tank' || isDress;
    const bareLegs = isDress || a.bottom === 'skirt' || a.bottom === 'shorts';
    const legColor = bareLegs ? skin : bottom;
    const armColor = bareArms ? skin : top;
    const fs = { oval: [1, 1], round: [1.06, 0.96], square: [1.02, 0.95], heart: [1, 1.02], long: [0.94, 1.08] }[a.face] || [1, 1];
    const hx = 30 * fs[0];
    const hy = 33 * fs[1];
    const p = [];

    p.push('<svg viewBox="0 0 200 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="公仔預覽">');
    p.push('<ellipse cx="100" cy="286" rx="46" ry="9" fill="rgba(33,29,29,.13)"/>');
    p.push(`<g transform="translate(100 286) scale(${W} ${H}) translate(-100 -286)">`);

    if (a.accessory === 'backpack') p.push(`<rect x="62" y="192" width="16" height="46" rx="7" fill="${acc}"/>`);

    p.push(`<rect x="87" y="232" width="11" height="42" rx="5.5" fill="${legColor}"/>`);
    p.push(`<rect x="102" y="232" width="11" height="42" rx="5.5" fill="${legColor}"/>`);

    if (a.shoes === 'boots') {
      p.push(`<rect x="84" y="256" width="17" height="24" rx="4" fill="${shoe}"/>`);
      p.push(`<rect x="100" y="256" width="17" height="24" rx="4" fill="${shoe}"/>`);
    } else if (a.shoes === 'sandals') {
      p.push(`<rect x="84" y="272" width="17" height="6" rx="3" fill="${shoe}"/>`);
      p.push(`<rect x="100" y="272" width="17" height="6" rx="3" fill="${shoe}"/>`);
    } else {
      p.push(`<rect x="83" y="265" width="18" height="11" rx="4" fill="${shoe}"/>`);
      p.push(`<rect x="99" y="265" width="18" height="11" rx="4" fill="${shoe}"/>`);
    }

    if (bareLegs) p.push(`<rect x="82" y="230" width="36" height="16" rx="6" fill="${isDress ? top : bottom}"/>`);
    else p.push(`<rect x="82" y="228" width="36" height="20" rx="7" fill="${bottom}"/>`);
    if (a.bottom === 'skirt' || isDress) {
      p.push(`<path d="M84 226 L116 226 L128 262 Q100 272 72 262 Z" fill="${isDress ? top : bottom}"/>`);
    }

    if (a.outer === 'coat') {
      p.push(`<rect x="64" y="184" width="16" height="66" rx="7" fill="${outer}"/>`);
      p.push(`<rect x="120" y="184" width="16" height="66" rx="7" fill="${outer}"/>`);
    }

    // 長髮與馬尾的後層
    if (a.hair === 'long') p.push(`<rect x="70" y="116" width="60" height="66" rx="18" fill="${hair}"/>`);
    if (a.hair === 'ponytail') p.push(`<path d="M112 116 Q138 140 127 178 Q119 192 111 176 Q121 150 108 128 Z" fill="${hair}"/>`);

    p.push(`<path d="M78 180 Q100 172 122 180 L124 230 Q100 240 76 230 Z" fill="${top}" stroke="rgba(33,29,29,.08)" stroke-width="1.5"/>`);
    if (bareArms) p.push(`<path d="M78 180 Q100 172 122 180 L122 192 Q100 184 78 192 Z" fill="${skin}"/>`);

    p.push(`<rect x="63" y="184" width="13" height="58" rx="6.5" fill="${armColor}"/>`);
    p.push(`<rect x="124" y="184" width="13" height="58" rx="6.5" fill="${armColor}"/>`);
    p.push(`<circle cx="69.5" cy="246" r="6.5" fill="${skin}"/>`);
    p.push(`<circle cx="130.5" cy="246" r="6.5" fill="${skin}"/>`);

    // 服裝細節
    if (a.top === 'shirt') {
      p.push(`<path d="M92 180 L100 194 L108 180 L103 178 L100 184 L97 178 Z" fill="rgba(0,0,0,.15)"/>`);
      p.push(`<rect x="98.5" y="186" width="3" height="42" fill="rgba(255,255,255,.75)"/>`);
    } else if (a.top === 'jacket') {
      p.push(`<rect x="98.5" y="180" width="3" height="50" fill="rgba(230,236,240,.9)"/>`);
    } else if (a.top === 'hoodie') {
      p.push(`<ellipse cx="100" cy="181" rx="20" ry="12" fill="rgba(0,0,0,.16)"/>`);
      p.push(`<rect x="86" y="214" width="28" height="14" rx="5" fill="rgba(0,0,0,.14)"/>`);
    } else if (a.top === 'blazer') {
      p.push(`<path d="M86 181 L100 200 L86 220 Z" fill="rgba(0,0,0,.18)"/>`);
      p.push(`<path d="M114 181 L100 200 L114 220 Z" fill="rgba(0,0,0,.18)"/>`);
      p.push(`<rect x="94" y="181" width="12" height="42" fill="rgba(255,255,255,.82)"/>`);
    }

    if (a.outer === 'vest') p.push(`<path d="M84 182 L116 182 L118 226 L82 226 Z" fill="${outer}" opacity=".94"/>`);
    if (a.outer === 'apron') {
      p.push(`<path d="M86 188 L114 188 L118 232 L82 232 Z" fill="${outer}"/>`);
      p.push(`<rect x="84" y="182" width="5" height="14" fill="${outer}"/>`);
      p.push(`<rect x="111" y="182" width="5" height="14" fill="${outer}"/>`);
    }

    p.push(`<rect x="93" y="160" width="14" height="18" rx="5" fill="${skin}"/>`);
    p.push(`<ellipse cx="100" cy="132" rx="${hx}" ry="${hy}" fill="${skin}"/>`);
    p.push(`<circle cx="${100 - hx + 1}" cy="136" r="5.5" fill="${skin}"/>`);
    p.push(`<circle cx="${100 + hx - 1}" cy="136" r="5.5" fill="${skin}"/>`);

    // 髮型
    const capPath = `<path d="M${100 - hx} 134 Q${100 - hx} 100 100 99 Q${100 + hx} 100 ${100 + hx} 134 Q${100 + hx * 0.6} 119 100 118 Q${100 - hx * 0.6} 119 ${100 - hx} 134 Z" fill="${hair}"/>`;
    if (a.hair === 'buzz') {
      p.push(`<path d="M${100 - hx * 0.98} 126 Q${100 - hx * 0.98} 101 100 100 Q${100 + hx * 0.98} 101 ${100 + hx * 0.98} 126 Q${100 + hx * 0.5} 112 100 111 Q${100 - hx * 0.5} 112 ${100 - hx * 0.98} 126 Z" fill="${hair}"/>`);
    } else if (a.hair === 'curly') {
      p.push(capPath);
      p.push(`<circle cx="${100 - 14}" cy="107" r="11" fill="${hair}"/>`);
      p.push(`<circle cx="100" cy="100" r="12" fill="${hair}"/>`);
      p.push(`<circle cx="${100 + 14}" cy="107" r="11" fill="${hair}"/>`);
    } else if (a.hair === 'bun') {
      p.push(capPath);
      p.push(`<circle cx="100" cy="92" r="12" fill="${hair}"/>`);
    } else if (a.hair === 'mohawk') {
      p.push(`<rect x="94" y="82" width="12" height="34" rx="5" fill="${hair}"/>`);
      p.push(`<rect x="${100 - hx * 0.9}" y="118" width="${hx * 1.8}" height="9" rx="4" fill="${hair}"/>`);
    } else if (a.hair === 'fade') {
      p.push(capPath);
      p.push(`<rect x="${100 - hx - 1}" y="124" width="5" height="14" rx="2" fill="${hair}"/>`);
      p.push(`<rect x="${100 + hx - 4}" y="124" width="5" height="14" rx="2" fill="${hair}"/>`);
    } else {
      p.push(capPath);
      if (a.hair === 'short' || a.hair === 'long' || a.hair === 'ponytail') {
        p.push(`<rect x="${100 - hx + 1}" y="126" width="5" height="12" rx="2" fill="${hair}"/>`);
        p.push(`<rect x="${100 + hx - 6}" y="126" width="5" height="12" rx="2" fill="${hair}"/>`);
      }
    }

    // 五官
    const eyeRy = { almond: 3.4, round: 4.6, sharp: 2.4, sleepy: 2.2, wide: 5 }[a.eyes] || 3.4;
    p.push(`<ellipse cx="${100 - 10}" cy="135" rx="4.8" ry="${eyeRy}" fill="#2b2320"/>`);
    p.push(`<ellipse cx="${100 + 10}" cy="135" rx="4.8" ry="${eyeRy}" fill="#2b2320"/>`);
    const browH = a.brow === 'thick' ? 4 : a.brow === 'thin' ? 2 : 2.8;
    const browY = a.brow === 'raised' ? 123 : 126;
    p.push(`<rect x="${100 - 16}" y="${browY}" width="12" height="${browH}" rx="${browH / 2}" fill="${hair}" transform="rotate(-6 ${100 - 10} ${browY})"/>`);
    p.push(`<rect x="${100 + 4}" y="${browY}" width="12" height="${browH}" rx="${browH / 2}" fill="${hair}" transform="rotate(6 ${100 + 10} ${browY})"/>`);
    if (a.nose === 'wide') p.push(`<ellipse cx="100" cy="143" rx="5" ry="3.5" fill="rgba(0,0,0,.16)"/>`);
    else if (a.nose === 'straight') p.push(`<rect x="97.5" y="136" width="5" height="12" rx="2.5" fill="rgba(0,0,0,.12)"/>`);
    else if (a.nose === 'small') p.push(`<circle cx="100" cy="143" r="2" fill="rgba(0,0,0,.16)"/>`);
    else p.push(`<ellipse cx="100" cy="142" rx="3.6" ry="2.8" fill="rgba(0,0,0,.14)"/>`);

    if (a.mouth === 'grin') {
      p.push(`<path d="M91 149 Q100 159 109 149 Q100 153 91 149 Z" fill="#b3544f"/>`);
      p.push(`<rect x="93" y="149" width="14" height="2" fill="#f8f4ee"/>`);
    } else if (a.mouth === 'neutral') {
      p.push(`<rect x="93" y="150" width="14" height="2.6" rx="1.3" fill="#b3544f"/>`);
    } else if (a.mouth === 'pout') {
      p.push(`<ellipse cx="100" cy="151" rx="4.2" ry="3" fill="#b3544f"/>`);
    } else {
      p.push(`<path d="M92 148 Q100 157 108 148" stroke="#b3544f" stroke-width="3" fill="none" stroke-linecap="round"/>`);
    }

    if (a.facialHair === 'beard') {
      p.push(`<path d="M${100 - hx * 0.92} 138 Q${100 - hx * 0.78} 166 100 169 Q${100 + hx * 0.78} 166 ${100 + hx * 0.92} 138 Q${100 + hx * 0.55} 157 100 157 Q${100 - hx * 0.55} 157 ${100 - hx * 0.92} 138 Z" fill="${hair}" opacity=".92"/>`);
    } else if (a.facialHair === 'mustache') {
      p.push(`<rect x="92" y="145" width="16" height="4" rx="2" fill="${hair}"/>`);
    } else if (a.facialHair === 'goatee') {
      p.push(`<rect x="96" y="156" width="8" height="9" rx="3" fill="${hair}"/>`);
    }

    // 眼鏡
    if (a.glasses === 'round') {
      p.push(`<circle cx="${100 - 10}" cy="135" r="8" fill="none" stroke="#4a4038" stroke-width="2.2"/>`);
      p.push(`<circle cx="${100 + 10}" cy="135" r="8" fill="none" stroke="#4a4038" stroke-width="2.2"/>`);
      p.push(`<rect x="93" y="133.5" width="7" height="2" fill="#4a4038"/>`);
    } else if (a.glasses === 'square' || a.glasses === 'sun') {
      p.push(`<rect x="${100 - 19}" y="${a.glasses === 'sun' ? 130 : 129}" width="16" height="${a.glasses === 'sun' ? 9 : 12}" rx="2" fill="#2b2320"/>`);
      p.push(`<rect x="${100 + 3}" y="${a.glasses === 'sun' ? 130 : 129}" width="16" height="${a.glasses === 'sun' ? 9 : 12}" rx="2" fill="#2b2320"/>`);
      p.push(`<rect x="95" y="133" width="10" height="2" fill="#2b2320"/>`);
    }

    // 帽子
    if (a.hat === 'cap') {
      p.push(`<path d="M${100 - hx * 1.08} 120 Q${100 - hx * 1.08} 91 100 91 Q${100 + hx * 1.08} 91 ${100 + hx * 1.08} 120 Z" fill="${hat}"/>`);
      p.push(`<rect x="96" y="114" width="40" height="7" rx="3.5" fill="${hat}" stroke="rgba(0,0,0,.15)"/>`);
    } else if (a.hat === 'beanie') {
      p.push(`<path d="M${100 - hx * 1.06} 124 Q${100 - hx * 1.06} 88 100 88 Q${100 + hx * 1.06} 88 ${100 + hx * 1.06} 124 Z" fill="${hat}"/>`);
      p.push(`<rect x="${100 - hx * 1.08}" y="116" width="${hx * 2.16}" height="10" rx="5" fill="${hat}" stroke="rgba(0,0,0,.16)"/>`);
    } else if (a.hat === 'bucket') {
      p.push(`<path d="M78 124 L85 100 Q100 94 115 100 L122 124 Z" fill="${hat}"/>`);
      p.push(`<ellipse cx="100" cy="124" rx="34" ry="8" fill="${hat}" stroke="rgba(0,0,0,.16)"/>`);
    } else if (a.hat === 'helmet') {
      p.push(`<path d="M${100 - hx * 1.1} 122 Q${100 - hx * 1.1} 90 100 90 Q${100 + hx * 1.1} 90 ${100 + hx * 1.1} 122 Z" fill="${hat}"/>`);
      p.push(`<rect x="92" y="118" width="26" height="8" rx="3" fill="#2f4a52"/>`);
    }

    // 配件
    if (a.accessory === 'scarf') {
      p.push(`<rect x="86" y="163" width="28" height="11" rx="5.5" fill="${acc}"/>`);
      p.push(`<rect x="104" y="171" width="9" height="24" rx="4" fill="${acc}"/>`);
    } else if (a.accessory === 'badge') {
      p.push(`<circle cx="112" cy="198" r="6.5" fill="${acc}" stroke="rgba(0,0,0,.18)"/>`);
      p.push(`<circle cx="112" cy="198" r="2.6" fill="#fdf7e3"/>`);
    } else if (a.accessory === 'headphones') {
      p.push(`<path d="M${100 - hx - 2} 130 Q${100 - hx - 2} 92 100 92 Q${100 + hx + 2} 92 ${100 + hx + 2} 130" stroke="#2b2320" stroke-width="5" fill="none"/>`);
      p.push(`<circle cx="${100 - hx - 2}" cy="134" r="7" fill="${acc}"/>`);
      p.push(`<circle cx="${100 + hx + 2}" cy="134" r="7" fill="${acc}"/>`);
    }

    p.push('</g></svg>');
    return p.join('');
  }

  function syncAvatarPreview() {
    const fig = $('#mc-av-figure');
    fig.innerHTML = avatarSVG(avDraft);
    $('#mc-av-summary').textContent =
      `${avOptionLabel('face', avDraft.face)} · ${avOptionLabel('hair', avDraft.hair)} · ${avOptionLabel('body', avDraft.body)} · ${avOptionLabel('top', avDraft.top)}`;
  }

  function renderAvatarPane() {
    const pane = $('#mc-av-pane');
    if (avTab === 'color') {
      pane.innerHTML = AV_COLORS.map((g) => `
        <div class="mc-av-group">
          <div class="mc-av-label">${g.label}</div>
          <div class="mc-av-colors">
            ${g.presets.map((c) => `<button type="button" class="mc-av-swatch ${avDraft[g.key] === c ? 'mc-active' : ''}" data-color-key="${g.key}" data-val="${c}" style="background:${c};" aria-label="${c}"></button>`).join('')}
            <input type="color" class="mc-av-picker" data-picker="${g.key}" value="${avDraft[g.key]}" aria-label="${g.label}自訂顏色">
          </div>
        </div>`).join('');
      return;
    }
    pane.innerHTML = (AV_GROUPS[avTab] || []).map((g) => `
      <div class="mc-av-group">
        <div class="mc-av-label">${g.label}</div>
        <div class="mc-av-chips">
          ${g.options.map((o) => `<button type="button" class="mc-av-chip ${avDraft[g.key] === o[0] ? 'mc-active' : ''}" data-key="${g.key}" data-val="${o[0]}">${o[1]}</button>`).join('')}
        </div>
      </div>`).join('');
  }

  function renderAvatarBuilder() {
    avRoot.querySelectorAll('[data-av-tab]').forEach((b) => {
      b.classList.toggle('mc-active', b.dataset.avTab === avTab);
    });
    renderAvatarPane();
    syncAvatarPreview();
  }

  function openAvatarBuilder() {
    const u = state.me && state.me.user;
    if (!u) return;
    avDraft = normalizeAvatarClient(u.avatar);
    avTab = 'face';
    avRoot.hidden = false;
    avRoot.classList.add('mc-open');
    renderAvatarBuilder();
  }

  function closeAvatarBuilder() {
    avRoot.classList.remove('mc-open');
    setTimeout(() => { avRoot.hidden = true; }, 180);
  }

  function randomAvatar() {
    const all = AV_GROUPS.face.concat(AV_GROUPS.hair, AV_GROUPS.body, AV_GROUPS.outfit, AV_GROUPS.extra);
    all.forEach((g) => {
      avDraft[g.key] = g.options[Math.floor(Math.random() * g.options.length)][0];
    });
    AV_COLORS.forEach((g) => {
      avDraft[g.key] = g.presets[Math.floor(Math.random() * g.presets.length)];
    });
    renderAvatarBuilder();
  }

  avRoot.addEventListener('click', (e) => {
    if (e.target.closest('[data-av-close]')) { closeAvatarBuilder(); return; }
    const tabBtn = e.target.closest('[data-av-tab]');
    if (tabBtn) { avTab = tabBtn.dataset.avTab; renderAvatarBuilder(); return; }
    const chip = e.target.closest('[data-key]');
    if (chip) {
      avDraft[chip.dataset.key] = chip.dataset.val;
      renderAvatarBuilder();
      return;
    }
    const swatch = e.target.closest('[data-color-key]');
    if (swatch) {
      avDraft[swatch.dataset.colorKey] = swatch.dataset.val;
      renderAvatarPane();
      syncAvatarPreview();
    }
  });

  avRoot.addEventListener('input', (e) => {
    const picker = e.target.closest('[data-picker]');
    if (!picker) return;
    avDraft[picker.dataset.picker] = picker.value;
    syncAvatarPreview();
  });

  $('#mc-av-random').addEventListener('click', randomAvatar);
  $('#mc-av-reset').addEventListener('click', () => {
    avDraft = normalizeAvatarClient(null);
    renderAvatarBuilder();
  });
  $('#mc-av-cancel').addEventListener('click', closeAvatarBuilder);
  $('#mc-av-save').addEventListener('click', async () => {
    const btn = $('#mc-av-save');
    btn.disabled = true;
    try {
      const r = await api('/api/avatar', { method: 'POST', body: JSON.stringify({ avatar: avDraft }) });
      if (state.me && state.me.user) state.me.user.avatar = r.avatar;
      closeAvatarBuilder();
      render();
      refreshWorld();
      toast('公仔已更新，3D 地圖同步中');
    } catch {
      toast('儲存失敗，請稍後再試');
    } finally {
      btn.disabled = false;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !avRoot.hidden) closeAvatarBuilder();
  });

  // ---------- 各分頁 ----------
  function renderProfile() {
    const me = state.me;
    if (!me || !me.authenticated) {
      body.innerHTML = loginCard();
      return;
    }
    const u = me.user;
    if (!u.onboarded) {
      const districts = state.districts || [];
      body.innerHTML = `
        <div class="mc-card">
          <div style="font-size:14px;font-weight:800;margin-bottom:4px;">建立市民檔案</div>
          <div class="mc-muted">選擇一個分區作為你的起點，之後可隨時在檔案中查看。</div>
          <label class="mc-label" for="mc-nick">市民暱稱</label>
          <input class="mc-input" id="mc-nick" maxlength="20" value="${esc(u.nickname || u.name || '')}" placeholder="例如：路環觀察員">
          <label class="mc-label" for="mc-district">居住分區</label>
          <select class="mc-select" id="mc-district">
            ${districts.map((d) => `<option value="${esc(d.id)}">${esc(d.icon)} ${esc(d.code)} · ${esc(d.name)}</option>`).join('')}
          </select>
          <div style="margin-top:14px;">
            <button class="mc-btn" id="mc-onboard" type="button">成為市民 · 領取 200 城市幣</button>
          </div>
        </div>`;
      const btn = $('#mc-onboard');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await api('/api/onboard', {
            method: 'POST',
            body: JSON.stringify({ nickname: $('#mc-nick').value.trim(), districtId: $('#mc-district').value }),
          });
          await loadMe(true);
          toast('歡迎加入，已獲得新手獎勵');
          render();
        } catch (err) {
          toast(err.message === 'nickname_too_short' ? '暱稱至少 2 個字' : '建立失敗，請稍後再試');
          btn.disabled = false;
        }
      });
      return;
    }

    const counts = u.counts || { discoveries: 0, proposals: 0, votes: 0 };
    const goal = state.city && state.city.goal;
    const pct = Math.min(100, Math.round((counts.discoveries / 82) * 100));
    const districts = state.districts || [];
    const AVATAR_EMOJIS = ['🙂', '😎', '🧑‍🎓', '👩‍💻', '👨‍🔧', '🧕', '👵', '🧑‍🚀', '🌟', '🏙'];
    body.innerHTML = `
      <div class="mc-stats">
        <div class="mc-stat"><b>${counts.discoveries}<span style="font-size:11px;opacity:.6">/82</span></b><span>地標收集</span></div>
        <div class="mc-stat"><b>${counts.proposals}</b><span>城市提案</span></div>
        <div class="mc-stat"><b>${counts.votes}</b><span>參與投票</span></div>
        <div class="mc-stat"><b>${counts.reputation || 0}</b><span>城市聲望</span></div>
      </div>

      ${state.festival ? `
      <div class="mc-card">
        <div class="mc-row" style="justify-content:space-between;">
          <b style="font-size:13px;">${esc(state.festival.emoji)} 今日節慶 · ${esc(state.festival.name)}</b>
        </div>
        <div class="mc-muted" style="margin-top:4px;">${esc(state.festival.message)}</div>
      </div>` : ''}

      <div class="mc-card">
        <div class="mc-row" style="justify-content:space-between;margin-bottom:4px;">
          <b style="font-size:13px;">🎨 個人資料與公仔</b>
          ${u.isAdmin ? '<a class="mc-btn ghost" href="/admin.html" target="_blank" rel="noopener" style="text-decoration:none;">🛠 管理後台</a>' : ''}
        </div>
        <label class="mc-label" for="mc-p-nick">市民暱稱</label>
        <input class="mc-input" id="mc-p-nick" maxlength="20" value="${esc(u.nickname || '')}">

        <div class="mc-row" style="gap:8px;align-items:flex-end;">
          <div style="flex:1;">
            <label class="mc-label" for="mc-p-gender">性別</label>
            <select class="mc-select" id="mc-p-gender">
              <option value="male" ${u.gender === 'male' ? 'selected' : ''}>男</option>
              <option value="female" ${u.gender === 'female' ? 'selected' : ''}>女</option>
              <option value="other" ${!u.gender || u.gender === 'other' ? 'selected' : ''}>其他／不公開</option>
            </select>
          </div>
          <div style="flex:1;">
            <label class="mc-label" for="mc-p-emoji">頭像</label>
            <select class="mc-select" id="mc-p-emoji">
              ${AVATAR_EMOJIS.map((e) => `<option value="${e}" ${e === (u.avatarEmoji || '🙂') ? 'selected' : ''}>${e}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="mc-av-inline">
          <div class="mc-av-thumb">${avatarSVG(normalizeAvatarClient(u.avatar))}</div>
          <div class="mc-av-inline-main">
            <div class="mc-av-inline-title">我的公仔</div>
            <div class="mc-muted" style="font-size:11.5px;margin:2px 0 8px;">
              ${avOptionLabel('face', (u.avatar || {}).face) || '鵝蛋臉'} · ${avOptionLabel('hair', (u.avatar || {}).hair) || '短髮'} · ${avOptionLabel('body', (u.avatar || {}).body) || '標準'} · ${avOptionLabel('top', (u.avatar || {}).top) || 'T恤'}
            </div>
            <button class="mc-btn" id="mc-open-avatar" type="button">🎨 打開公仔建構器</button>
          </div>
        </div>

        <label class="mc-label" for="mc-p-district">居住分區</label>
        <select class="mc-select" id="mc-p-district">
          ${districts.map((d) => `<option value="${esc(d.id)}" ${d.id === u.districtId ? 'selected' : ''}>${esc(d.icon)} ${esc(d.code)} · ${esc(d.name)}</option>`).join('')}
        </select>

        <label class="mc-label" for="mc-p-bio">自我介紹 <span style="opacity:.6;font-weight:400;">（最多 120 字）</span></label>
        <textarea class="mc-input" id="mc-p-bio" rows="2" maxlength="120" placeholder="說說你喜歡澳門的哪一角…">${esc(u.bio || '')}</textarea>

        <div style="margin-top:12px;display:flex;gap:8px;align-items:center;">
          <button class="mc-btn" id="mc-save-profile" type="button">儲存個人資料</button>
          <span class="mc-muted" style="font-size:11.5px;">公仔會即時出現在 3D 地圖</span>
        </div>
      </div>

      <div class="mc-card">
        <div class="mc-row" style="justify-content:space-between;">
          <b style="font-size:12.5px;">探索進度</b>
          <span class="mc-muted">${pct}%</span>
        </div>
        <div class="mc-progress"><i style="width:${pct}%"></i></div>
        <div class="mc-muted">點擊 3D 場景中的地標即可自動登錄圖鑑，集齊一個分區解鎖該區故事。</div>
      </div>

      ${u.district ? `
      <div class="mc-card">
        <div class="mc-row">
          <div style="font-size:26px;">${esc(u.district.icon || '🏙')}</div>
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:800;">${esc(u.district.name)}</div>
            <div class="mc-muted">${esc(u.district.macro_region || '')}</div>
          </div>
        </div>
      </div>` : ''}

      ${goal ? `
      <div class="mc-card">
        <div class="mc-row" style="justify-content:space-between;">
          <b style="font-size:12.5px;">🤝 ${esc(goal.title)}</b>
          <span class="mc-muted">${goal.progress}/${goal.target}</span>
        </div>
        <div class="mc-progress"><i style="width:${Math.round((goal.progress / goal.target) * 100)}%"></i></div>
        <div class="mc-muted">全城共同努力，達標後解鎖限定夜景與紀念徽章。</div>
      </div>` : ''}

      <div class="mc-card">
        <div class="mc-row wrap" style="gap:8px;">
          <button class="mc-btn ghost" id="mc-refresh" type="button">重新整理</button>
          <button class="mc-btn ghost" id="mc-logout" type="button">登出</button>
        </div>
      </div>`;

    const saveProfile = $('#mc-save-profile');
    if (saveProfile) {
      saveProfile.addEventListener('click', async () => {
        saveProfile.disabled = true;
        try {
          const r = await api('/api/profile', {
            method: 'POST',
            body: JSON.stringify({
              nickname: $('#mc-p-nick').value.trim(),
              gender: $('#mc-p-gender').value,
              avatarEmoji: $('#mc-p-emoji').value,
              avatar: u.avatar,
              districtId: $('#mc-p-district').value,
              bio: $('#mc-p-bio').value.trim(),
            }),
          });
          if (r.tasks) state.me.tasks = r.tasks;
          await loadAll();
          render();
          toast('個人資料已更新，公仔已同步到 3D 地圖');
        } catch (err) {
          toast(err.message === 'nickname_too_short' ? '暱稱至少 2 個字' : '儲存失敗，請稍後再試');
          saveProfile.disabled = false;
        }
      });
    }

    const openAvatar = $('#mc-open-avatar');
    if (openAvatar) openAvatar.addEventListener('click', openAvatarBuilder);

    $('#mc-refresh').addEventListener('click', async () => {
      await loadAll();
      toast('已更新');
      render();
    });
    $('#mc-logout').addEventListener('click', async () => {
      try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* 忽略 */ }
      state.me = null;
      paintHead();
      render();
      toast('已登出');
    });
  }

  async function ensureDistricts() {
    if (!state.districts) {
      const d = await api('/api/districts');
      state.districts = d.districts;
    }
    return state.districts;
  }

  async function renderAtlas() {
    if (!state.me || !state.me.authenticated) {
      body.innerHTML = loginCard('登入後開始收集 82 個地標徽章');
      return;
    }
    try {
      await ensureDistricts();
    } catch {
      body.innerHTML = '<div class="mc-empty">讀取分區資料失敗</div>';
      return;
    }
    const districts = state.districts;
    if (!state.atlasDistrict) state.atlasDistrict = state.me.user.districtId || districts[0].id;
    const current = districts.find((d) => d.id === state.atlasDistrict) || districts[0];

    body.innerHTML = `
      <label class="mc-label" for="mc-atlas-district">選擇分區</label>
      <select class="mc-select" id="mc-atlas-district">
        ${districts.map((d) => `<option value="${esc(d.id)}" ${d.id === current.id ? 'selected' : ''}>${esc(d.icon)} ${esc(d.code)} · ${esc(d.name)}（${d.discovered || 0}/${d.landmarkCount}）</option>`).join('')}
      </select>
      <div class="mc-row" style="justify-content:space-between;margin:12px 0 6px;">
        <b style="font-size:12.5px;">${esc(current.icon)} ${esc(current.name)}</b>
        <span class="mc-muted">${current.discovered || 0}/${current.landmarkCount} 已收集</span>
      </div>
      <div class="mc-progress"><i style="width:${current.landmarkCount ? Math.round(((current.discovered || 0) / current.landmarkCount) * 100) : 0}%"></i></div>
      <div id="mc-atlas-list" style="margin-top:10px;"><div class="mc-empty">載入中…</div></div>`;

    $('#mc-atlas-district').addEventListener('change', (e) => {
      state.atlasDistrict = e.target.value;
      state.landmarks = null;
      renderAtlas();
    });

    try {
      if (!state.landmarks || state.landmarksDistrict !== current.id) {
        const d = await api(`/api/landmarks?district=${encodeURIComponent(current.id)}`);
        state.landmarks = d.landmarks;
        state.landmarksDistrict = current.id;
      }
    } catch {
      $('#mc-atlas-list').innerHTML = '<div class="mc-empty">讀取地標失敗</div>';
      return;
    }
    $('#mc-atlas-list').innerHTML = `
      <div class="mc-atlas-grid">
        ${state.landmarks.map((l) => `
          <button class="mc-atlas-item ${l.discovered ? 'mc-found' : 'mc-locked'}" data-landmark="${esc(l.id)}" type="button">
            ${esc(l.name)}
          </button>`).join('')}
      </div>`;
    $('#mc-atlas-list').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-landmark]');
      if (!btn) return;
      const id = btn.dataset.landmark;
      if (window.macaoBridge && typeof window.macaoBridge.selectItem === 'function') {
        window.macaoBridge.selectItem(id);
        closePanel();
      } else {
        toast('3D 場景尚未就緒');
      }
    });
  }

  // ---------- 建設沙盤 ----------
  // 把沙盤資料送到 3D 場景（模組載入較慢時自動重試）
  let sandboxPushTimer = null;
  function pushSandbox3D(districtId, slots) {
    if (!districtId || !Array.isArray(slots)) return;
    if (sandboxPushTimer) { clearInterval(sandboxPushTimer); sandboxPushTimer = null; }
    const apply = () => {
      if (window.macaoBridge && typeof window.macaoBridge.renderSandbox === 'function') {
        window.macaoBridge.renderSandbox(districtId, slots);
        return true;
      }
      return false;
    };
    if (apply()) return;
    let tries = 0;
    sandboxPushTimer = setInterval(() => {
      tries += 1;
      if (apply() || tries > 40) {
        clearInterval(sandboxPushTimer);
        sandboxPushTimer = null;
      }
    }, 250);
  }

  function focusSandbox3D(districtId) {
    if (!districtId || !window.macaoBridge) { toast('3D 場景尚未就緒'); return; }
    window.macaoBridge.focusDistrict(districtId);
    closePanel();
    toast('已帶你到分區，可查看你的建設');
  }

  // 市民與分區活力同步到 3D 場景
  function pushCitizens3D(list) {
    const apply = () => {
      if (window.macaoBridge && typeof window.macaoBridge.renderCitizens === 'function') {
        window.macaoBridge.renderCitizens(list);
        return true;
      }
      return false;
    };
    if (apply()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (apply() || tries > 40) clearInterval(timer);
    }, 250);
  }

  function pushVitality3D(districts) {
    const apply = () => {
      if (window.macaoBridge && typeof window.macaoBridge.renderVitalityRings === 'function') {
        window.macaoBridge.renderVitalityRings(districts);
        return true;
      }
      return false;
    };
    if (apply()) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (apply() || tries > 40) clearInterval(timer);
    }, 250);
  }

  async function refreshWorld() {
    try {
      const [overview, citizens] = await Promise.all([
        api('/api/sandbox/overview'),
        api('/api/citizens'),
      ]);
      state.city = state.city || {};
      state.city.districts = overview.districts;
      pushVitality3D(overview.districts || []);
      pushCitizens3D(citizens.citizens || []);
    } catch {
      /* 3D 疊加屬非必要 */
    }
  }

  function slotGrid(slots, interactive) {
    return `<div class="mc-slot-grid">${slots.map((s) => (s.type
      ? `<button class="mc-slot mc-slot-filled" data-slot="${s.slot}" type="button" ${interactive ? '' : 'disabled'}>
           <span class="mc-slot-icon">${esc(s.icon)}</span>
           <span class="mc-slot-name">${esc(s.name)}</span>
         </button>`
      : `<button class="mc-slot" data-slot="${s.slot}" type="button" ${interactive ? '' : 'disabled'}>
           <span class="mc-slot-plus">＋</span>
         </button>`)).join('')}</div>`;
  }

  async function renderSandbox() {
    const me = state.me;
    if (!me || !me.authenticated) {
      body.innerHTML = loginCard('登入後在自己的居住分區建設公園、市集與公共設施');
      return;
    }
    if (!me.user.onboarded) {
      body.innerHTML = '<div class="mc-empty">請先到「市民檔案」建立暱稱與居住分區。</div>';
      return;
    }
    if (state.sandboxVisit) {
      await renderSandboxVisit(state.sandboxVisit);
      return;
    }
    body.innerHTML = '<div class="mc-empty">載入中…</div>';
    try {
      state.sandbox = await api('/api/sandbox/me');
    } catch {
      body.innerHTML = '<div class="mc-empty">讀取沙盤失敗，請稍後再試。</div>';
      return;
    }
    paintSandbox();
    loadNeighbours();
  }

  function paintSandbox() {
    const sb = state.sandbox;
    if (!sb) return;
    const sel = state.sandboxSlot;
    const selSlot = sel != null ? sb.slots.find((s) => s.slot === sel) : null;

    body.innerHTML = `
      <div class="mc-card mc-sand-hero">
        <div class="mc-sand-district">${esc(sb.district ? sb.district.icon : '🏙')} ${esc(sb.district ? sb.district.name : '未選分區')}</div>
        <div class="mc-muted">${esc(sb.district ? sb.district.macro_region || '' : '')}</div>
        <div class="mc-stats" style="margin:10px 0 0;">
          <div class="mc-stat"><b>💰 ${sb.coins}</b><span>可用城市幣</span></div>
          <div class="mc-stat"><b>${sb.vitality}</b><span>沙盤活力</span></div>
          <div class="mc-stat"><b>${sb.built}/${sb.slots.length}</b><span>已建設</span></div>
          <div class="mc-stat"><b>${sb.likesReceived}</b><span>鄰里點讚</span></div>
        </div>
      </div>

      ${slotGrid(sb.slots, true)}

      <div id="mc-slot-panel" style="margin-top:12px;"></div>

      <div id="mc-neigh"></div>

      <div style="text-align:center;margin-top:12px;">
        <button class="mc-btn ghost" id="mc-sand-3d" type="button">🎥 在 3D 場景查看</button>
        <button class="mc-btn ghost" id="mc-sand-refresh" type="button">更新沙盤</button>
      </div>`;

    if (sb.district) pushSandbox3D(sb.district.id, sb.slots);

    const panel = $('#mc-slot-panel');
    if (selSlot && selSlot.type) {
      panel.innerHTML = `
        <div class="mc-card">
          <div class="mc-row" style="justify-content:space-between;">
            <b style="font-size:13px;">${esc(selSlot.icon)} ${esc(selSlot.name)}</b>
            <span class="mc-muted">活力 +${selSlot.vitality}</span>
          </div>
          <div class="mc-muted" style="margin:6px 0 10px;">拆除後可退回 40% 建設費用。</div>
          <button class="mc-btn ghost" id="mc-demolish" type="button">🗑 拆除這項建設</button>
        </div>`;
      $('#mc-demolish').addEventListener('click', async () => {
        state.sandboxSlot = null;
        try {
          const r = await api('/api/sandbox/demolish', { method: 'POST', body: JSON.stringify({ slot: selSlot.slot }) });
          toast(`已拆除，退回 ${r.refund} 城市幣`);
          await loadSandbox();
        } catch {
          toast('拆除失敗');
        }
      });
    } else {
      const affordable = sb.catalog.filter((c) => !c.locked && sb.coins >= c.cost).length;
      const catalog = sb.catalog.map((c) => {
        const poor = !c.locked && sb.coins < c.cost;
        return `
        <button class="mc-build ${c.locked ? 'mc-build-locked' : ''} ${poor ? 'mc-build-poor' : ''}" data-build="${esc(c.type)}" type="button" ${c.locked || poor ? 'disabled' : ''}>
          <span class="mc-build-icon">${esc(c.icon)}</span>
          <span class="mc-build-main">
            <b>${esc(c.name)}</b>
            <small>${esc(c.desc)}</small>
          </span>
          <span class="mc-build-cost">
            ${c.locked ? `Lv.${c.level} 解鎖` : poor ? `幣不足 · 需 ${c.cost}` : `💰 ${c.cost}`}
            <small>活力 +${c.vitality}</small>
          </span>
        </button>`;
      }).join('');
      panel.innerHTML = `
        <div class="mc-card">
          <b style="font-size:12.5px;">${sel == null ? '點選一個空格開始建設' : `第 ${sel + 1} 格 · 選擇設施`}</b>
          <div class="mc-muted" style="margin:4px 0 8px;">建設會永久增加分區活力，其他市民可前來參觀與點讚。</div>
          ${sel != null && affordable === 0
            ? `<div class="mc-empty" style="padding:14px 6px;">目前城市幣 ${sb.coins}，尚不足以建設已解鎖設施。<br>
                 <button class="mc-btn ghost" id="mc-go-tasks" type="button" style="margin-top:10px;">去完成每日任務賺幣</button></div>`
            : ''}
          ${sel == null ? '' : catalog}
        </div>`;
      const goTasks = $('#mc-go-tasks');
      if (goTasks) {
        goTasks.addEventListener('click', () => {
          state.tab = 'tasks';
          state.sandboxSlot = null;
          syncTabs();
          render();
        });
      }
      if (sel != null) {
        panel.querySelectorAll('[data-build]').forEach((b) => {
          b.addEventListener('click', async () => {
            const type = b.dataset.build;
            b.disabled = true;
            try {
              const r = await api('/api/sandbox/build', { method: 'POST', body: JSON.stringify({ slot: sel, type }) });
              if (window.macaoBridge && window.macaoBridge.celebrateSlot && sb.district) {
                window.macaoBridge.celebrateSlot(sb.district.id, sel);
              }
              state.sandboxSlot = null;
              if (r.tasks) state.me.tasks = r.tasks;
              toast(`🏗 已建成，活力 +${r.building.vitality}`);
              await loadSandbox();
            } catch (err) {
              const map = {
                not_enough_coins: '城市幣不足',
                slot_taken: '這一格已經有建設',
                level_locked: '等級不足，繼續探索升級吧',
              };
              const detail = err.message === 'not_enough_coins' && err.data
                ? `（需 ${err.data.cost}，現有 ${sb.coins}）`
                : '';
              toast((map[err.message] || '建設失敗') + detail);
              b.disabled = false;
            }
          });
        });
      }
    }

    body.querySelectorAll('[data-slot]').forEach((b) => {
      b.addEventListener('click', () => {
        state.sandboxSlot = Number(b.dataset.slot);
        paintSandbox();
        loadNeighbours();
      });
    });
    $('#mc-sand-refresh').addEventListener('click', async () => {
      await loadSandbox();
      await loadMe(true);
      toast('沙盤已更新');
    });
    $('#mc-sand-3d').addEventListener('click', () => {
      focusSandbox3D(sb.district ? sb.district.id : null);
    });
  }

  async function loadSandbox() {
    try {
      state.sandbox = await api('/api/sandbox/me');
      paintSandbox();
      loadNeighbours();
    } catch { /* 保留原畫面 */ }
  }

  async function loadNeighbours() {
    const box = body.querySelector('#mc-neigh');
    if (!box) return;
    try {
      const d = await api('/api/sandbox/overview');
      box.innerHTML = `
        <div class="mc-card" style="margin-top:12px;">
          <b style="font-size:12.5px;">🏘 鄰里沙盤</b>
          ${d.plots.length
            ? d.plots.map((p) => `
              <div class="mc-rank-row">
                <div class="mc-rank-no">${esc(p.districtIcon || '🏙')}</div>
                <div class="mc-rank-name">${esc(p.nickname)}
                  <div class="mc-rank-sub">${esc(p.districtName)} · ${p.buildings} 項建設 · ❤ ${p.likes}</div>
                </div>
                <button class="mc-btn ghost" data-visit="${p.id}" type="button">參觀</button>
              </div>`).join('')
            : '<div class="mc-empty">還沒有人開始建設，你可以成為第一位。</div>'}
          <div class="mc-muted" style="margin:12px 0 4px;">分區活力榜</div>
          ${d.districts.length
            ? d.districts.map((x, i) => `
              <div class="mc-rank-row">
                <div class="mc-rank-no">${i + 1}</div>
                <div class="mc-rank-name">${esc(x.icon)} ${esc(x.name)}</div>
                <div class="mc-rank-score">${x.vitality}</div>
              </div>`).join('')
            : '<div class="mc-empty">尚未有活力數據</div>'}
        </div>`;
      box.querySelectorAll('[data-visit]').forEach((b) => {
        b.addEventListener('click', () => {
          state.sandboxVisit = Number(b.dataset.visit);
          renderSandbox();
        });
      });
    } catch {
      box.innerHTML = '';
    }
  }

  async function renderSandboxVisit(userId) {
    body.innerHTML = '<div class="mc-empty">載入中…</div>';
    let d;
    try {
      d = await api(`/api/sandbox/user/${userId}`);
    } catch {
      state.sandboxVisit = null;
      body.innerHTML = '<div class="mc-empty">找不到這位市民的沙盤。</div>';
      return;
    }
    body.innerHTML = `
      <button class="mc-btn ghost" id="mc-sand-back" type="button">← 返回我的沙盤</button>
      <div class="mc-card" style="margin-top:10px;">
        <div class="mc-row">
          <div class="mc-head-avatar" style="width:38px;height:38px;font-size:16px;">
            ${d.owner.avatarUrl ? `<img src="${esc(d.owner.avatarUrl)}" alt="" referrerpolicy="no-referrer">` : '🏙'}
          </div>
          <div style="min-width:0;">
            <div style="font-size:13px;font-weight:800;">${esc(d.owner.nickname || '市民')} Lv.${d.owner.level}</div>
            <div class="mc-muted">${esc(d.owner.districtIcon || '')} ${esc(d.owner.districtName || '')}${d.reputation ? ` · 🏅 聲望 ${d.reputation}` : ''}</div>
          </div>
        </div>
      </div>
      ${slotGrid(d.slots, false)}
      <div class="mc-row" style="margin-top:12px;justify-content:space-between;">
        <span class="mc-muted">沙盤活力 ${d.vitality} · ${d.built} 項建設</span>
        ${d.isOwner ? '<span class="mc-muted">這是你的沙盤</span>'
          : `<div class="mc-row" style="gap:6px;">
               <button class="mc-btn ghost" id="mc-visit-pm" type="button">私訊</button>
               <button class="mc-btn ghost" id="mc-visit-greet" type="button">👋 打招呼</button>
               <button class="mc-vote ${d.liked ? 'mc-voted' : ''}" id="mc-visit-like" type="button">👍 ${d.likes}</button>
             </div>`}
      </div>
      <div style="text-align:center;margin-top:12px;">
        <button class="mc-btn ghost" id="mc-visit-3d" type="button">🎥 在 3D 場景參觀</button>
      </div>`;

    if (d.owner.districtId) pushSandbox3D(d.owner.districtId, d.slots);

    // 好友巡訪：只記錄一次，好友才計入每日任務
    if (!d.isOwner && state.me && state.me.authenticated) {
      api(`/api/sandbox/visit/${d.owner.id}`, { method: 'POST', body: '{}' })
        .then((r) => {
          if (r.tasks) state.me.tasks = r.tasks;
          if (r.isFriend && !r.already) toast(`🤝 已巡訪好友沙盤 +${r.reward.coins} 城市幣`);
        })
        .catch(() => { /* 巡訪記錄屬非必要 */ });
    }

    $('#mc-visit-3d').addEventListener('click', () => focusSandbox3D(d.owner.districtId));

    $('#mc-sand-back').addEventListener('click', () => {
      state.sandboxVisit = null;
      renderSandbox();
    });
    const likeBtn = $('#mc-visit-like');
    if (likeBtn) {
      likeBtn.addEventListener('click', async () => {
        if (!state.me || !state.me.authenticated) { toast('請先登入'); return; }
        likeBtn.disabled = true;
        try {
          const r = await api(`/api/sandbox/like/${d.owner.id}`, { method: 'POST', body: '{}' });
          likeBtn.classList.toggle('mc-voted', r.liked);
          likeBtn.textContent = `👍 ${r.likes}`;
          likeBtn.disabled = false;
          if (r.tasks) state.me.tasks = r.tasks;
          if (r.liked) toast('已為鄰里點讚 +2 城市幣');
        } catch {
          toast('點讚失敗');
          likeBtn.disabled = false;
        }
      });
    }

    const pmBtn = $('#mc-visit-pm');
    if (pmBtn) {
      pmBtn.addEventListener('click', () => openMessageTo(d.owner.id));
    }

    const greetBtn = $('#mc-visit-greet');
    if (greetBtn) {
      greetBtn.addEventListener('click', async () => {
        if (!state.me || !state.me.authenticated) { toast('請先登入'); return; }
        greetBtn.disabled = true;
        try {
          const r = await api(`/api/greet/${d.owner.id}`, { method: 'POST', body: '{}' });
          if (r.tasks) state.me.tasks = r.tasks;
          greetBtn.textContent = r.already ? '👋 今日已打招呼' : '👋 已打招呼 +4 幣';
          toast(r.already ? '今天已經和這位鄰居打過招呼了' : `👋 已打招呼 +4 城市幣，對方 +2`);
          if (!r.already) loadMe(true);
        } catch (err) {
          toast(err.message === 'daily_limit' ? '今日打招呼已達 5 次上限' : '打招呼失敗');
          greetBtn.disabled = false;
        }
      });
    }
  }

  function renderTasks() {
    const me = state.me;
    if (!me || !me.authenticated) {
      body.innerHTML = loginCard('登入後解鎖每日任務與連續登入獎勵');
      return;
    }
    const tasks = me.tasks || [];
    body.innerHTML = `
      <div class="mc-card">
        <div class="mc-row" style="justify-content:space-between;">
          <b style="font-size:12.5px;">🔥 連續登入 ${me.streak} 天</b>
          <span class="mc-muted">${esc(me.day || '')}</span>
        </div>
        <div class="mc-muted" style="margin-top:4px;">每日登入自動獲得城市幣，連續越久獎勵越高。</div>
      </div>
      ${tasks.map((t) => `
        <div class="mc-task ${t.completed ? 'mc-done' : ''}">
          <div style="font-size:18px;">${t.completed ? '✅' : '🎯'}</div>
          <div class="mc-task-main">
            <div class="mc-task-title">${esc(t.title)}</div>
            <div class="mc-task-meta">進度 ${t.progress}/${t.goal} · +${t.xp} XP · +${t.coins} 幣</div>
            <div class="mc-progress" style="margin-top:5px;"><i style="width:${Math.round((t.progress / t.goal) * 100)}%"></i></div>
          </div>
          <div class="mc-task-reward">${t.completed ? '已完成' : '進行中'}</div>
        </div>`).join('')}
      <div class="mc-muted" style="margin-top:10px;text-align:center;">任務每天 00:00（澳門時間）重置</div>`;
  }

  async function renderProposals() {
    const authed = state.me && state.me.authenticated;
    body.innerHTML = `
      <div class="mc-row wrap" style="gap:8px;margin-bottom:10px;">
        <select class="mc-select" id="mc-prop-district" style="width:auto;flex:1;min-width:130px;">
          <option value="">全部分區</option>
        </select>
        <select class="mc-select" id="mc-prop-category" style="width:auto;flex:1;min-width:120px;">
          <option value="">全部類別</option>
          ${Object.entries(CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <select class="mc-select" id="mc-prop-sort" style="width:auto;flex:0 0 96px;">
          <option value="hot">最多支持</option>
          <option value="new">最新</option>
        </select>
      </div>
      ${authed ? `
      <details class="mc-card" id="mc-prop-new">
        <summary style="cursor:pointer;font-size:12.5px;font-weight:800;">✍️ 提交新建議</summary>
        <label class="mc-label" for="mc-prop-title">標題</label>
        <input class="mc-input" id="mc-prop-title" maxlength="80" placeholder="例如：內港增設遮陽與夜間照明">
        <label class="mc-label" for="mc-prop-body">內容</label>
        <textarea class="mc-textarea" id="mc-prop-body" maxlength="1500" placeholder="描述你的想法、位置與期望效果…"></textarea>
        <div class="mc-row wrap" style="gap:8px;margin-top:8px;">
          <select class="mc-select" id="mc-prop-d2" style="flex:1;min-width:130px;"></select>
          <select class="mc-select" id="mc-prop-cat2" style="flex:0 0 130px;">
            ${Object.entries(CATEGORY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
        </div>
        <div style="margin-top:10px;"><button class="mc-btn" id="mc-prop-submit" type="button">發佈提案 · +20 城市幣</button></div>
      </details>` : `<div class="mc-card mc-muted">登入後可提交提案與投票。</div>`}
      <div id="mc-prop-list"><div class="mc-empty">載入中…</div></div>`;

    try {
      await ensureDistricts();
      const opts = state.districts.map((d) => `<option value="${esc(d.id)}">${esc(d.icon)} ${esc(d.name)}</option>`).join('');
      $('#mc-prop-district').insertAdjacentHTML('beforeend', opts);
      if ($('#mc-prop-d2')) {
        $('#mc-prop-d2').innerHTML = opts;
        if (state.me.user.districtId) $('#mc-prop-d2').value = state.me.user.districtId;
      }
    } catch { /* 分區載入失敗不影響列表 */ }

    const filter = { district: '', category: '', sort: 'hot' };
    const loadList = async () => {
      const qs = new URLSearchParams();
      if (filter.district) qs.set('district', filter.district);
      if (filter.category) qs.set('category', filter.category);
      qs.set('sort', filter.sort);
      $('#mc-prop-list').innerHTML = '<div class="mc-empty">載入中…</div>';
      try {
        const d = await api(`/api/proposals?${qs}`);
        if (!d.proposals.length) {
          $('#mc-prop-list').innerHTML = '<div class="mc-empty">目前還沒有提案，成為第一個發聲的市民吧。</div>';
          return;
        }
        $('#mc-prop-list').innerHTML = d.proposals.map((p) => `
          <article class="mc-proposal">
            <div class="mc-proposal-head">
              <div class="mc-proposal-title">${esc(p.title)}</div>
              <button class="mc-vote ${p.voted ? 'mc-voted' : ''}" data-vote="${p.id}" type="button">👍 ${p.votes}</button>
            </div>
            <div class="mc-proposal-body">${esc(p.body)}</div>
            <div class="mc-proposal-meta">
              <span class="mc-tag">${esc(CATEGORY_LABELS[p.category] || p.category)}</span>
              ${p.district ? `<span>${esc(p.districtIcon || '')} ${esc(p.district)}</span>` : ''}
              <span>· ${esc(p.author)} Lv.${p.authorLevel}</span>
            </div>
          </article>`).join('');
      } catch {
        $('#mc-prop-list').innerHTML = '<div class="mc-empty">讀取提案失敗</div>';
      }
    };

    $('#mc-prop-district').addEventListener('change', (e) => { filter.district = e.target.value; loadList(); });
    $('#mc-prop-category').addEventListener('change', (e) => { filter.category = e.target.value; loadList(); });
    $('#mc-prop-sort').addEventListener('change', (e) => { filter.sort = e.target.value; loadList(); });

    $('#mc-prop-list').addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-vote]');
      if (!btn) return;
      if (!authed) { toast('請先登入'); return; }
      btn.disabled = true;
      try {
        const r = await api(`/api/proposals/${btn.dataset.vote}/vote`, { method: 'POST', body: '{}' });
        btn.classList.toggle('mc-voted', r.voted);
        btn.textContent = `👍 ${r.votes}`;
        btn.disabled = false;
        if (r.voted) toast('已支持這項提案 +3 城市幣');
        if (r.tasks) { state.me.tasks = r.tasks; }
      } catch {
        toast('投票失敗');
        btn.disabled = false;
      }
    });

    if ($('#mc-prop-submit')) {
      $('#mc-prop-submit').addEventListener('click', async () => {
        const btn = $('#mc-prop-submit');
        btn.disabled = true;
        try {
          await api('/api/proposals', {
            method: 'POST',
            body: JSON.stringify({
              title: $('#mc-prop-title').value.trim(),
              body: $('#mc-prop-body').value.trim(),
              category: $('#mc-prop-cat2').value,
              districtId: $('#mc-prop-d2').value,
            }),
          });
          $('#mc-prop-title').value = '';
          $('#mc-prop-body').value = '';
          toast('提案已發佈');
          await loadMe(true);
          await loadList();
          btn.disabled = false;
        } catch (err) {
          toast(err.message === 'daily_limit' ? '今日提案已達 3 篇上限' : '發佈失敗，請檢查內容長度');
          btn.disabled = false;
        }
      });
    }

    await loadList();
  }

  // ---------- 好友與社團 ----------
  const GUILD_ICONS = ['🏙', '🏛', '🎡', '🚝', '🌉', '🏖', '🎓', '🌳', '⚓', '🏮'];

  function personRow(p, actions) {
    return `<div class="mc-rank-row">
      <div class="mc-head-avatar mc-person-avatar">${p.avatarUrl
        ? `<img src="${esc(p.avatarUrl)}" alt="" referrerpolicy="no-referrer">` : '🏙'}</div>
      <div class="mc-rank-name">${esc(p.nickname)}
        <div class="mc-rank-sub">${p.districtIcon ? `${esc(p.districtIcon)} ` : ''}${esc(p.districtName || '未選分區')} · Lv.${p.level}${p.buildings !== undefined ? ` · ${p.buildings} 項建設` : ''}</div>
      </div>
      <div class="mc-row" style="gap:6px;flex:0 0 auto;">${actions}</div>
    </div>`;
  }

  async function renderCommunity() {
    const me = state.me;
    if (!me || !me.authenticated) {
      body.innerHTML = loginCard('登入後可加好友、組社團，一起經營分區');
      return;
    }
    if (!me.user.onboarded) {
      body.innerHTML = '<div class="mc-empty">請先到「市民檔案」建立暱稱與居住分區。</div>';
      return;
    }
    if (state.guildView) {
      await renderGuildDetail(state.guildView);
      return;
    }
    body.innerHTML = '<div class="mc-empty">載入中…</div>';
    let friends, guilds;
    try {
      [friends, guilds] = await Promise.all([api('/api/friends'), api('/api/guilds')]);
    } catch {
      body.innerHTML = '<div class="mc-empty">讀取社群資料失敗，請稍後再試。</div>';
      return;
    }

    const myGuild = guilds.myGuildId ? guilds.guilds.find((g) => g.id === guilds.myGuildId) : null;
    const incomingHtml = friends.incoming.map((p) => personRow(p,
      `<button class="mc-vote" data-accept="${p.requestId}" type="button">接受</button>
       <button class="mc-btn ghost" data-decline="${p.requestId}" type="button">拒絕</button>`
    )).join('');
    const outgoingHtml = friends.outgoing.length
      ? `<div class="mc-muted" style="margin:8px 0 2px;">已送出邀請</div>${friends.outgoing.map((p) => personRow(p,
        `<span class="mc-muted">等待回應</span>`)).join('')}`
      : '';
    const friendList = friends.friends.length
      ? friends.friends.map((p) => personRow(p,
        `<button class="mc-btn ghost" data-pm="${p.id}" type="button">私訊</button>
         <button class="mc-btn ghost" data-greet="${p.id}" type="button">👋 打招呼</button>
         <button class="mc-btn ghost" data-visit-friend="${p.id}" type="button">參觀</button>
         <button class="mc-btn ghost" data-remove-friend="${p.id}" type="button">移除</button>`
      )).join('')
      : '<div class="mc-empty">還沒有好友，搜尋市民名稱加為好友吧。</div>';

    const guildSection = myGuild
      ? `<div class="mc-card">
           <div class="mc-row" style="justify-content:space-between;">
             <b style="font-size:13px;">${esc(myGuild.icon)} ${esc(myGuild.name)}</b>
             <span class="mc-muted">${myGuild.members} 位成員</span>
           </div>
           ${myGuild.description ? `<div class="mc-muted" style="margin-top:4px;">${esc(myGuild.description)}</div>` : ''}
           <div class="mc-progress"><span style="width:${Math.min(100, Math.round((myGuild.weeklyXp / myGuild.target) * 100))}%"></span></div>
           <div class="mc-row" style="justify-content:space-between;margin-top:6px;">
             <span class="mc-muted">本週 ${myGuild.weeklyXp} / ${myGuild.target} XP</span>
             <span class="mc-muted">活力 ${myGuild.vitality}</span>
           </div>
           <button class="mc-btn" id="mc-guild-open" type="button" style="margin-top:10px;">查看社團與共同目標</button>
         </div>`
      : `<div class="mc-card">
           <b style="font-size:13px;">🏛 成立社團</b>
           <div class="mc-muted" style="margin:4px 0 8px;">社團成員的探索與建設 XP 會累積成共同目標，達標全員可領獎勵。</div>
           <div class="mc-row" style="gap:6px;">
             <select class="mc-input" id="mc-guild-icon" style="flex:0 0 72px;">
               ${GUILD_ICONS.map((i) => `<option value="${i}">${i}</option>`).join('')}
             </select>
             <input class="mc-input" id="mc-guild-name" maxlength="24" placeholder="社團名稱（2–24 字）">
           </div>
           <input class="mc-input" id="mc-guild-desc" maxlength="200" placeholder="一句話介紹（選填）" style="margin-top:6px;">
           <button class="mc-btn" id="mc-guild-create" type="button" style="margin-top:8px;">建立社團</button>
         </div>
         <div class="mc-card" style="margin-top:10px;">
           <b style="font-size:13px;">社團列表</b>
           ${guilds.guilds.length
             ? guilds.guilds.map((g) => `<div class="mc-rank-row">
                 <div class="mc-rank-no">${esc(g.icon)}</div>
                 <div class="mc-rank-name">${esc(g.name)}
                   <div class="mc-rank-sub">${g.members} 位成員 · 活力 ${g.vitality} · 本週 ${g.weeklyXp} XP</div>
                 </div>
                 <button class="mc-btn ghost" data-join-guild="${g.id}" type="button">加入</button>
               </div>`).join('')
             : '<div class="mc-empty">還沒有社團，成為第一個吧。</div>'}
         </div>`;

    body.innerHTML = `
      <div class="mc-card">
        <div class="mc-row" style="justify-content:space-between;">
          <b style="font-size:13px;">👥 好友</b>
          <span class="mc-muted">${friends.friends.length} 位${friends.incoming.length ? ` · ${friends.incoming.length} 個邀請` : ''}</span>
        </div>
        ${incomingHtml ? `<div class="mc-muted" style="margin:8px 0 2px;">待處理邀請</div>${incomingHtml}` : ''}
        ${outgoingHtml}
        <div class="mc-row" style="gap:6px;margin-top:10px;">
          <input class="mc-input" id="mc-user-q" maxlength="20" placeholder="搜尋市民暱稱（至少 2 字）">
          <button class="mc-btn" id="mc-user-search" type="button">搜尋</button>
        </div>
        <div id="mc-user-results"></div>
        <div style="margin-top:8px;">${friendList}</div>
      </div>
      <div style="margin-top:10px;">${guildSection}</div>`;

    body.querySelectorAll('[data-accept]').forEach((b) => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await api('/api/friends/respond', { method: 'POST', body: JSON.stringify({ requestId: Number(b.dataset.accept), accept: true }) });
          toast('已成為好友');
          await renderCommunity();
        } catch {
          toast('操作失敗');
          b.disabled = false;
        }
      });
    });
    body.querySelectorAll('[data-decline]').forEach((b) => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await api('/api/friends/respond', { method: 'POST', body: JSON.stringify({ requestId: Number(b.dataset.decline), accept: false }) });
          await renderCommunity();
        } catch {
          toast('操作失敗');
          b.disabled = false;
        }
      });
    });
    body.querySelectorAll('[data-remove-friend]').forEach((b) => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await api('/api/friends/remove', { method: 'POST', body: JSON.stringify({ userId: Number(b.dataset.removeFriend) }) });
          toast('已移除好友');
          await renderCommunity();
        } catch {
          toast('操作失敗');
          b.disabled = false;
        }
      });
    });
    body.querySelectorAll('[data-visit-friend]').forEach((b) => {
      b.addEventListener('click', async () => {
        state.sandboxVisit = Number(b.dataset.visitFriend);
        state.tab = 'sandbox';
        syncTabs();
        await renderSandbox();
      });
    });
    body.querySelectorAll('[data-pm]').forEach((b) => {
      b.addEventListener('click', () => openMessageTo(b.dataset.pm));
    });
    body.querySelectorAll('[data-greet]').forEach((b) => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          const r = await api(`/api/greet/${b.dataset.greet}`, { method: 'POST', body: '{}' });
          if (r.tasks) state.me.tasks = r.tasks;
          toast(r.already ? '今天已經和這位鄰居打過招呼了' : `👋 已打招呼 +${r.reward.coins} 城市幣`);
          if (!r.already) {
            b.textContent = '👋 今日已打招呼';
            await loadMe(true);
          }
        } catch (err) {
          toast(err.message === 'daily_limit' ? '今日打招呼已達 5 次上限' : '打招呼失敗');
          b.disabled = false;
        }
      });
    });

    const searchBtn = $('#mc-user-search');
    const searchInput = $('#mc-user-q');
    const doSearch = async () => {
      const q = searchInput.value.trim();
      if (q.length < 2) { toast('請輸入至少 2 個字'); return; }
      const box = $('#mc-user-results');
      box.innerHTML = '<div class="mc-muted" style="margin-top:8px;">搜尋中…</div>';
      try {
        const d = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
        if (!d.users.length) {
          box.innerHTML = '<div class="mc-empty" style="padding:8px 0;">找不到符合的市民</div>';
          return;
        }
        box.innerHTML = `<div class="mc-muted" style="margin-top:8px;">搜尋結果</div>${d.users.map((u) => {
          const action = u.relation === 'friend' ? '<span class="mc-muted">已是好友</span>'
            : u.relation === 'sent' ? '<span class="mc-muted">已邀請</span>'
              : u.relation === 'incoming'
                ? `<button class="mc-vote" data-add-friend="${u.id}" type="button">接受</button>`
                : `<button class="mc-btn ghost" data-add-friend="${u.id}" type="button">邀請</button>`;
          return personRow(u, action);
        }).join('')}`;
        box.querySelectorAll('[data-add-friend]').forEach((b) => {
          b.addEventListener('click', async () => {
            b.disabled = true;
            try {
              const r = await api('/api/friends/request', { method: 'POST', body: JSON.stringify({ userId: Number(b.dataset.addFriend) }) });
              toast(r.autoAccepted ? '已成為好友' : '邀請已送出');
              await renderCommunity();
            } catch (err) {
              toast(err.message === 'already_friends' ? '已經是好友' : '邀請失敗');
              b.disabled = false;
            }
          });
        });
      } catch {
        box.innerHTML = '<div class="mc-empty">搜尋失敗</div>';
      }
    };
    searchBtn.addEventListener('click', doSearch);
    searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });

    const createBtn = $('#mc-guild-create');
    if (createBtn) {
      createBtn.addEventListener('click', async () => {
        const name = $('#mc-guild-name').value.trim();
        if (name.length < 2) { toast('名稱至少 2 個字'); return; }
        createBtn.disabled = true;
        try {
          const r = await api('/api/guilds', {
            method: 'POST',
            body: JSON.stringify({ name, icon: $('#mc-guild-icon').value, description: $('#mc-guild-desc').value.trim() }),
          });
          toast('社團已成立');
          state.guildView = r.id;
          await renderCommunity();
        } catch (err) {
          toast(err.message === 'name_taken' ? '這個名稱已被使用'
            : err.message === 'already_in_guild' ? '你已經加入社團'
              : err.message === 'level_too_low' ? '需要 Lv.2 才能成立社團' : '建立失敗');
          createBtn.disabled = false;
        }
      });
    }
    body.querySelectorAll('[data-join-guild]').forEach((b) => {
      b.addEventListener('click', async () => {
        b.disabled = true;
        try {
          await api(`/api/guilds/${b.dataset.joinGuild}/join`, { method: 'POST', body: '{}' });
          toast('已加入社團');
          await renderCommunity();
        } catch {
          toast('加入失敗');
          b.disabled = false;
        }
      });
    });
    const openBtn = $('#mc-guild-open');
    if (openBtn) {
      openBtn.addEventListener('click', () => {
        state.guildView = guilds.myGuildId;
        renderCommunity();
      });
    }
  }

  async function renderGuildDetail(id) {
    body.innerHTML = '<div class="mc-empty">載入中…</div>';
    let d;
    try {
      d = await api(`/api/guilds/${id}`);
    } catch {
      state.guildView = null;
      body.innerHTML = '<div class="mc-empty">找不到這個社團。</div>';
      return;
    }
    const pct = Math.min(100, Math.round((d.weeklyXp / d.target) * 100));
    const canClaim = d.weeklyXp >= d.target && !d.claimed;
    const claimArea = d.claimed
      ? '<span class="mc-muted">本週獎勵已領取</span>'
      : canClaim
        ? `<button class="mc-vote" id="mc-guild-claim" type="button">領取獎勵 +${d.rewardCoins} 幣</button>`
        : `<span class="mc-muted">還差 ${d.target - d.weeklyXp} XP 達標</span>`;

    body.innerHTML = `
      <button class="mc-btn ghost" id="mc-guild-back" type="button">← 返回社群</button>
      <div class="mc-card" style="margin-top:10px;">
        <div class="mc-row" style="justify-content:space-between;">
          <b style="font-size:14px;">${esc(d.guild.icon)} ${esc(d.guild.name)}</b>
          <span class="mc-muted">${d.members.length} 位成員</span>
        </div>
        ${d.guild.description ? `<div class="mc-muted" style="margin-top:4px;">${esc(d.guild.description)}</div>` : ''}
        <div class="mc-progress"><span style="width:${pct}%"></span></div>
        <div class="mc-row" style="justify-content:space-between;margin-top:6px;">
          <span class="mc-muted">本週共同目標 ${d.weeklyXp} / ${d.target} XP</span>
          <span class="mc-muted">全員 +${d.rewardCoins} 幣</span>
        </div>
        <div class="mc-row" style="justify-content:space-between;margin-top:10px;">
          ${claimArea}
          <button class="mc-btn ghost" id="mc-guild-leave" type="button">離開社團</button>
        </div>
      </div>
      <div class="mc-card" style="margin-top:10px;">
        <b style="font-size:13px;">成員（本週貢獻）</b>
        ${d.members.map((m) => personRow(m,
          `<span class="mc-muted" style="font-size:11.5px;">${m.weeklyXp} XP</span>`
        )).join('')}
      </div>`;

    $('#mc-guild-back').addEventListener('click', () => {
      state.guildView = null;
      renderCommunity();
    });
    $('#mc-guild-leave').addEventListener('click', async () => {
      try {
        await api('/api/guilds/leave', { method: 'POST', body: '{}' });
        state.guildView = null;
        toast('已離開社團');
        await renderCommunity();
      } catch {
        toast('操作失敗');
      }
    });
    const claimBtn = $('#mc-guild-claim');
    if (claimBtn) {
      claimBtn.addEventListener('click', async () => {
        claimBtn.disabled = true;
        try {
          const r = await api(`/api/guilds/${id}/claim`, { method: 'POST', body: '{}' });
          toast(`🎉 達標！全員獲得 ${r.coins} 城市幣`);
          await loadMe(true);
          await renderCommunity();
        } catch (err) {
          toast(err.message === 'already_claimed' ? '本週已領取' : '尚未達標');
          claimBtn.disabled = false;
        }
      });
    }
  }

  // ---------- 私訊 ----------
  function fmtTime(v) {
    if (!v) return '';
    try {
      return new Date(v).toLocaleString('zh-MO', {
        timeZone: 'Asia/Macau', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return ''; }
  }

  async function renderMessages() {
    if (!state.me || !state.me.authenticated) {
      body.innerHTML = loginCard('登入後可與其他市民私訊交流');
      return;
    }
    if (!state.me.user.onboarded) {
      body.innerHTML = '<div class="mc-empty">請先到「市民檔案」建立暱稱與居住分區。</div>';
      return;
    }
    if (state.msgUser) { await renderMessageThread(state.msgUser); return; }

    if (!state.messages) {
      try { state.messages = await api('/api/messages'); } catch { state.messages = { conversations: [], unreadTotal: 0 }; }
    }
    const list = state.messages.conversations || [];
    body.innerHTML = `
      <div class="mc-card">
        <div class="mc-row" style="justify-content:space-between;">
          <b style="font-size:13px;">💬 私訊</b>
          <span class="mc-muted">${state.messages.unreadTotal ? `${state.messages.unreadTotal} 則未讀` : '沒有未讀'}</span>
        </div>
        <div class="mc-muted" style="margin-top:4px;">可從好友名單或市民沙盤頁發起對話。</div>
      </div>
      ${list.length ? list.map((c) => `
        <div class="mc-card mc-msg-row" data-conv="${c.userId}" role="button" tabindex="0">
          <div class="mc-row" style="justify-content:space-between;">
            <div class="mc-row" style="gap:8px;min-width:0;">
              <span style="font-size:20px;">${esc(c.avatarEmoji)}</span>
              <div style="min-width:0;">
                <div style="font-size:13px;font-weight:800;">${esc(c.nickname)} <span class="mc-muted">Lv.${c.level}</span></div>
                <div class="mc-muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${c.mine ? '你：' : ''}${esc(c.lastMessage)}</div>
              </div>
            </div>
            <div style="text-align:right;">
              ${c.unread ? `<span class="mc-badge">${c.unread}</span>` : ''}
              <div class="mc-muted" style="font-size:11px;">${fmtTime(c.updatedAt)}</div>
            </div>
          </div>
        </div>`).join('')
        : '<div class="mc-empty">還沒有對話。到「好友社團」或市民沙盤頁按「私訊」開始聊天。</div>'}
    `;
    body.querySelectorAll('[data-conv]').forEach((el) => {
      el.addEventListener('click', () => {
        state.msgUser = Number(el.dataset.conv);
        state.msgThread = null;
        renderMessages();
      });
    });
  }

  async function renderMessageThread(userId) {
    try {
      state.msgThread = await api(`/api/messages/${userId}`);
    } catch {
      state.msgUser = null;
      state.msgThread = null;
      toast('無法載入對話');
      return renderMessages();
    }
    const t = state.msgThread;
    body.innerHTML = `
      <div class="mc-card">
        <div class="mc-row" style="justify-content:space-between;">
          <button class="mc-btn ghost" id="mc-msg-back" type="button">← 返回</button>
          <div class="mc-row" style="gap:6px;">
            <span style="font-size:18px;">${esc(t.user.avatarEmoji)}</span>
            <b style="font-size:13px;">${esc(t.user.nickname)}</b>
            <span class="mc-muted">Lv.${t.user.level}${t.isFriend ? ' · 好友' : ''}</span>
          </div>
        </div>
      </div>
      <div class="mc-msg-thread">
        ${t.messages.length ? t.messages.map((m) => `
          <div class="mc-msg ${m.mine ? 'mc-msg-mine' : ''}">
            <div class="mc-msg-body">${esc(m.body)}</div>
            <div class="mc-msg-time">${fmtTime(m.createdAt)}</div>
          </div>`).join('')
          : '<div class="mc-empty">還沒有訊息，說句話打個招呼吧。</div>'}
      </div>
      <div class="mc-card">
        <div class="mc-row" style="gap:8px;align-items:flex-end;">
          <textarea class="mc-input" id="mc-msg-input" rows="2" maxlength="500" placeholder="輸入訊息…" style="flex:1;"></textarea>
          <button class="mc-btn" id="mc-msg-send" type="button">送出</button>
        </div>
        <div class="mc-muted" style="margin-top:6px;font-size:11px;">最多 500 字，請保持友善。</div>
      </div>
    `;
    $('#mc-msg-back').addEventListener('click', () => {
      state.msgUser = null;
      state.msgThread = null;
      state.messages = null;
      renderMessages();
    });
    const input = $('#mc-msg-input');
    const send = async () => {
      const value = input.value.trim();
      if (!value) return;
      const btn = $('#mc-msg-send');
      btn.disabled = true;
      try {
        await api(`/api/messages/${userId}`, {
          method: 'POST', body: JSON.stringify({ body: value }),
        });
        input.value = '';
        state.messages = null;
        await renderMessageThread(userId);
      } catch {
        toast('訊息送出失敗');
        btn.disabled = false;
      }
    };
    $('#mc-msg-send').addEventListener('click', send);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
  }

  function openMessageTo(userId) {
    state.msgUser = Number(userId);
    state.msgThread = null;
    state.tab = 'messages';
    syncTabs();
    render();
  }

  // ---------- 城市活動 ----------
  async function renderActivities() {
    if (state.activityView) { await renderActivityDetail(state.activityView); return; }
    try {
      const q = state.activityCategory ? `?category=${encodeURIComponent(state.activityCategory)}` : '';
      state.activities = await api(`/api/activities${q}`);
    } catch {
      body.innerHTML = '<div class="mc-empty">活動資料載入失敗，請稍後再試。</div>';
      return;
    }
    const list = state.activities.activities || [];
    const cats = state.activities.categories || [];
    body.innerHTML = `
      <div class="mc-card">
        <div class="mc-row" style="justify-content:space-between;">
          <b style="font-size:13px;">🎪 城市活動</b>
          <span class="mc-muted">${list.length} 個進行中</span>
        </div>
        <div class="mc-muted" style="margin-top:4px;">報名、現場簽到即可獲得城市幣與 XP。</div>
        <div class="mc-row wrap" style="gap:6px;margin-top:10px;">
          <button class="mc-tab ${!state.activityCategory ? 'mc-active' : ''}" data-cat="" type="button">全部</button>
          ${cats.map((c) => `<button class="mc-tab ${state.activityCategory === c.key ? 'mc-active' : ''}" data-cat="${c.key}" type="button">${c.icon} ${c.name}</button>`).join('')}
        </div>
      </div>
      ${list.length ? list.map((a) => `
        <div class="mc-card mc-activity" data-activity="${a.id}" role="button" tabindex="0">
          <div class="mc-row" style="justify-content:space-between;">
            <div style="font-size:13px;font-weight:800;min-width:0;">${esc(a.categoryIcon)} ${esc(a.title)}</div>
            ${a.myCheckedIn ? '<span class="mc-badge ok">已簽到</span>'
              : a.myStatus === 'going' ? '<span class="mc-badge ok">已報名</span>' : ''}
          </div>
          <div class="mc-muted" style="margin-top:4px;">
            ${fmtTime(a.startAt)} · ${esc(a.districtIcon || '📍')} ${esc(a.location || a.districtName || '全澳')}
          </div>
          <div class="mc-row" style="justify-content:space-between;margin-top:8px;">
            <span class="mc-muted">${a.goingCount}${a.capacity ? `/${a.capacity}` : ''} 人報名</span>
            <span class="mc-muted">💰 ${a.rewardCoins} · ⭐ ${a.rewardXp}</span>
          </div>
        </div>`).join('')
        : '<div class="mc-empty">目前沒有符合條件的活動，活動由管理員建立後會出現在這裡。</div>'}
    `;
    body.querySelectorAll('[data-cat]').forEach((b) => {
      b.addEventListener('click', () => {
        state.activityCategory = b.dataset.cat;
        renderActivities();
      });
    });
    body.querySelectorAll('[data-activity]').forEach((el) => {
      el.addEventListener('click', () => {
        state.activityView = Number(el.dataset.activity);
        renderActivities();
      });
    });
  }

  async function renderActivityDetail(id) {
    let d;
    try { d = await api(`/api/activities/${id}`); } catch {
      state.activityView = null;
      toast('活動載入失敗');
      return renderActivities();
    }
    const a = d.activity;
    const authed = state.me && state.me.authenticated && state.me.user.onboarded;
    const canCheckin = a.myStatus === 'going' && !a.myCheckedIn;
    body.innerHTML = `
      <div class="mc-card">
        <div class="mc-row" style="justify-content:space-between;">
          <button class="mc-btn ghost" id="mc-act-back" type="button">← 返回</button>
          <span class="mc-muted">${esc(a.categoryIcon)} ${esc(a.categoryName)}</span>
        </div>
        <div style="font-size:15px;font-weight:900;margin-top:8px;">${esc(a.title)}</div>
        <div class="mc-muted" style="margin-top:6px;">
          🕒 ${fmtTime(a.startAt)} — ${fmtTime(a.endAt)}<br>
          📍 ${esc(a.districtIcon || '')} ${esc(a.location || a.districtName || '全澳')}
        </div>
        <div class="mc-muted" style="margin-top:10px;line-height:1.7;">${esc(a.description)}</div>
      </div>
      <div class="mc-card">
        <div class="mc-row" style="justify-content:space-between;">
          <span class="mc-muted">報名 ${a.goingCount}${a.capacity ? ` / ${a.capacity}` : ''}${a.capacity ? '（額滿截止）' : '（不限額）'}</span>
          <span class="mc-muted">💰 ${a.rewardCoins} · ⭐ ${a.rewardXp}</span>
        </div>
        <div class="mc-row wrap" style="gap:8px;margin-top:12px;">
          ${!authed ? '<span class="mc-muted">登入並建立市民檔案後即可報名</span>'
            : a.myCheckedIn ? '<span class="mc-badge ok">已簽到，獎勵已發放</span>'
              : a.myStatus === 'going'
                ? `<button class="mc-btn ghost" id="mc-act-cancel" type="button">取消報名</button>
                   <button class="mc-btn" id="mc-act-checkin" type="button" ${canCheckin ? '' : 'disabled'}>📍 現場簽到</button>`
                : '<button class="mc-btn" id="mc-act-signup" type="button">我要報名</button>'}
        </div>
        ${a.myStatus === 'going' && !a.myCheckedIn ? '<div class="mc-muted" style="margin-top:8px;font-size:11.5px;">簽到於活動開始前 30 分鐘開放，至活動結束為止。</div>' : ''}
      </div>
    `;
    $('#mc-act-back').addEventListener('click', () => {
      state.activityView = null;
      state.activities = null;
      renderActivities();
    });
    const signup = $('#mc-act-signup');
    if (signup) {
      signup.addEventListener('click', async () => {
        signup.disabled = true;
        try {
          await api(`/api/activities/${id}/signup`, { method: 'POST', body: '{}' });
          toast('報名成功，記得活動當天現場簽到');
          await renderActivityDetail(id);
        } catch (err) {
          toast(err.status === 409 ? '名額已滿' : '報名失敗');
          signup.disabled = false;
        }
      });
    }
    const cancel = $('#mc-act-cancel');
    if (cancel) {
      cancel.addEventListener('click', async () => {
        cancel.disabled = true;
        try {
          await api(`/api/activities/${id}/cancel`, { method: 'POST', body: '{}' });
          toast('已取消報名');
          await renderActivityDetail(id);
        } catch {
          toast('取消失敗');
          cancel.disabled = false;
        }
      });
    }
    const checkin = $('#mc-act-checkin');
    if (checkin) {
      checkin.addEventListener('click', async () => {
        checkin.disabled = true;
        try {
          const r = await api(`/api/activities/${id}/checkin`, { method: 'POST', body: '{}' });
          if (r.tasks) state.me.tasks = r.tasks;
          toast(r.already ? '已完成簽到' : `簽到成功 +${r.rewardCoins} 城市幣、+${r.rewardXp} XP`);
          await loadMe(true);
          await renderActivityDetail(id);
        } catch (err) {
          toast(err.message === 'too_early' ? '尚未開放簽到' : err.message === 'ended' ? '活動已結束' : '簽到失敗');
          checkin.disabled = false;
        }
      });
    }
  }

  async function renderRanking() {
    body.innerHTML = `
      <div class="mc-row" style="gap:6px;margin-bottom:10px;">
        <button class="mc-tab ${state.board === 'weekly' ? 'mc-active' : ''}" data-board="weekly" type="button">本週 XP</button>
        <button class="mc-tab ${state.board === 'discoveries' ? 'mc-active' : ''}" data-board="discoveries" type="button">探索王</button>
        <button class="mc-tab ${state.board === 'coins' ? 'mc-active' : ''}" data-board="coins" type="button">城市幣</button>
        <button class="mc-tab ${state.board === 'reputation' ? 'mc-active' : ''}" data-board="reputation" type="button">聲望</button>
      </div>
      <div id="mc-rank-list"><div class="mc-empty">載入中…</div></div>`;
    try {
      const d = await api(`/api/leaderboard?board=${state.board}`);
      if (!d.rows.length) {
        $('#mc-rank-list').innerHTML = '<div class="mc-empty">尚未有市民上榜</div>';
      } else {
        const myId = state.me && state.me.authenticated ? state.me.user.id : null;
        $('#mc-rank-list').innerHTML = d.rows.map((r) => `
          <div class="mc-rank-row ${r.id === myId ? 'mc-me' : ''}">
            <div class="mc-rank-no">${r.rank}</div>
            <div class="mc-rank-name">${esc(r.nickname)}
              <div class="mc-rank-sub">${esc(r.district || '未選分區')} · Lv.${r.level}</div>
            </div>
            <div class="mc-rank-score">${r.score}</div>
          </div>`).join('');
      }
    } catch {
      $('#mc-rank-list').innerHTML = '<div class="mc-empty">讀取排行榜失敗</div>';
    }
  }

  async function render() {
    if (!state.open) return;
    paintHead();
    if (state.tab === 'profile') {
      await renderProfileAsync();
    } else if (state.tab === 'atlas') {
      await renderAtlas();
    } else if (state.tab === 'sandbox') {
      await renderSandbox();
    } else if (state.tab === 'community') {
      await renderCommunity();
    } else if (state.tab === 'tasks') {
      renderTasks();
    } else if (state.tab === 'proposals') {
      await renderProposals();
    } else if (state.tab === 'messages') {
      await renderMessages();
    } else if (state.tab === 'activities') {
      await renderActivities();
    } else if (state.tab === 'ranking') {
      await renderRanking();
    }
  }

  async function renderProfileAsync() {
    if (state.me && state.me.authenticated && !state.city) {
      try { state.city = await api('/api/city'); } catch { /* 非必要 */ }
    }
    if (state.me && state.me.authenticated) {
      try { await ensureDistricts(); } catch { /* 稍後重試 */ }
    }
    renderProfile();
  }

  // ---------- 資料載入 ----------
  async function loadMe(force) {
    try {
      const d = await api('/api/me');
      state.me = d.authenticated ? d : { authenticated: false };
    } catch {
      state.me = { authenticated: false };
    }
    paintHead();
    return state.me;
  }

  async function loadAll() {
    await loadMe(true);
    try { state.city = await api('/api/city'); } catch { /* 非必要 */ }
    if (state.me && state.me.authenticated) {
      try { await ensureDistricts(); } catch { /* 非必要 */ }
      if (state.me.user.onboarded) {
        try {
          state.sandbox = await api('/api/sandbox/me');
          if (state.sandbox.district) pushSandbox3D(state.sandbox.district.id, state.sandbox.slots);
        } catch { /* 沙盤非必要 */ }
      }
    }
    refreshWorld();
    if (state.tab === 'atlas' || state.tab === 'proposals') state.landmarks = null;
  }

  // ---------- 節慶事件 ----------
  async function loadFestival() {
    try {
      const d = await api('/api/festival');
      state.festival = d.festival || null;
    } catch {
      state.festival = null;
    }
    if (!state.festival) return;
    const f = state.festival;
    toast(`${f.emoji} ${f.name}：${f.message}`);
    if (state.festivalFired) return;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const bridge = window.macaoBridge;
      if (bridge && typeof bridge.fireworks === 'function') {
        bridge.fireworks();
        state.festivalFired = true;
        setTimeout(() => {
          if (window.macaoBridge && typeof window.macaoBridge.fireworks === 'function') {
            window.macaoBridge.fireworks();
          }
        }, 2200);
        clearInterval(timer);
      } else if (tries > 40) {
        clearInterval(timer);
      }
    }, 400);
  }

  // ---------- 3D 事件整合 ----------
  const pendingDiscover = new Set();
  function onLandmark(ev) {
    const detail = ev.detail || {};
    if (!detail.id) return;
    if (!state.me || !state.me.authenticated) {
      flashDot();
      return;
    }
    if (pendingDiscover.has(detail.id)) return;
    pendingDiscover.add(detail.id);
    api('/api/discover', { method: 'POST', body: JSON.stringify({ landmarkId: detail.id }) })
      .then((r) => {
        if (r.tasks) state.me.tasks = r.tasks;
        if (r.isNew) {
          toast(`📖 收錄「${(detail.name || '地標').slice(0, 16)}」 ${r.reward.coins ? `+${r.reward.coins} 城市幣` : ''}（${r.reward.total || ''}/82）`);
          loadMe(true);
        }
      })
      .catch(() => { /* 未登入或網路失敗時靜默 */ })
      .finally(() => setTimeout(() => pendingDiscover.delete(detail.id), 1500));
  }

  const islandSent = new Set();
  function onIsland(ev) {
    const id = ev.detail && ev.detail.id;
    if (!id || !state.me || !state.me.authenticated) return;
    if (islandSent.has(id)) return;
    islandSent.add(id);
    api('/api/events', { method: 'POST', body: JSON.stringify({ type: 'island', refId: id }) })
      .then((r) => { if (r.tasks) state.me.tasks = r.tasks; })
      .catch(() => {});
  }

  function onAction(type) {
    if (!state.me || !state.me.authenticated) return;
    api('/api/events', { method: 'POST', body: JSON.stringify({ type }) })
      .then((r) => { if (r.tasks) state.me.tasks = r.tasks; })
      .catch(() => {});
  }

  function flashDot() {
    const dot = fab.querySelector('.mc-fab-dot');
    if (dot) dot.hidden = false;
    setTimeout(() => { if (dot) dot.hidden = true; }, 4000);
  }

  window.addEventListener('macao:landmark', onLandmark);
  window.addEventListener('macao:island', onIsland);
  // 點擊 3D 場景中的市民小人 → 打開他的沙盤
  window.addEventListener('macao:citizen', (ev) => {
    const d = ev.detail || {};
    if (!d.userId) return;
    state.sandboxVisit = Number(d.userId);
    state.sandboxSlot = null;
    if (!state.me || !state.me.authenticated) {
      // 未登入時仍打開面板顯示登入卡，避免「點了沒反應」
      flashDot();
      openPanel('sandbox');
      return;
    }
    openPanel('sandbox');
  });
  // 在 3D 場景點擊自己的建設，直接打開沙盤對應格子
  window.addEventListener('macao:sandbox-slot', (ev) => {
    const d = ev.detail || {};
    if (d.slot === undefined) return;
    if (!state.me || !state.me.authenticated) { flashDot(); return; }
    state.sandboxVisit = null;
    state.sandboxSlot = d.slot;
    openPanel('sandbox');
  });

  const HOOKS = [
    ['#btn-fireworks', 'fireworks'],
    ['#btn-lightshow', 'lightshow'],
    ['#btn-lrt-follow', 'lrt'],
  ];
  function bindHook(selector, type) {
    const el = document.querySelector(selector);
    if (el) el.addEventListener('click', () => onAction(type));
  }
  // 潮位滑桿：放開時記錄一次
  const tide = document.querySelector('#slider-tide');
  if (tide) tide.addEventListener('change', () => onAction('tide'));

  // 3D 場景可能延遲建立，稍後再綁定一次
  setTimeout(() => HOOKS.forEach(([sel, type]) => bindHook(sel, type)), 2500);
  HOOKS.forEach(([sel, type]) => bindHook(sel, type));

  // ---------- 啟動 ----------
  (async function boot() {
    const params = new URLSearchParams(location.search);
    if (params.get('login') === 'failed') {
      toast('登入未完成，請再試一次');
      history.replaceState(null, '', location.pathname);
      flashDot();
    }
    await loadAll();
    loadFestival();
    if (params.get('login') === 'failed') openPanel('profile');
  })();
})();
