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
        <button class="mc-tab" data-tab="tasks" type="button">每日任務</button>
        <button class="mc-tab" data-tab="proposals" type="button">提案牆</button>
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
      : '🏙';
    const lv = u.levelInfo || { level: 1, title: '城市觀察員', progress: 0 };
    $('#mc-head-name').textContent = `${u.nickname} · Lv.${lv.level} ${lv.title}`;
    $('#mc-head-sub').textContent =
      `💰 ${u.coins} 城市幣 · ⭐ ${u.xp} XP · 🔥 連續 ${me.streak} 天`
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
    body.innerHTML = `
      <div class="mc-stats">
        <div class="mc-stat"><b>${counts.discoveries}<span style="font-size:11px;opacity:.6">/82</span></b><span>地標收集</span></div>
        <div class="mc-stat"><b>${counts.proposals}</b><span>城市提案</span></div>
        <div class="mc-stat"><b>${counts.votes}</b><span>參與投票</span></div>
        <div class="mc-stat"><b>${me.streak}</b><span>連續登入</span></div>
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
        <button class="mc-btn ghost" id="mc-sand-refresh" type="button">更新沙盤</button>
      </div>`;

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
            <div class="mc-muted">${esc(d.owner.districtIcon || '')} ${esc(d.owner.districtName || '')}</div>
          </div>
        </div>
      </div>
      ${slotGrid(d.slots, false)}
      <div class="mc-row" style="margin-top:12px;justify-content:space-between;">
        <span class="mc-muted">沙盤活力 ${d.vitality} · ${d.built} 項建設</span>
        ${d.isOwner ? '<span class="mc-muted">這是你的沙盤</span>'
          : `<button class="mc-vote ${d.liked ? 'mc-voted' : ''}" id="mc-visit-like" type="button">👍 ${d.likes}</button>`}
      </div>`;

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

  async function renderRanking() {
    body.innerHTML = `
      <div class="mc-row" style="gap:6px;margin-bottom:10px;">
        <button class="mc-tab ${state.board === 'weekly' ? 'mc-active' : ''}" data-board="weekly" type="button">本週 XP</button>
        <button class="mc-tab ${state.board === 'discoveries' ? 'mc-active' : ''}" data-board="discoveries" type="button">探索王</button>
        <button class="mc-tab ${state.board === 'coins' ? 'mc-active' : ''}" data-board="coins" type="button">城市幣</button>
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
    } else if (state.tab === 'tasks') {
      renderTasks();
    } else if (state.tab === 'proposals') {
      await renderProposals();
    } else if (state.tab === 'ranking') {
      await renderRanking();
    }
  }

  async function renderProfileAsync() {
    if (state.me && state.me.authenticated && !state.city) {
      try { state.city = await api('/api/city'); } catch { /* 非必要 */ }
    }
    if (state.me && state.me.authenticated && !state.me.user.onboarded) {
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
    }
    if (state.tab === 'atlas' || state.tab === 'proposals') state.landmarks = null;
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
    const dot = root.querySelector('.mc-fab-dot');
    if (dot) dot.hidden = false;
    setTimeout(() => { if (dot) dot.hidden = true; }, 4000);
  }

  window.addEventListener('macao:landmark', onLandmark);
  window.addEventListener('macao:island', onIsland);

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
    if (params.get('login') === 'failed') openPanel('profile');
  })();
})();
