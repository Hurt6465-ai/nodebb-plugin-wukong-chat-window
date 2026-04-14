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
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    return (d.getMonth() + 1) + '/' + d.getDate();
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
    text = String(text || '').trim();
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
    await Promise.all(tasks.slice(0, 12));
  }
  function rowHtml(item) {
    const name = getRemark(item) || item.name || ('用户 ' + (item.nodeUid || item.wkUid));
    const avatar = item.avatar || ('https://ui-avatars.com/api/?background=6c757d&color=fff&size=96&name=' + encodeURIComponent((name || '?').charAt(0)));
    const target = encodeURIComponent(item.nodeUid || item.wkUid);
    return '<button class="wk-msg-row" data-key="' + esc(getMetaKey(item)) + '" data-target="' + esc(target) + '">' +
      '<img class="wk-msg-avatar" src="' + esc(avatar) + '" alt="" />' +
      '<div class="wk-msg-body">' +
        '<div class="wk-msg-line1"><strong>' + esc(name) + '</strong><span>' + esc(fmtTime(item.time)) + '</span></div>' +
        '<div class="wk-msg-line2"><span>' + esc(item.preview || '暂无消息') + '</span>' + (item.unread > 0 ? '<em>' + esc(item.unread > 99 ? '99+' : item.unread) + '</em>' : '') + '</div>' +
      '</div>' +
    '</button>';
  }
  function renderList(items) {
    const root = byId('wkMessagesRoot');
    if (!root) return;
    if (!items.length) {
      root.innerHTML = '<div class="wk-empty">暂无会话</div>';
      return;
    }
    root.innerHTML = '<div class="wk-msg-list">' + items.map(rowHtml).join('') + '</div>';
    root.querySelectorAll('.wk-msg-row').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const target = btn.getAttribute('data-target');
        window.location.href = state.bootstrap.chat.chatPathPrefix + target;
      });
      btn.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        const key = btn.getAttribute('data-key');
        const item = items.find(function (x) { return getMetaKey(x) === key; });
        if (!item) return;
        const remark = getRemark(item);
        const action = prompt('输入操作：\n1=置顶/取消置顶\n2=备注\n3=隐藏\n当前备注：' + (remark || '无'), '');
        if (action === '1') setPinned(item, !isPinned(item));
        else if (action === '2') {
          const val = prompt('输入备注，留空清除', remark || '');
          if (val !== null) setRemark(item, val);
        } else if (action === '3') setHidden(item, true);
        refresh();
      });
    });
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
      await loadBootstrap();
      await refresh();
    } catch (err) {
      byId('wkMessagesRoot').innerHTML = '<div class="wk-empty">会话列表初始化失败：' + esc(err.message) + '</div>';
      byId('wkMessagesSubtitle').textContent = '初始化失败';
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
