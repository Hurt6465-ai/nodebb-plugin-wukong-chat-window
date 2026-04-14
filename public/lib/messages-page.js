(function () {
  'use strict';

  const state = {
    bootstrap: null,
    token: null,
    nodebbRooms: [],
    wkRooms: [],
    profiles: {},
    metaKey: '',
    meta: { pinned: {}, hidden: {}, remarks: {} },
    longPressTimer: null,
    longPressKey: '',
  };

  function byId(id) { return document.getElementById(id); }
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  function isNumeric(v) { return /^\d+$/.test(String(v || '')); }
  function wkUidFromKey(v) { return isNumeric(v) ? ('nbb_' + String(v)) : String(v || ''); }
  function nodeUidFromWkUid(v) {
    v = String(v || '');
    return /^nbb_\d+$/.test(v) ? v.slice(4) : v;
  }
  function fmtTime(ts) {
    if (!ts) return '';
    const n = String(ts).length < 13 ? Number(ts) * 1000 : Number(ts);
    const d = new Date(n);
    if (Number.isNaN(d.getTime())) return '';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.floor((today - tDay) / 86400000);
    if (diff === 0) return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (diff === 1) return '昨天';
    if (diff < 7) return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()];
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }
  function teaserText(room) {
    const t = room && room.teaser;
    if (!t) return '';
    const txt = String(t.content || '').replace(/<[^>]+>/g, '');
    return txt.length > 50 ? txt.substring(0, 50) + '…' : txt;
  }
  function wkMsgText(conv) {
    const msg = conv.last_message || (conv.recents && conv.recents[conv.recents.length - 1]);
    if (!msg) return { t: '', uid: '' };
    let payload;
    try {
      if (typeof msg.payload === 'object' && msg.payload !== null) payload = msg.payload;
      else if (typeof msg.payload === 'string' && msg.payload.length) {
        const s = msg.payload.trim();
        if (s[0] === '{' || s[0] === '[') payload = JSON.parse(s);
      }
    } catch (e) {}
    payload = payload || { content: String(msg.payload || '') };
    let txt = String((payload.text || payload.content || '')).replace(/<[^>]+>/g, '');
    if (/^\[图片\]|^!\[\]/.test(txt)) txt = '[图片]';
    else if (/^\[视频\]/.test(txt)) txt = '[视频]';
    else if (/^\[语音/.test(txt)) txt = '[语音]';
    else if (/^\[文件/.test(txt)) txt = '[文件]';
    if (txt.length > 50) txt = txt.substring(0, 50) + '…';
    return { t: txt || '[消息]', uid: String(msg.from_uid || msg.fromUid || msg.uid || '') };
  }
  function getMetaStorageKey() {
    const uid = (state.bootstrap && state.bootstrap.user && state.bootstrap.user.uid) || 'guest';
    return 'wk_messages_meta_' + uid;
  }
  function loadMeta() {
    state.metaKey = getMetaStorageKey();
    try {
      state.meta = JSON.parse(localStorage.getItem(state.metaKey) || '{"pinned":{},"hidden":{},"remarks":{}}');
    } catch (e) {
      state.meta = { pinned: {}, hidden: {}, remarks: {} };
    }
  }
  function saveMeta() {
    localStorage.setItem(state.metaKey, JSON.stringify(state.meta));
  }
  function getMetaKey(item) {
    return String(item.nodeUid || item.wkUid || item.roomId || '');
  }
  function getRemark(item) {
    const k = getMetaKey(item);
    return (state.meta.remarks && state.meta.remarks[k]) || '';
  }
  function isPinned(item) {
    const k = getMetaKey(item);
    return !!(state.meta.pinned && state.meta.pinned[k]);
  }
  function isHidden(item) {
    const k = getMetaKey(item);
    return !!(state.meta.hidden && state.meta.hidden[k]);
  }
  function setPinned(item, val) {
    const k = getMetaKey(item);
    if (!state.meta.pinned) state.meta.pinned = {};
    if (val) state.meta.pinned[k] = 1; else delete state.meta.pinned[k];
    saveMeta();
  }
  function setHidden(item, val) {
    const k = getMetaKey(item);
    if (!state.meta.hidden) state.meta.hidden = {};
    if (val) state.meta.hidden[k] = 1; else delete state.meta.hidden[k];
    saveMeta();
  }
  function setRemark(item, text) {
    const k = getMetaKey(item);
    if (!state.meta.remarks) state.meta.remarks = {};
    text = String(text || '').trim().replace(/\s+/g, ' ');
    if (text.length > 30) text = text.slice(0, 30);
    if (text) state.meta.remarks[k] = text; else delete state.meta.remarks[k];
    saveMeta();
  }
  async function getJSON(url, options) {
    const res = await fetch(url, Object.assign({ credentials: 'same-origin' }, options || {}));
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return await res.json();
  }
  async function postJSON(url, body) {
    const res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return await res.json();
  }
  function userApiUrl(idOrSlug) {
    return isNumeric(idOrSlug) ? ('/api/user/uid/' + encodeURIComponent(idOrSlug)) : ('/api/user/' + encodeURIComponent(idOrSlug));
  }
  async function loadProfile(key) {
    key = String(key || '');
    if (!key || state.profiles[key]) return state.profiles[key] || null;
    try {
      const raw = await getJSON(userApiUrl(nodeUidFromWkUid(key)));
      const u = raw.user || raw.response || raw;
      const profile = {
        uid: String(u.uid || nodeUidFromWkUid(key) || ''),
        username: u.displayname || u.username || ('用户' + nodeUidFromWkUid(key)),
        picture: u.picture || '',
        status: String(u.status || '').toLowerCase() || 'offline',
        flag: u.language_flag || u.location || '',
      };
      state.profiles[key] = profile;
      if (profile.uid) state.profiles[profile.uid] = profile;
      if (profile.uid) state.profiles['nbb_' + profile.uid] = profile;
      return profile;
    } catch (e) {
      return null;
    }
  }
  async function loadBootstrap() {
    state.bootstrap = await getJSON((window.__WK_MESSAGES_BOOTSTRAP__ || {}).bootstrapPath || '/api/chat-app/bootstrap');
    state.token = await getJSON(state.bootstrap.chat.tokenPath);
    loadMeta();
  }
  async function fetchNodeBBChats() {
    try {
      const json = await getJSON('/api/v3/chats?perPage=120');
      state.nodebbRooms = (((json || {}).response || {}).rooms) || [];
    } catch (e) {
      state.nodebbRooms = [];
    }
  }
  async function fetchWkConversations() {
    try {
      const data = await postJSON(state.bootstrap.chat.conversationSyncPath, { version: 0, msg_count: 1 });
      let list = Array.isArray(data) ? data : (data.data || data.conversations || []);
      if (!Array.isArray(list)) list = [];
      state.wkRooms = list.filter(function (c) { return c && c.channel_type === 1; });
    } catch (e) {
      state.wkRooms = [];
    }
  }
  function mergeConversations() {
    const map = new Map();
    const selfUid = String(state.bootstrap.user.uid || '');
    state.nodebbRooms.forEach(function (room) {
      let other = null;
      (room.users || []).forEach(function (u) {
        if (String(u.uid) !== selfUid && !other) other = u;
      });
      const nodeUid = other ? String(other.uid) : '';
      const wkUid = nodeUid ? ('nbb_' + nodeUid) : '';
      const item = {
        nodeUid,
        wkUid,
        roomId: String(room.roomId || ''),
        name: (other && (other.displayname || other.username)) || room.usernames || '聊天',
        avatar: (other && other.picture) || '',
        preview: teaserText(room),
        time: room.teaser ? (room.teaser.timestamp || (room.teaser.timestampISO ? new Date(room.teaser.timestampISO).getTime() : 0)) : 0,
        unread: room.unread || 0,
        source: 'nodebb',
      };
      if (wkUid || nodeUid) map.set(wkUid || nodeUid, item);
    });

    state.wkRooms.forEach(function (conv) {
      const wkUid = String(conv.channel_id || conv.uid || '');
      const nodeUid = nodeUidFromWkUid(wkUid);
      const key = wkUid || nodeUid;
      const existing = map.get(key) || {
        nodeUid,
        wkUid,
        roomId: String(conv.room_id || ''),
        name: '聊天',
        avatar: '',
        preview: '',
        time: 0,
        unread: 0,
        source: 'wukong',
      };
      const m = wkMsgText(conv);
      existing.wkUid = wkUid || existing.wkUid;
      existing.nodeUid = existing.nodeUid || nodeUid;
      existing.roomId = existing.roomId || String(conv.room_id || '');
      existing.preview = m.uid === state.token.uid ? ('我: ' + m.t) : m.t;
      existing.time = Number(conv.timestamp || existing.time || 0);
      existing.unread = Number(conv.unread || existing.unread || 0);
      existing.source = 'wukong';
      map.set(key, existing);
    });

    const arr = Array.from(map.values());
    arr.forEach(function (item) {
      const profile = state.profiles[item.wkUid] || state.profiles[item.nodeUid] || null;
      if (profile) {
        item.name = getRemark(item) || item.name || profile.username || ('用户' + (item.nodeUid || item.wkUid));
        item.avatar = item.avatar || profile.picture || '';
        item.flag = profile.flag || '';
        item.status = profile.status || 'offline';
      } else {
        item.name = getRemark(item) || item.name;
      }
    });
    return arr.filter(function (item) { return !isHidden(item); }).sort(function (a, b) {
      const ap = isPinned(a) ? 1 : 0;
      const bp = isPinned(b) ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return Number(b.time || 0) - Number(a.time || 0);
    });
  }
  async function ensureProfiles(items) {
    const tasks = [];
    items.forEach(function (item) {
      if (item.nodeUid && !state.profiles[item.nodeUid]) tasks.push(loadProfile(item.nodeUid));
      else if (item.wkUid && !state.profiles[item.wkUid]) tasks.push(loadProfile(item.wkUid));
    });
    await Promise.all(tasks.slice(0, 20));
  }
  function injectCss() {
    if (byId('wkMessagesCss')) return;
    const s = document.createElement('style');
    s.id = 'wkMessagesCss';
    s.textContent = [
      ':root{--wk-item-h:84px;--bg:#fff;--bg2:#f3f4f6;--bg3:#e5e7eb;--c1:#111827;--c2:#6b7280;--c3:#9ca3af;--bd:#f3f4f6;--red:#ef4444;--green:#10b981;--yellow:#f59e0b;--gray:#d1d5db;}',
      'body{background:#f8fafc;}',
      '#wkMessagesPage{min-height:100vh;background:#fff;max-width:720px;margin:0 auto;box-shadow:0 0 0 1px rgba(0,0,0,.02);}',
      '.wk-top{position:sticky;top:0;background:rgba(255,255,255,.92);backdrop-filter:blur(10px);z-index:10;padding:14px 16px 10px;border-bottom:1px solid #eef2f7;}',
      '.wk-top h1{margin:0;font-size:22px;font-weight:800;color:#111827;}',
      '.wk-top p{margin:4px 0 0;color:#6b7280;font-size:13px;}',
      '.wk-list{position:relative;}',
      '.wk-row{position:relative;display:flex;align-items:center;gap:14px;padding:0 14px;height:84px;width:100%;border:0;background:#fff;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;}',
      '.wk-row::after{content:"";position:absolute;left:84px;right:0;bottom:0;height:1px;background:#f1f5f9;}',
      '.wk-row:active{background:#f8fafc;}',
      '.wk-aw{position:relative;width:54px;height:54px;flex:0 0 54px;}',
      '.wk-av{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#f3f4f6;display:block;}',
      '.wk-st{position:absolute;top:0;right:0;width:13px;height:13px;border-radius:50%;border:2px solid #fff;background:#d1d5db;}',
      '.wk-st.online{background:#10b981;}.wk-st.away{background:#f59e0b;}.wk-st.dnd{background:#ef4444;}',
      '.wk-bd{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px;}',
      '.wk-r1,.wk-r2{display:flex;align-items:center;justify-content:space-between;gap:8px;}',
      '.wk-name{display:flex;align-items:center;gap:6px;min-width:0;max-width:72%;}',
      '.wk-pin{font-size:13px;display:none;}.wk-pin.show{display:inline-block;}',
      '.wk-nm{font-size:17px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.wk-tm{font-size:13px;color:#9ca3af;white-space:nowrap;}',
      '.wk-pv{font-size:14px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.wk-bg{background:#ef4444;color:#fff;font-size:12px;font-weight:700;min-width:20px;height:20px;border-radius:999px;display:none;align-items:center;justify-content:center;padding:0 6px;}',
      '.wk-empty{padding:48px 20px;text-align:center;color:#94a3b8;font-size:15px;}',
      '.wk-mask{position:fixed;inset:0;background:rgba(0,0,0,.34);z-index:999999;display:none;opacity:0;transition:opacity .16s;}',
      '.wk-mask.show{display:block;opacity:1;}',
      '.wk-sheet{position:absolute;left:12px;right:12px;bottom:10px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.18);transform:translateY(12px);transition:transform .16s;}',
      '.wk-mask.show .wk-sheet{transform:translateY(0);}',
      '.wk-sheet-head{padding:14px 16px 10px;font-size:14px;font-weight:700;border-bottom:1px solid rgba(0,0,0,.06);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.wk-sheet button{display:block;width:100%;padding:14px 16px;border:0;background:#fff;text-align:left;font-size:16px;}',
      '.wk-sheet button+button{border-top:1px solid rgba(0,0,0,.06);}',
      '.wk-sheet button:active{background:#f8fafc;}',
      '.wk-sheet .danger{color:#dc2626;}',
      '.wk-sheet .cancel{font-weight:700;}',
      '@media (max-width:420px){.wk-row{height:78px;padding:0 11px;gap:11px;}.wk-row::after{left:71px;}.wk-aw{width:48px;height:48px;flex-basis:48px;}.wk-nm{font-size:16px;}.wk-pv{font-size:13px;}.wk-tm{font-size:12px;}}'
    ].join('');
    document.head.appendChild(s);
  }
  function rowHtml(item) {
    const name = getRemark(item) || item.name || ('用户 ' + (item.nodeUid || item.wkUid));
    const avatar = item.avatar || ('https://ui-avatars.com/api/?background=6c757d&color=fff&size=96&name=' + encodeURIComponent((name || '?').charAt(0)));
    const target = encodeURIComponent(item.nodeUid || item.wkUid);
    const status = String(item.status || 'offline');
    return '<button class="wk-row" data-key="' + esc(getMetaKey(item)) + '" data-target="' + esc(target) + '">' +
      '<div class="wk-aw">' +
        '<img class="wk-av" src="' + esc(avatar) + '" alt="" />' +
        '<span class="wk-st ' + esc(status) + '"></span>' +
      '</div>' +
      '<div class="wk-bd">' +
        '<div class="wk-r1"><span class="wk-name"><span class="wk-pin ' + (isPinned(item) ? 'show' : '') + '">📌</span><span class="wk-nm">' + esc(name) + '</span></span><span class="wk-tm">' + esc(fmtTime(item.time)) + '</span></div>' +
        '<div class="wk-r2"><span class="wk-pv">' + esc(item.preview || '暂无消息') + '</span><span class="wk-bg" style="display:' + (item.unread > 0 ? 'inline-flex' : 'none') + '">' + esc(item.unread > 99 ? '99+' : item.unread) + '</span></div>' +
      '</div>' +
    '</button>';
  }
  function openMenu(item) {
    const mask = byId('wkMenuMask');
    const head = byId('wkMenuHead');
    const list = byId('wkMenuList');
    if (!mask || !head || !list) return;
    const remark = getRemark(item);
    head.textContent = remark || item.name || '会话';
    list.innerHTML = '';
    function addBtn(text, cls, handler) {
      const btn = document.createElement('button');
      btn.className = cls || '';
      btn.textContent = text;
      btn.addEventListener('click', handler);
      list.appendChild(btn);
    }
    addBtn(isPinned(item) ? '取消置顶' : '置顶会话', '', function () { setPinned(item, !isPinned(item)); closeMenu(); refresh(); });
    addBtn(remark ? '修改备注' : '添加备注', '', function () {
      closeMenu();
      setTimeout(function () {
        const val = window.prompt('请输入备注（留空清除）', remark || '');
        if (val === null) return;
        setRemark(item, val);
        refresh();
      }, 20);
    });
    if (remark) addBtn('清除备注', '', function () { setRemark(item, ''); closeMenu(); refresh(); });
    addBtn('隐藏会话', 'danger', function () { setHidden(item, true); closeMenu(); refresh(); });
    addBtn('取消', 'cancel', closeMenu);
    mask.style.display = 'block';
    requestAnimationFrame(function () { mask.classList.add('show'); });
  }
  function closeMenu() {
    const mask = byId('wkMenuMask');
    if (!mask) return;
    mask.classList.remove('show');
    setTimeout(function () { if (!mask.classList.contains('show')) mask.style.display = 'none'; }, 180);
  }
  function renderShell() {
    const root = byId('wkMessagesPage');
    if (!root) return;
    root.innerHTML = [
      '<div class="wk-top"><h1>消息</h1><p id="wkMessagesSubtitle">初始化中…</p></div>',
      '<div id="wkMessagesRoot"></div>',
      '<div id="wkMenuMask" class="wk-mask"><div class="wk-sheet"><div id="wkMenuHead" class="wk-sheet-head"></div><div id="wkMenuList"></div></div></div>'
    ].join('');
    byId('wkMenuMask').addEventListener('click', function (e) { if (e.target === this) closeMenu(); });
  }
  function bindRows(items) {
    const root = byId('wkMessagesRoot');
    if (!root) return;
    root.querySelectorAll('.wk-row').forEach(function (btn) {
      const key = btn.getAttribute('data-key');
      const item = items.find(function (x) { return getMetaKey(x) === key; });
      if (!item) return;
      btn.addEventListener('click', function () {
        window.location.href = state.bootstrap.chat.chatPathPrefix + encodeURIComponent(item.nodeUid || item.wkUid);
      });
      btn.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        openMenu(item);
      });
      btn.addEventListener('touchstart', function (e) {
        clearTimeout(state.longPressTimer);
        state.longPressKey = key;
        state.longPressTimer = setTimeout(function () {
          state.longPressTimer = null;
          openMenu(item);
          if (navigator.vibrate) try { navigator.vibrate(10); } catch (err) {}
        }, 420);
      }, { passive: true });
      ['touchend', 'touchcancel', 'touchmove'].forEach(function (ev) {
        btn.addEventListener(ev, function () {
          if (state.longPressTimer) {
            clearTimeout(state.longPressTimer);
            state.longPressTimer = null;
          }
        }, { passive: true });
      });
    });
  }
  function renderList(items) {
    const root = byId('wkMessagesRoot');
    if (!root) return;
    if (!items.length) {
      root.innerHTML = '<div class="wk-empty">暂无会话</div>';
      return;
    }
    root.innerHTML = '<div class="wk-list">' + items.map(rowHtml).join('') + '</div>';
    bindRows(items);
  }
  async function refresh() {
    byId('wkMessagesSubtitle').textContent = '同步中…';
    await Promise.all([fetchNodeBBChats(), fetchWkConversations()]);
    let items = mergeConversations();
    await ensureProfiles(items);
    items = mergeConversations();
    renderList(items);
    byId('wkMessagesSubtitle').textContent = '共 ' + items.length + ' 个会话';
  }
  async function boot() {
    try {
      injectCss();
      renderShell();
      await loadBootstrap();
      await refresh();
    } catch (err) {
      if (byId('wkMessagesRoot')) byId('wkMessagesRoot').innerHTML = '<div class="wk-empty">会话列表初始化失败：' + esc(err.message) + '</div>';
      if (byId('wkMessagesSubtitle')) byId('wkMessagesSubtitle').textContent = '初始化失败';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
