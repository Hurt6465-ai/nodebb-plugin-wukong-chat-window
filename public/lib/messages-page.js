(function (W) {
  'use strict';
  if (W.__wkStandaloneListV192) return;
  W.__wkStandaloneListV192 = true;

  var ITEM_H = 84;
  var BUFFER = 4;
  var MAX_CONV = 200;
  var SYNC_PAGE = 120;
  var PROFILE_TTL = 12 * 36e5;
  var RETRY_MAX = 3;
  var RETRY_BASE = 2500;
  var BIND_RETRY_MS = 6200;
  var SAVE_THROTTLE_MS = 2500;
  var POLL_HEALTHY_MS = 60000;
  var POLL_UNHEALTHY_MS = 12000;
  var SYNC_DEBOUNCE_MS = 400;
  var PROFILE_BATCH = 6;
  var POOL_MAX_EXCESS = 20;
  var LONG_PRESS_MS = 450;
  var DEBUG_WK = false;

  var FLAGS = {
    '中国': 'cn', 'cn': 'cn', 'china': 'cn', '台湾': 'tw', 'tw': 'tw', 'taiwan': 'tw',
    '香港': 'hk', 'hk': 'hk', '澳门': 'mo', 'mo': 'mo', '缅甸': 'mm', 'mm': 'mm', 'myanmar': 'mm',
    '越南': 'vn', 'vn': 'vn', 'vietnam': 'vn', '日本': 'jp', 'jp': 'jp', 'japan': 'jp',
    '韩国': 'kr', 'kr': 'kr', 'korea': 'kr', '美国': 'us', 'us': 'us', 'usa': 'us',
    '英国': 'gb', 'gb': 'gb', 'uk': 'gb', '泰国': 'th', 'th': 'th', 'thailand': 'th',
    '老挝': 'la', 'la': 'la', 'laos': 'la', '新加坡': 'sg', 'sg': 'sg', 'singapore': 'sg',
    '马来西亚': 'my', 'my': 'my', 'malaysia': 'my', '菲律宾': 'ph', 'ph': 'ph', 'philippines': 'ph',
    '印尼': 'id', 'id': 'id', 'indonesia': 'id', '柬埔寨': 'kh', 'kh': 'kh', 'cambodia': 'kh',
    '印度': 'in', 'in': 'in', 'india': 'in', '俄罗斯': 'ru', 'ru': 'ru', 'russia': 'ru',
    '德国': 'de', 'de': 'de', 'germany': 'de', '法国': 'fr', 'fr': 'fr', 'france': 'fr',
    '巴西': 'br', 'br': 'br', 'brazil': 'br', '加拿大': 'ca', 'ca': 'ca', 'canada': 'ca',
    '澳大利亚': 'au', 'au': 'au', 'australia': 'au', '土耳其': 'tr', 'tr': 'tr', 'turkey': 'tr',
    '阿联酋': 'ae', 'ae': 'ae', 'uae': 'ae', '迪拜': 'ae', '沙特': 'sa', 'sa': 'sa',
    '埃及': 'eg', 'eg': 'eg', 'egypt': 'eg', '南非': 'za', 'za': 'za'
  };

  function log() {
    if (!DEBUG_WK || !W.console) return;
    var args = ['[WK-Standalone-19.2]'];
    for (var i = 0; i < arguments.length; i++) args.push(arguments[i]);
    console.log.apply(console, args);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function basePath() {
    return (W.config && W.config.relative_path) || '';
  }

  function myUid() {
    return String(
      (W.__WK_MESSAGES_BOOTSTRAP__ && W.__WK_MESSAGES_BOOTSTRAP__.user && W.__WK_MESSAGES_BOOTSTRAP__.user.uid) ||
      (W.app && W.app.user && W.app.user.uid) ||
      (W.config && W.config.uid) || ''
    );
  }

  function isNumericId(v) {
    return /^\d+$/.test(String(v || ''));
  }

  function wkUidFromKey(v) {
    v = String(v || '').trim();
    return /^\d+$/.test(v) ? ('nbb_' + v) : v;
  }

  function nodeUidFromWkUid(v) {
    v = String(v || '');
    return /^nbb_\d+$/.test(v) ? v.slice(4) : v;
  }

  function computeItemHeight() {
    var w = Math.max(
      W.innerWidth || 0,
      document.documentElement.clientWidth || 0,
      document.body ? document.body.clientWidth : 0
    );
    return w <= 420 ? 78 : w <= 768 ? 82 : 84;
  }

  function applyItemHeight() {
    var h = computeItemHeight();
    if (h === ITEM_H) return false;
    ITEM_H = h;
    var root = document.getElementById('wk-root');
    if (root) root.style.setProperty('--wk-item-h', ITEM_H + 'px');
    return true;
  }

  function normalizeStatus(v) {
    v = String(v || '').toLowerCase();
    if (!v) return 'offline';
    if (v === '1' || v === 'true') return 'online';
    if (v.indexOf('online') > -1 || v === 'connected' || v === 'active') return 'online';
    if (v.indexOf('away') > -1 || v === 'idle') return 'away';
    if (v.indexOf('dnd') > -1 || v.indexOf('busy') > -1) return 'dnd';
    return 'offline';
  }

  function userApiUrl(idOrSlug) {
    idOrSlug = String(idOrSlug || '');
    if (!idOrSlug) return '';
    return basePath() + (
      isNumericId(idOrSlug)
        ? '/api/user/uid/' + encodeURIComponent(idOrSlug)
        : '/api/user/' + encodeURIComponent(idOrSlug)
    );
  }

  function extractUserFromApiPayload(raw) {
    if (!raw) return null;
    var candidates = [raw, raw.user, raw.response, raw.response && raw.response.user];
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (c && (c.uid || c.username || c.displayname)) return c;
    }
    return null;
  }

  function normalizeUserPayload(u) {
    if (!u) return null;
    return {
      uid: String(u.uid || ''),
      username: u.displayname || u.username || '',
      picture: u.picture || '',
      flag: u.language_flag || u.location || '',
      status: normalizeStatus(u.status),
      _ts: Date.now(),
      userslug: u.userslug || ''
    };
  }

  function flagCode(raw) {
    if (!raw) return '';
    raw = String(raw).replace(/["\[\]{}]/g, '').trim().toLowerCase();
    if (!raw) return '';
    if (FLAGS[raw]) return FLAGS[raw];
    for (var k in FLAGS) {
      if (Object.prototype.hasOwnProperty.call(FLAGS, k) && raw.indexOf(k) > -1) return FLAGS[k];
    }
    return /^[a-z]{2}$/.test(raw) ? raw : '';
  }

  function fmtTime(ts) {
    if (!ts) return '';
    var n = String(ts).length < 13 ? Number(ts) * 1000 : Number(ts);
    var d = new Date(n);
    if (isNaN(d.getTime())) return '';

    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var tDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.floor((today - tDay) / 864e5);
    var p = function (x) { return x < 10 ? '0' + x : '' + x; };

    if (diff === 0) return p(d.getHours()) + ':' + p(d.getMinutes());
    if (diff === 1) return '昨天';
    if (diff < 7) return ['周日','周一','周二','周三','周四','周五','周六'][d.getDay()];
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate();
  }

  function teaserText(room) {
    var t = room && room.teaser;
    if (!t) return '';
    var txt = String(t.content || '').replace(/<[^>]+>/g, '');
    return txt.length > 50 ? txt.substring(0, 50) + '…' : txt;
  }

  function wkMsgText(conv) {
    var msg = conv.last_message || (conv.recents && conv.recents[conv.recents.length - 1]);
    if (!msg) return { t: '', uid: '' };

    var payload;
    try {
      if (typeof msg.payload === 'object' && msg.payload !== null) {
        payload = msg.payload;
      } else if (typeof msg.payload === 'string' && msg.payload.length) {
        var s = msg.payload.trim();
        if (s[0] === '{' || s[0] === '[') {
          payload = JSON.parse(s);
        } else {
          var bin = atob(s);
          var arr = new Uint8Array(bin.length);
          for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          payload = JSON.parse(new TextDecoder().decode(arr));
        }
      }
    } catch (e) {
      payload = { content: String(msg.payload || '') };
    }

    var txt = (payload && (payload.text || payload.content)) || '';
    txt = String(txt).replace(/<[^>]+>/g, '');

    if (/^\[图片\]|^!\[\]/.test(txt)) txt = '[图片]';
    else if (/^\[视频\]/.test(txt)) txt = '[视频]';
    else if (/^\[语音/.test(txt)) txt = '[语音]';
    else if (/^\[文件/.test(txt)) txt = '[文件]';
    else if (txt.length > 50) txt = txt.substring(0, 50) + '…';

    return {
      t: txt || '[消息]',
      uid: String(msg.from_uid || msg.fromUid || msg.uid || '')
    };
  }

  function getJSON(url, options) {
    return fetch(url, Object.assign({ credentials: 'same-origin' }, options || {})).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      return res.json();
    });
  }

  function postJSON(url, body) {
    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      return res.json();
    });
  }

  function injectCSS() {
    if (document.getElementById('wk192css')) return;
    var s = document.createElement('style');
    s.id = 'wk192css';
    s.textContent = [
      '.wk-page{min-height:100%;background:transparent;}',
      '#wk-root{',
      '  --wk-item-h:84px;',
      '  --bg:#fff;--bg2:#f3f4f6;--bg3:#e5e7eb;',
      '  --c1:#111827;--c2:#6b7280;--c3:#9ca3af;',
      '  --bd:#f3f4f6;--red:#ef4444;--green:#10b981;--yellow:#f59e0b;--gray:#d1d5db;',
      '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
      '  background:var(--bg);color:var(--c1);width:100%;min-height:calc(100vh - 72px);',
      '  display:flex;flex-direction:column;position:relative;overflow:hidden;border-radius:18px;',
      '  border:1px solid rgba(0,0,0,.04);box-shadow:0 10px 30px rgba(15,23,42,.04);-webkit-text-size-adjust:100%;',
      '}',
      '[data-bs-theme="dark"] #wk-root,html.dark #wk-root,body.dark #wk-root{',
      '  --bg:#1e1e2e;--bg2:#2a2a3c;--bg3:#363649;',
      '  --c1:#e4e4e7;--c2:#a1a1aa;--c3:#71717a;--bd:#2a2a3c;',
      '  border-color:rgba(255,255,255,.06);box-shadow:none;',
      '}',
      '#wk-root *,#wk-root *::before,#wk-root *::after{box-sizing:border-box}',
      '.wk-head{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px;border-bottom:1px solid var(--bd);gap:12px}',
      '.wk-head-title{min-width:0}.wk-head-title h1{margin:0;font-size:22px;line-height:1.2}.wk-head-title p{margin:4px 0 0;color:var(--c2);font-size:13px}',
      '.wk-head-actions{display:flex;gap:8px;align-items:center;flex-shrink:0}',
      '.wk-btn{border:1px solid var(--bd);background:var(--bg);color:var(--c1);border-radius:12px;padding:9px 12px;font-size:13px;font-weight:600;cursor:pointer}',
      '.wk-btn:active{transform:translateY(1px)}',
      '.wk-sc{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;position:relative;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;scrollbar-width:thin;scrollbar-color:var(--bd) transparent;}',
      '.wk-sc::-webkit-scrollbar{width:4px}',
      '.wk-sc::-webkit-scrollbar-thumb{background:var(--bd);border-radius:2px}',
      '.wk-sc::-webkit-scrollbar-track{background:transparent}',
      '.wk-ph{width:100%;pointer-events:none}',
      '.wk-vl{position:absolute;left:0;right:0;top:0;margin:0;padding:0;list-style:none;will-change:transform;contain:layout style;}',
      '.wk-i{position:relative;height:var(--wk-item-h);display:flex;align-items:center;padding:0 14px;gap:14px;cursor:pointer;transition:background .12s;user-select:none;-webkit-tap-highlight-color:transparent;outline:none;contain:content;}',
      '.wk-i::after{content:"";position:absolute;left:84px;right:0;bottom:0;height:1px;background:var(--bd);}',
      '.wk-i:active,.wk-i.wk-tap{background:var(--bg3)}',
      '.wk-i[data-act="1"]{background:var(--bg2)}',
      '.wk-aw{position:relative;width:54px;height:54px;flex-shrink:0}',
      '.wk-av{width:100%;height:100%;border-radius:50%;object-fit:cover;background:var(--bg2);display:block}',
      '.wk-st{position:absolute;top:0;right:0;width:13px;height:13px;border-radius:50%;border:2px solid var(--bg);background:var(--gray);z-index:2;transition:background .3s}',
      '.wk-st[data-s="online"]{background:var(--green)}',
      '.wk-st[data-s="away"]{background:var(--yellow)}',
      '.wk-st[data-s="dnd"]{background:var(--red)}',
      '.wk-fl{position:absolute;bottom:-1px;left:-3px;width:20px;height:14px;border-radius:2px;border:1.5px solid var(--bg);z-index:2;object-fit:cover;display:none}',
      '.wk-fl[data-v="1"]{display:block}',
      '.wk-bd{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:4px}',
      '.wk-r1,.wk-r2{display:flex;align-items:center;justify-content:space-between}',
      '.wk-lt{display:flex;align-items:center;gap:4px;min-width:0;max-width:72%}',
      '.wk-pn{display:none;font-size:13px;line-height:1;flex-shrink:0}',
      '.wk-pn[data-v="1"]{display:inline-block}',
      '.wk-nm{font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--c1);line-height:1.25}',
      '.wk-tm{font-size:13px;color:var(--c3);flex-shrink:0;margin-left:8px;white-space:nowrap}',
      '.wk-pv{font-size:14px;color:var(--c2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;line-height:1.35}',
      '.wk-bg{background:var(--red);color:#fff;font-size:12px;font-weight:700;min-width:20px;height:20px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;padding:0 6px;flex-shrink:0;margin-left:8px}',
      '.wk-em{flex:1;display:flex;align-items:center;justify-content:center;color:var(--c3);font-size:15px;padding:36px 18px;text-align:center}',
      '.wk-mm{position:fixed;inset:0;background:rgba(0,0,0,.34);z-index:999999;display:none;opacity:0;transition:opacity .16s;}',
      '.wk-mm[data-v="1"]{display:block;opacity:1;}',
      '.wk-ms{position:absolute;left:12px;right:12px;bottom:10px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.18);transform:translateY(12px);transition:transform .16s;}',
      '.wk-mm[data-v="1"] .wk-ms{transform:translateY(0);}',
      '[data-bs-theme="dark"] .wk-ms,html.dark .wk-ms,body.dark .wk-ms{background:#232334;color:#e4e4e7;}',
      '.wk-mh{padding:14px 16px 10px;font-size:14px;font-weight:700;border-bottom:1px solid rgba(0,0,0,.06);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '[data-bs-theme="dark"] .wk-mh,html.dark .wk-mh,body.dark .wk-mh{border-bottom-color:rgba(255,255,255,.08);}',
      '.wk-ma{display:block;width:100%;padding:14px 16px;border:0;background:transparent;text-align:left;font-size:16px;line-height:1.2;color:inherit;}',
      '.wk-ma + .wk-ma{border-top:1px solid rgba(0,0,0,.06);}',
      '[data-bs-theme="dark"] .wk-ma + .wk-ma,html.dark .wk-ma + .wk-ma,body.dark .wk-ma + .wk-ma{border-top-color:rgba(255,255,255,.08);}',
      '.wk-ma:active{background:rgba(0,0,0,.05);}',
      '.wk-ma.wk-danger{color:#dc2626;}',
      '.wk-ma.wk-cancel{font-weight:700;}',
      '@media (max-width:768px){#wk-root{--wk-item-h:82px}.wk-i{padding:0 12px;gap:12px}.wk-i::after{left:76px}.wk-aw{width:50px;height:50px}.wk-nm{font-size:16px}.wk-lt{max-width:68%}.wk-tm{font-size:12px}}',
      '@media (max-width:420px){#wk-root{--wk-item-h:78px}.wk-head{padding:14px 14px 10px}.wk-head-title h1{font-size:20px}.wk-i{padding:0 11px;gap:11px}.wk-i::after{left:71px}.wk-aw{width:48px;height:48px}.wk-nm{font-size:16px}.wk-lt{max-width:66%}.wk-pv{font-size:13px}.wk-tm{font-size:12px}.wk-bg{min-width:19px;height:19px;font-size:11px;padding:0 5px}}'
    ].join('\n');
    document.head.appendChild(s);
  }

  var Store = {
    uid: '',
    rooms: [],
    byId: {},
    profiles: {},
    uidToRoom: {},
    roomToUid: {},
    source: 'nodebb',
    activeRoom: '',
    activeTargetUid: '',
    meta: { pinned: {}, hidden: {}, remarks: {} },
    _dirty: true,
    _filtered: null,
    _saveTimer: 0,
    _savePending: false,

    init: function (uid) {
      uid = String(uid);
      if (this.uid === uid && this.rooms.length) return;
      this.uid = uid;
      this.rooms = [];
      this.byId = {};
      this.profiles = {};
      this.uidToRoom = {};
      this.roomToUid = {};
      this.source = 'nodebb';
      this.activeRoom = '';
      this.activeTargetUid = '';
      this.meta = { pinned: {}, hidden: {}, remarks: {} };
      this._dirty = true;
      this._filtered = null;
      try {
        var raw = localStorage.getItem('wk191_' + uid) || localStorage.getItem('wk192_' + uid);
        if (raw) {
          var d = JSON.parse(raw);
          this.rooms = d.r || [];
          this.profiles = d.p || {};
          this.uidToRoom = d.u || {};
          this.roomToUid = d.ru || {};
          this.source = d.s || 'nodebb';
          this.meta = d.m || { pinned: {}, hidden: {}, remarks: {} };
        }
      } catch (e) {}
      this._rebuildIndex();
    },

    _getRoomKey: function (room) {
      if (!room) return '';
      if (room.channel_id) return String(room.channel_id);
      return String(room.roomId || room.room_id || '');
    },

    _resolveKey: function (roomOrId) {
      if (!roomOrId) return '';
      return typeof roomOrId === 'object' ? this._getRoomKey(roomOrId) : String(roomOrId);
    },

    _getMetaKeys: function (roomOrId) {
      var id = this._resolveKey(roomOrId);
      var out = [];
      function add(v) {
        v = String(v || '');
        if (v && out.indexOf(v) === -1) out.push(v);
      }
      add(id);
      if (this.uidToRoom[id]) add(this.uidToRoom[id]);
      if (this.roomToUid[id]) add(this.roomToUid[id]);
      return out;
    },

    _metaGet: function (type, roomOrId) {
      var map = this.meta[type] || {};
      var keys = this._getMetaKeys(roomOrId);
      for (var i = 0; i < keys.length; i++) {
        if (Object.prototype.hasOwnProperty.call(map, keys[i])) return map[keys[i]];
      }
      return type === 'remarks' ? '' : 0;
    },

    _metaSet: function (type, roomOrId, value) {
      var map = this.meta[type] || (this.meta[type] = {});
      var keys = this._getMetaKeys(roomOrId);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        if (type === 'remarks') {
          if (value) map[k] = value;
          else delete map[k];
        } else {
          if (value) map[k] = 1;
          else delete map[k];
        }
      }
      this.markDirty();
      this.save();
    },

    isPinned: function (roomOrId) { return !!this._metaGet('pinned', roomOrId); },
    isHidden: function (roomOrId) { return !!this._metaGet('hidden', roomOrId); },
    getRemark: function (roomOrId) { return String(this._metaGet('remarks', roomOrId) || ''); },
    setPinned: function (roomOrId, flag) { this._metaSet('pinned', roomOrId, !!flag); },
    setHidden: function (roomOrId, flag) { this._metaSet('hidden', roomOrId, !!flag); },
    setRemark: function (roomOrId, text) {
      text = String(text || '').trim().replace(/\s+/g, ' ');
      if (text.length > 30) text = text.slice(0, 30);
      this._metaSet('remarks', roomOrId, text);
    },
    clearRemark: function (roomOrId) { this._metaSet('remarks', roomOrId, ''); },
    hiddenList: function () {
      var out = [];
      var m = this.meta.hidden || {};
      for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k) && m[k]) out.push(k);
      return out;
    },

    _rebuildIndex: function () {
      this.byId = {};
      for (var i = 0; i < this.rooms.length; i++) {
        var id = this._getRoomKey(this.rooms[i]);
        if (id) this.byId[id] = this.rooms[i];
      }
      this._dirty = true;
      this._filtered = null;
    },

    getFiltered: function () {
      if (!this._dirty && this._filtered) return this._filtered;
      var pins = [];
      var rest = [];
      for (var i = 0; i < this.rooms.length; i++) {
        var room = this.rooms[i];
        var id = this._getRoomKey(room);
        if (this.isHidden(id)) continue;
        if (this.isPinned(id)) pins.push(room);
        else rest.push(room);
      }
      this._filtered = pins.concat(rest);
      this._dirty = false;
      return this._filtered;
    },

    markDirty: function () { this._dirty = true; this._filtered = null; },

    save: function () {
      this._savePending = true;
      if (this._saveTimer) return;
      var self = this;
      this._saveTimer = setTimeout(function () {
        self._saveTimer = 0;
        if (!self._savePending) return;
        self._savePending = false;
        self._doSave();
      }, SAVE_THROTTLE_MS);
    },

    saveNow: function () {
      if (this._saveTimer) {
        clearTimeout(this._saveTimer);
        this._saveTimer = 0;
      }
      this._savePending = false;
      this._doSave();
    },

    _doSave: function () {
      try {
        var payload = JSON.stringify({
          r: this.rooms.slice(0, MAX_CONV),
          p: this.profiles,
          u: this.uidToRoom,
          ru: this.roomToUid,
          s: this.source,
          m: this.meta
        });
        localStorage.setItem('wk191_' + this.uid, payload);
        localStorage.setItem('wk192_' + this.uid, payload);
      } catch (e) { log('save err', e); }
    },

    baseName: function (room) {
      if (room.roomName) return room.roomName;
      if (room.name) return room.name;
      if (room.usernames) return room.usernames;
      if (room.users && room.users.length) {
        var self = this.uid;
        var names = [];
        for (var i = 0; i < room.users.length; i++) {
          var u = room.users[i];
          if (String(u.uid) !== self) names.push(u.displayname || u.username || '用户');
        }
        return names.join(', ') || '聊天';
      }
      if (room.channel_id) {
        var p = this.profiles[String(room.channel_id)];
        return p ? p.username : ('用户 ' + room.channel_id);
      }
      return '聊天';
    },

    displayName: function (room) {
      var remark = this.getRemark(room);
      if (remark) return remark;
      return this.baseName(room);
    },

    getOtherUser: function (room) {
      if (!room.users || !room.users.length) return null;
      var self = this.uid;
      for (var i = 0; i < room.users.length; i++) {
        if (String(room.users[i].uid) !== self) return room.users[i];
      }
      return room.users[0];
    }
  };

  W.addEventListener('beforeunload', function () { Store.saveNow(); });
  W.addEventListener('pagehide', function () { Store.saveNow(); });

  var Menu = {
    mask: null,
    sheet: null,
    head: null,
    list: null,
    activeId: '',

    ensure: function () {
      if (this.mask) return;
      var mask = document.createElement('div');
      mask.className = 'wk-mm';
      mask.innerHTML = '<div class="wk-ms"><div class="wk-mh"></div><div class="wk-ml"></div></div>';
      document.body.appendChild(mask);
      this.mask = mask;
      this.sheet = mask.querySelector('.wk-ms');
      this.head = mask.querySelector('.wk-mh');
      this.list = mask.querySelector('.wk-ml');
      var self = this;
      mask.addEventListener('click', function (e) { if (e.target === mask) self.close(); });
    },

    _makeBtn: function (text, cls, fn) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wk-ma' + (cls ? (' ' + cls) : '');
      btn.textContent = text;
      btn.addEventListener('click', fn);
      return btn;
    },

    open: function (id) {
      id = String(id || '');
      if (!id) return;
      this.ensure();
      this.activeId = id;
      var room = Store.byId[id] || (Store.uidToRoom[id] ? Store.byId[Store.uidToRoom[id]] : null) || (Store.roomToUid[id] ? Store.byId[Store.roomToUid[id]] : null);
      var title = Store.getRemark(id) || (room ? Store.baseName(room) : ('会话 ' + id));
      var pinned = Store.isPinned(id);
      var remark = Store.getRemark(id);
      var self = this;
      this.head.textContent = title;
      this.list.innerHTML = '';
      this.list.appendChild(this._makeBtn(pinned ? '取消置顶' : '置顶会话', '', function () {
        Store.setPinned(id, !pinned); VList.scheduleRefresh(); self.close();
      }));
      this.list.appendChild(this._makeBtn(remark ? '修改备注' : '添加备注', '', function () {
        self.close();
        setTimeout(function () {
          var val = W.prompt('请输入备注（留空清除）', remark || '');
          if (val === null) return;
          val = String(val || '').trim();
          if (val) Store.setRemark(id, val); else Store.clearRemark(id);
          VList.scheduleRefresh();
        }, 30);
      }));
      if (remark) {
        this.list.appendChild(this._makeBtn('清除备注', '', function () {
          Store.clearRemark(id); VList.scheduleRefresh(); self.close();
        }));
      }
      this.list.appendChild(this._makeBtn('隐藏会话', 'wk-danger', function () {
        Store.setHidden(id, true); VList.scheduleRefresh(); self.close();
      }));
      this.list.appendChild(this._makeBtn('取消', 'wk-cancel', function () { self.close(); }));
      this.mask.style.display = 'block';
      requestAnimationFrame(function () { self.mask.setAttribute('data-v', '1'); });
    },

    close: function () {
      if (!this.mask) return;
      this.mask.removeAttribute('data-v');
      var self = this;
      setTimeout(function () { if (self.mask) self.mask.style.display = 'none'; }, 160);
      this.activeId = '';
    }
  };

  var Net = {
    _handlers: {},
    _bound: false,
    _bootstrapped: false,
    _syncing: false,
    _retryTimer: 0,
    _bindRetryTimer: 0,
    _fallbackTimer: 0,
    _syncDebounceTimer: 0,
    _socketRef: null,
    _socketHealthy: false,
    _profileInflight: {},
    _lastPollTs: 0,

    _clearRetry: function () { if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = 0; } },
    _clearBindRetry: function () { if (this._bindRetryTimer) { clearTimeout(this._bindRetryTimer); this._bindRetryTimer = 0; } },
    _clearFallback: function () { if (this._fallbackTimer) { clearInterval(this._fallbackTimer); this._fallbackTimer = 0; } },
    _clearSyncDebounce: function () { if (this._syncDebounceTimer) { clearTimeout(this._syncDebounceTimer); this._syncDebounceTimer = 0; } },

    _scheduleRetry: function (attempt) {
      var self = this;
      this._clearRetry();
      this._retryTimer = setTimeout(function () {
        self._retryTimer = 0;
        self.sync(attempt + 1);
      }, RETRY_BASE * Math.pow(2, attempt));
    },

    debouncedSync: function (delay) {
      var self = this;
      this._clearSyncDebounce();
      this._syncDebounceTimer = setTimeout(function () {
        self._syncDebounceTimer = 0;
        self.sync();
      }, typeof delay === 'number' ? delay : SYNC_DEBOUNCE_MS);
    },

    start: function () {
      this.ensureSocketBound();
      this.startFallback();
      if (!this._bootstrapped) this.bootstrap();
      else this.sync();
    },

    stop: function () {
      this._clearRetry();
      this._clearBindRetry();
      this._clearFallback();
      this._clearSyncDebounce();
      this.unbindSocket();
      this._syncing = false;
    },

    bootstrap: function () {
      if (this._syncing) return;
      this._syncing = true;
      var self = this;
      this._fetchNodeBB().then(function (okNodeBB) {
        if (okNodeBB) {
          self._bootstrapped = true;
          self._syncing = false;
          Ctrl.setReady(true);
          VList.scheduleRefresh();
          self.fetchProfiles();
          setTimeout(function () { self.sync(); }, 50);
          return;
        }
        return self._fetchBridge().then(function (okBridge) {
          self._syncing = false;
          if (okBridge) {
            self._bootstrapped = true;
            Ctrl.setReady(true);
            VList.scheduleRefresh();
            self.fetchProfiles();
          } else {
            Ctrl.setReady(false);
          }
        });
      }).catch(function () {
        self._syncing = false;
        Ctrl.setReady(false);
      });
    },

    startFallback: function () {
      if (this._fallbackTimer) return;
      var self = this;
      this._fallbackTimer = setInterval(function () {
        if (document.hidden) return;
        if (self._socketHealthy) {
          var elapsed = Date.now() - (self._lastPollTs || 0);
          if (elapsed < POLL_HEALTHY_MS) return;
        }
        self._lastPollTs = Date.now();
        self.sync();
      }, POLL_UNHEALTHY_MS);
    },

    ensureSocketBound: function () {
      var self = this;
      if (this._bound && this._socketRef && W.socket && this._socketRef !== W.socket) this.unbindSocket();
      if (this._bound && this._socketRef === W.socket) return;
      if (W.socket) {
        this._clearBindRetry();
        this.bindSocket();
        return;
      }
      if (this._bindRetryTimer) return;
      this._bindRetryTimer = setTimeout(function () {
        self._bindRetryTimer = 0;
        self.ensureSocketBound();
      }, BIND_RETRY_MS);
    },

    sync: function (attempt) {
      if (this._syncing) return;
      attempt = attempt || 0;
      this._syncing = true;
      var self = this;
      this._doSync().then(function (ok) {
        self._syncing = false;
        if (ok) {
          self._bootstrapped = true;
          self._clearRetry();
          if (!Ctrl.isReady()) Ctrl.setReady(true);
          VList.scheduleRefresh();
          self.fetchProfiles();
        } else if (attempt < RETRY_MAX) {
          self._scheduleRetry(attempt);
        }
      }).catch(function () {
        self._syncing = false;
        if (attempt < RETRY_MAX) self._scheduleRetry(attempt);
      });
    },

    _fetchBridge: function () {
      var bootstrap = W.__WK_MESSAGES_BOOTSTRAP__ || {};
      var syncUrl = bootstrap.conversationSyncPath || (basePath() + '/bridge/conversation/sync');
      return postJSON(syncUrl, { uid: Store.uid, version: 0, msg_count: 1 }).then(function (data) {
        var list = Array.isArray(data) ? data : (data.data || data.conversations || []);
        if (!Array.isArray(list)) list = [];
        list = list.filter(function (c) { return c && c.channel_type === 1; }).sort(function (a, b) {
          return (b.timestamp || 0) - (a.timestamp || 0);
        }).slice(0, MAX_CONV);
        if (!list.length) return false;

        for (var i = 0; i < list.length; i++) {
          var c = list[i];
          var targetKey = String(c.channel_id || '');
          var roomId = String(c.room_id || '');
          var existing = targetKey && Store.byId[targetKey] ? Store.byId[targetKey] : null;
          if (!existing && roomId && Store.byId[roomId]) existing = Store.byId[roomId];
          if (!existing && roomId && Store.roomToUid[roomId]) existing = Store.byId[Store.roomToUid[roomId]] || null;
          if (!existing) {
            existing = {
              channel_id: targetKey,
              room_id: roomId,
              roomId: roomId,
              unread: Number(c.unread || 0),
              timestamp: Number(c.timestamp || 0),
              last_message: c.last_message || null,
              name: '',
              users: []
            };
            Store.rooms.push(existing);
          }
          existing.channel_id = targetKey || existing.channel_id;
          existing.room_id = roomId || existing.room_id;
          existing.roomId = existing.roomId || roomId;
          existing.unread = Number(c.unread || existing.unread || 0);
          existing.timestamp = Number(c.timestamp || existing.timestamp || 0);
          existing.last_message = c.last_message || existing.last_message;
          if (targetKey && roomId) {
            Store.uidToRoom[targetKey] = roomId;
            Store.roomToUid[roomId] = targetKey;
          }
        }

        Store._rebuildIndex();
        Store.save();
        return true;
      }).catch(function (err) {
        log('bridge sync err', err && err.message ? err.message : err);
        return false;
      });
    },

    _fetchNodeBB: function () {
      var bp = basePath();
      return getJSON(bp + '/api/v3/chats?perPage=' + SYNC_PAGE).then(function (json) {
        var payload = json.response || json;
        var rooms = payload.rooms || [];
        var now = Date.now();
        Store.rooms = rooms.slice(0, MAX_CONV);
        Store.source = 'nodebb';
        rooms.forEach(function (r) {
          if (!r.users) return;
          var others = [];
          r.users.forEach(function (u) {
            var uid = String(u.uid || '');
            if (!uid || uid === Store.uid) return;
            others.push(uid);
            var prof = {
              uid: uid,
              username: u.displayname || u.username || '',
              picture: u.picture || '',
              flag: u.language_flag || u.location || '',
              status: normalizeStatus(u.status),
              _ts: now,
              userslug: u.userslug || ''
            };
            if (!Store.profiles[uid] || (now - (Store.profiles[uid]._ts || 0) > PROFILE_TTL)) {
              Store.profiles[uid] = prof;
              if (u.username) Store.profiles[String(u.username)] = prof;
              if (u.userslug) Store.profiles[String(u.userslug)] = prof;
            }
          });
          if (others.length === 1 && r.roomId) {
            Store.uidToRoom[others[0]] = String(r.roomId);
            Store.roomToUid[String(r.roomId)] = others[0];
            if (!r.channel_id) r.channel_id = wkUidFromKey(others[0]);
          }
        });
        Store._rebuildIndex();
        Store.save();
        return true;
      }).catch(function (err) {
        log('nodebb sync err', err && err.message ? err.message : err);
        return false;
      });
    },

    _doSync: function () {
      var self = this;
      return this._fetchBridge().then(function (ok) {
        if (ok) return true;
        return self._fetchNodeBB();
      }).catch(function () { return false; });
    },

    fetchProfiles: function () {
      var now = Date.now();
      var needs = {};
      Store.rooms.forEach(function (r) {
        if (r.users) {
          r.users.forEach(function (u) {
            var uid = String(u.uid || '');
            if (uid && uid !== Store.uid) {
              var c = Store.profiles[uid];
              if (!c || !c.flag || (now - (c._ts || 0) > PROFILE_TTL)) needs[uid] = true;
            }
          });
        }
        if (r.channel_id) {
          var key = String(nodeUidFromWkUid(r.channel_id));
          var c2 = Store.profiles[key];
          if (key && (!c2 || !c2.username || (now - (c2._ts || 0) > PROFILE_TTL))) needs[key] = true;
        }
      });
      var self = this;
      var batch = Object.keys(needs).filter(function (k) { return !self._profileInflight[k]; }).slice(0, PROFILE_BATCH);
      if (!batch.length) return;
      batch.forEach(function (k) { self._profileInflight[k] = true; });
      Promise.all(batch.map(function (key) {
        var url = userApiUrl(key);
        if (!url) return Promise.resolve(null);
        return fetch(url, { credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (raw) {
            var user = extractUserFromApiPayload(raw);
            if (user) return user;
            if (!W.socket || !isNumericId(key)) return null;
            return new Promise(function (resolve) {
              W.socket.emit('user.getUsersFields', {
                uids: [parseInt(key, 10)],
                fields: ['uid', 'username', 'displayname', 'userslug', 'picture', 'language_flag', 'location', 'status']
              }, function (err, data) {
                resolve(data && data[0] ? data[0] : null);
              });
            });
          })
          .then(function (u) {
            var prof = normalizeUserPayload(u);
            if (!prof) return;
            Store.profiles[String(key)] = prof;
            if (prof.uid) Store.profiles[prof.uid] = prof;
            if (u && u.username) Store.profiles[String(u.username)] = prof;
            if (u && u.userslug) Store.profiles[String(u.userslug)] = prof;
            if (prof.uid) Store.profiles['nbb_' + prof.uid] = prof;
          })
          .catch(function () {})
          .then(function () { delete self._profileInflight[key]; });
      })).then(function () {
        Store.save();
        VList.scheduleRefresh();
      });
    },

    _findRoomByMessage: function (data) {
      var roomId = String((data && (data.roomId || data.room_id)) || '');
      var room = roomId ? Store.byId[roomId] : null;
      if (!room && roomId && Store.roomToUid[roomId]) room = Store.byId[String(Store.roomToUid[roomId])] || null;
      if (!room && data) {
        if (data.channel_id) room = Store.byId[String(data.channel_id)] || room;
        if (!room && data.uid) room = Store.byId[String(data.uid)] || room;
        if (!room && data.fromUid) room = Store.byId[String(data.fromUid)] || room;
      }
      return room;
    },

    _patchMessageLike: function (data) {
      if (!data) return false;
      var room = this._findRoomByMessage(data);
      var nodebbRoomId = String(data.roomId || data.room_id || '');
      var msg = data.message || data.msg || data.data || {};
      var fromUid = String(data.fromUid || data.uid || msg.fromuid || msg.fromUid || msg.from_uid || (msg.fromUser && msg.fromUser.uid) || '');
      var isSelf = fromUid === Store.uid || data.self === 1;
      if (!room) return false;
      if (!room.teaser) room.teaser = {};
      room.teaser.content = msg.content || msg.payload || data.content || room.teaser.content || '';
      room.teaser.timestampISO = msg.timestampISO || new Date().toISOString();
      room.teaser.timestamp = msg.timestamp || data.timestamp || Date.now();
      room.teaser.user = msg.fromUser || { uid: fromUid };

      if (room.channel_id) {
        var targetKey = String(room.channel_id || '');
        room.timestamp = msg.timestamp || data.timestamp || Math.floor(Date.now() / 1000);
        room.last_message = {
          payload: msg.content || msg.payload || data.content || (room.last_message && room.last_message.payload) || '',
          from_uid: fromUid
        };
        if (nodebbRoomId && targetKey) {
          Store.uidToRoom[targetKey] = nodebbRoomId;
          Store.roomToUid[nodebbRoomId] = targetKey;
        }
        if (!isSelf && targetKey !== String(Store.activeTargetUid || '')) room.unread = (room.unread || 0) + 1;
      } else {
        if (!isSelf && nodebbRoomId !== String(Store.activeRoom || '')) room.unread = (room.unread || 0) + 1;
      }

      var idx = Store.rooms.indexOf(room);
      if (idx > 0) {
        Store.rooms.splice(idx, 1);
        Store.rooms.unshift(room);
      }
      Store.markDirty();
      Store.save();
      VList.scheduleRefresh();
      return true;
    },

    bindSocket: function () {
      if (!W.socket) return;
      if (this._bound && this._socketRef === W.socket) return;
      this._socketRef = W.socket;
      this._bound = true;
      this._socketHealthy = !!W.socket.connected;
      if (this._socketHealthy) this._lastPollTs = Date.now();
      this._clearBindRetry();
      var self = this;
      var skt = this._socketRef;
      this._handlers.connect = function () {
        self._socketHealthy = true;
        self._lastPollTs = Date.now();
        log('socket connect', skt && skt.io && skt.io.engine && skt.io.engine.transport ? skt.io.engine.transport.name : 'unknown');
        self.debouncedSync(150);
      };
      this._handlers.reconnect = function () {
        self._socketHealthy = true;
        self._lastPollTs = Date.now();
        log('socket reconnect');
        self.debouncedSync(200);
      };
      this._handlers.disconnect = function (reason) {
        self._socketHealthy = false;
        log('socket disconnect', reason || '');
      };
      this._handlers.connect_error = function (err) {
        self._socketHealthy = false;
        log('socket connect_error', err && err.message ? err.message : err);
      };
      this._handlers.error = function (err) {
        log('socket error', err && err.message ? err.message : err);
      };
      this._handlers['event:chats.receive'] = function (data) { if (!self._patchMessageLike(data)) self.debouncedSync(200); };
      this._handlers['chats.receive'] = function (data) { if (!self._patchMessageLike(data)) self.debouncedSync(200); };
      this._handlers['event:unread.updateChatCount'] = function () { self.debouncedSync(300); };
      this._handlers['event:unread.updateUnreadCount'] = function () { self.debouncedSync(300); };
      this._handlers['event:chats.mark'] = function (data) {
        var room = self._findRoomByMessage(data || {});
        if (room) {
          room.unread = data && data.state === 0 ? 0 : (room.unread || 1);
          Store.markDirty(); Store.save(); VList.scheduleRefresh();
        } else {
          self.debouncedSync(250);
        }
      };
      this._handlers['event:user_status_change'] = function (data) {
        var uid = String((data && data.uid) || '');
        var uname = data && data.username ? String(data.username) : '';
        var st = normalizeStatus(data && data.status);
        var changed = false;
        if (uid && Store.profiles[uid]) { Store.profiles[uid].status = st; Store.profiles[uid]._ts = Date.now(); changed = true; }
        if (uname && Store.profiles[uname]) { Store.profiles[uname].status = st; Store.profiles[uname]._ts = Date.now(); changed = true; }
        if (changed) { Store.save(); VList.scheduleRefresh(); }
      };
      this._handlers['event:chats.roomRename'] = function (data) {
        var room = self._findRoomByMessage(data || {});
        if (room) {
          room.roomName = data.newName || room.roomName;
          Store.markDirty(); Store.save(); VList.scheduleRefresh();
        } else {
          self.debouncedSync(250);
        }
      };
      this._handlers['event:chats.delete'] = function () { self.debouncedSync(300); };
      for (var ev in this._handlers) if (Object.prototype.hasOwnProperty.call(this._handlers, ev)) skt.on(ev, this._handlers[ev]);
    },

    unbindSocket: function () {
      var skt = this._socketRef || W.socket;
      if (skt && this._bound) {
        var off = typeof skt.off === 'function' ? 'off' : (typeof skt.removeListener === 'function' ? 'removeListener' : '');
        if (off) {
          for (var ev in this._handlers) if (Object.prototype.hasOwnProperty.call(this._handlers, ev)) skt[off](ev, this._handlers[ev]);
        }
      }
      this._handlers = {};
      this._bound = false;
      this._socketRef = null;
      this._socketHealthy = false;
    }
  };

  var VList = {
    pool: [],
    used: 0,
    rS: -1,
    rE: -1,
    _resizer: null,
    _resizeTimer: 0,
    _scrollBound: false,
    _scroller: null,
    _onScroll: null,
    _rafId: 0,
    _refreshQueued: false,

    createNode: function () {
      var li = document.createElement('li');
      li.className = 'wk-i';
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');
      li.innerHTML =
        '<div class="wk-aw">' +
          '<img class="wk-av" alt="" loading="lazy">' +
          '<div class="wk-st"></div>' +
          '<img class="wk-fl" alt="" loading="lazy">' +
        '</div>' +
        '<div class="wk-bd">' +
          '<div class="wk-r1">' +
            '<span class="wk-lt">' +
              '<span class="wk-pn"></span>' +
              '<span class="wk-nm"></span>' +
            '</span>' +
            '<span class="wk-tm"></span>' +
          '</div>' +
          '<div class="wk-r2">' +
            '<span class="wk-pv"></span>' +
            '<span class="wk-bx"><span class="wk-bg" style="display:none"></span></span>' +
          '</div>' +
        '</div>';

      li._$ = {
        img: li.querySelector('.wk-av'),
        dot: li.querySelector('.wk-st'),
        flag: li.querySelector('.wk-fl'),
        pin: li.querySelector('.wk-pn'),
        name: li.querySelector('.wk-nm'),
        time: li.querySelector('.wk-tm'),
        prev: li.querySelector('.wk-pv'),
        badge: li.querySelector('.wk-bg')
      };
      li._h = '';
      li._rid = '';
      li._suppressClickUntil = 0;

      var tapTimer = 0;
      li.addEventListener('touchstart', function () {
        tapTimer = setTimeout(function () { li.classList.add('wk-tap'); }, 60);
      }, { passive: true });
      var clearTap = function () { clearTimeout(tapTimer); li.classList.remove('wk-tap'); };
      li.addEventListener('touchend', clearTap, { passive: true });
      li.addEventListener('touchcancel', clearTap, { passive: true });

      var pressTimer = 0;
      var sx = 0; var sy = 0;
      function clearPress() {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = 0; }
      }
      li.addEventListener('touchstart', function (e) {
        if (!li._rid || !e.touches || e.touches.length !== 1) return;
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
        clearPress();
        pressTimer = setTimeout(function () {
          pressTimer = 0;
          li._suppressClickUntil = Date.now() + 600;
          Menu.open(li._rid);
          if (navigator.vibrate) try { navigator.vibrate(10); } catch (err) {}
        }, LONG_PRESS_MS);
      }, { passive: true });
      li.addEventListener('touchmove', function (e) {
        if (!pressTimer || !e.touches || !e.touches.length) return;
        var dx = Math.abs(e.touches[0].clientX - sx);
        var dy = Math.abs(e.touches[0].clientY - sy);
        if (dx > 10 || dy > 10) clearPress();
      }, { passive: true });
      li.addEventListener('touchend', clearPress, { passive: true });
      li.addEventListener('touchcancel', clearPress, { passive: true });
      li.addEventListener('contextmenu', function (e) {
        if (!li._rid) return;
        e.preventDefault();
        li._suppressClickUntil = Date.now() + 400;
        Menu.open(li._rid);
      });
      li.addEventListener('click', function (e) {
        if (!li._rid) return;
        if (li._suppressClickUntil && Date.now() < li._suppressClickUntil) { e.preventDefault(); return; }
        Ctrl.openRoom(li._rid);
      });
      li.addEventListener('keydown', function (e) {
        if ((e.key === 'Enter' || e.key === ' ') && li._rid) {
          e.preventDefault();
          Ctrl.openRoom(li._rid);
        }
      });
      return li;
    },

    _detachScroll: function () {
      if (this._scroller && this._onScroll) this._scroller.removeEventListener('scroll', this._onScroll);
      this._scroller = null;
      this._onScroll = null;
      this._scrollBound = false;
    },

    bind: function () {
      var sc = document.querySelector('#wk-root .wk-sc');
      if (!sc) return;
      if (this._scrollBound && this._scroller === sc) return;
      this._detachScroll();
      if (this._resizer) { this._resizer.disconnect(); this._resizer = null; }
      if (this._resizeTimer) { clearTimeout(this._resizeTimer); this._resizeTimer = 0; }
      this._scroller = sc;
      var self = this;
      var pending = false;
      this._onScroll = function () {
        if (pending) return;
        pending = true;
        requestAnimationFrame(function () {
          pending = false;
          self.render(false);
        });
      };
      sc.addEventListener('scroll', this._onScroll, { passive: true });
      this._scrollBound = true;
      if (typeof ResizeObserver !== 'undefined') {
        this._resizer = new ResizeObserver(function () {
          if (self._resizeTimer) clearTimeout(self._resizeTimer);
          self._resizeTimer = setTimeout(function () {
            self._resizeTimer = 0;
            if (applyItemHeight()) { self.rS = -1; self.rE = -1; }
            self.render(true);
          }, 150);
        });
        this._resizer.observe(sc);
      }
    },

    scheduleRefresh: function () {
      if (this._refreshQueued) return;
      this._refreshQueued = true;
      var self = this;
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this._rafId = requestAnimationFrame(function () {
        self._rafId = 0;
        self._refreshQueued = false;
        self.rS = -1;
        self.rE = -1;
        self.render(true);
      });
    },

    render: function (force) {
      var sc = document.querySelector('#wk-root .wk-sc');
      var vl = document.querySelector('#wk-root .wk-vl');
      var ph = document.querySelector('#wk-root .wk-ph');
      var em = document.querySelector('#wk-root .wk-em');
      if (!sc || !vl) return;
      var list = Store.getFiltered();
      var total = list.length;
      if (ph) ph.style.height = (total * ITEM_H) + 'px';
      if (em) em.style.display = total === 0 ? 'flex' : 'none';
      if (byId('wkMessagesSubtitle')) byId('wkMessagesSubtitle').textContent = total ? ('共 ' + total + ' 个会话') : '暂无会话';
      if (total === 0) {
        for (var z = 0; z < this.used; z++) this.pool[z].style.display = 'none';
        this.used = 0;
        this.rS = -1;
        this.rE = -1;
        vl.style.display = 'none';
        return;
      }
      vl.style.display = '';
      var viewH = sc.clientHeight;
      if (viewH <= 0) return;
      var scrollTop = sc.scrollTop;
      var start = Math.max(0, Math.floor(scrollTop / ITEM_H) - BUFFER);
      var end = Math.min(total, Math.ceil((scrollTop + viewH) / ITEM_H) + BUFFER);
      var count = end - start;
      while (this.pool.length < count) {
        var node = this.createNode();
        vl.appendChild(node);
        this.pool.push(node);
      }
      var rangeChanged = !!force || start !== this.rS || end !== this.rE || count !== this.used;
      if (rangeChanged) {
        for (var i = count; i < this.used; i++) this.pool[i].style.display = 'none';
        this.used = count;
        this.rS = start;
        this.rE = end;
        vl.style.transform = 'translate3d(0,' + (start * ITEM_H) + 'px,0)';
      }
      for (var vi = 0; vi < count; vi++) {
        var item = this.pool[vi];
        item.style.display = '';
        this._fill(item, list[start + vi]);
      }
      this._trimPool(count);
    },

    _trimPool: function (needed) {
      var keep = needed + POOL_MAX_EXCESS;
      if (this.pool.length <= keep) return;
      for (var i = this.pool.length - 1; i >= keep; i--) {
        var node = this.pool[i];
        if (node.parentNode) node.parentNode.removeChild(node);
      }
      this.pool.length = keep;
    },

    _fill: function (li, room) {
      var ref = li._$;
      var itemId = String(room.channel_id || room.roomId || room.room_id || '');
      var other = room.users ? Store.getOtherUser(room) : null;
      var targetUid = itemId && /^nbb_/.test(itemId) ? nodeUidFromWkUid(itemId) : (other ? String(other.uid || '') : '');
      var prof = Store.profiles[targetUid] || Store.profiles[itemId] || (other && Store.profiles[String(other.uid || '')]) || null;
      var name = Store.displayName(room);
      var avatar = (other && other.picture) || (prof && prof.picture) || '';
      var fc = prof ? flagCode(prof.flag) : (other ? flagCode(other.language_flag || other.location) : '');
      var status = normalizeStatus((prof && prof.status) || (other && other.status) || 'offline');
      var preview = teaserText(room);
      if (room.last_message) {
        var m = wkMsgText(room);
        preview = (m.uid === Store.uid ? '我: ' : '') + m.t;
      }
      var ts = room.timestamp || (room.teaser ? (room.teaser.timestamp || (room.teaser.timestampISO ? new Date(room.teaser.timestampISO).getTime() : 0)) : 0);
      var timeStr = fmtTime(ts);
      var unread = Number(room.unread || 0);
      var isActive = itemId === String(Store.activeTargetUid || '') || itemId === String(Store.activeRoom || '');
      var pinned = Store.isPinned(itemId);
      name = name || '未命名会话';
      preview = preview || '';
      timeStr = timeStr || '';
      status = status || 'offline';
      var hash = itemId + '\x01' + name + '\x01' + avatar + '\x01' + fc + '\x01' + status + '\x01' + timeStr + '\x01' + preview + '\x01' + unread + '\x01' + (isActive ? 1 : 0) + '\x01' + (pinned ? 1 : 0);
      if (li._h === hash) return;
      li._h = hash;
      li._rid = itemId;
      li.setAttribute('data-act', isActive ? '1' : '0');
      li.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      li.setAttribute('aria-label', name);
      ref.name.textContent = name;
      ref.time.textContent = timeStr;
      ref.prev.textContent = preview;
      if (pinned) {
        ref.pin.textContent = '📌';
        ref.pin.setAttribute('data-v', '1');
      } else {
        ref.pin.textContent = '';
        ref.pin.removeAttribute('data-v');
      }
      var aSrc = avatar || ('https://ui-avatars.com/api/?background=6c757d&color=fff&size=96&name=' + encodeURIComponent((name || '?').charAt(0)));
      if (ref.img.getAttribute('src') !== aSrc) ref.img.setAttribute('src', aSrc);
      ref.img.alt = name;
      ref.dot.setAttribute('data-s', status);
      if (fc) {
        var fSrc = 'https://flagcdn.com/w40/' + fc + '.png';
        if (ref.flag.getAttribute('src') !== fSrc) ref.flag.setAttribute('src', fSrc);
        ref.flag.setAttribute('data-v', '1');
        ref.flag.alt = fc.toUpperCase();
      } else {
        ref.flag.removeAttribute('data-v');
        ref.flag.alt = '';
        if (ref.flag.hasAttribute('src')) ref.flag.removeAttribute('src');
      }
      if (unread > 0) {
        ref.badge.style.display = '';
        ref.badge.textContent = unread > 99 ? '99+' : String(unread);
      } else {
        ref.badge.style.display = 'none';
        ref.badge.textContent = '';
      }
    },

    destroy: function () {
      if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = 0; }
      this._refreshQueued = false;
      if (this._resizer) { this._resizer.disconnect(); this._resizer = null; }
      if (this._resizeTimer) { clearTimeout(this._resizeTimer); this._resizeTimer = 0; }
      this._detachScroll();
      this.pool = [];
      this.used = 0;
      this.rS = -1;
      this.rE = -1;
      Menu.close();
    }
  };

  var Ctrl = {
    mounted: false,
    _uiReady: false,
    _themeObs: null,
    _viewportTimer: 0,
    _viewportBound: false,
    _onViewport: null,
    _lastViewH: 0,

    setReady: function (flag) {
      this._uiReady = !!flag;
      var root = byId('wkRootWrap');
      if (root) root.setAttribute('data-ready', this._uiReady ? '1' : '0');
    },

    isReady: function () { return !!this._uiReady; },

    mount: function () {
      var uid = myUid();
      if (!uid) return;
      injectCSS();
      applyItemHeight();
      Store.init(uid);
      VList.bind();
      VList.scheduleRefresh();
      Net.start();
      this._watchTheme();
      this._watchViewport();
      this.mounted = true;
    },

    openRoom: function (roomId) {
      roomId = String(roomId || '');
      if (!roomId) return;
      Store.activeTargetUid = roomId;
      var room = Store.byId[roomId] || null;
      if (room) {
        room.unread = 0;
        Store.markDirty();
        Store.save();
      }
      VList.scheduleRefresh();
      var peerKey = roomId;
      if (/^nbb_\d+$/.test(peerKey)) peerKey = nodeUidFromWkUid(peerKey);
      else if (room && room.users) {
        var other = Store.getOtherUser(room);
        if (other && other.uid) peerKey = String(other.uid);
      } else if (Store.roomToUid[roomId]) {
        peerKey = nodeUidFromWkUid(Store.roomToUid[roomId]);
      }
      var bootstrap = W.__WK_MESSAGES_BOOTSTRAP__ || {};
      var prefix = bootstrap.chatPathPrefix || '/messages/u/';
      location.href = prefix + encodeURIComponent(peerKey);
    },

    _watchTheme: function () {
      if (this._themeObs) return;
      this._themeObs = new MutationObserver(function (mutations) {
        for (var i = 0; i < mutations.length; i++) {
          var attr = mutations[i].attributeName;
          if (attr === 'data-bs-theme' || attr === 'class') { VList.scheduleRefresh(); break; }
        }
      });
      this._themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme', 'class'] });
      this._themeObs.observe(document.body, { attributes: true, attributeFilter: ['data-bs-theme', 'class'] });
    },

    _watchViewport: function () {
      if (this._viewportBound) return;
      this._viewportBound = true;
      this._lastViewH = W.innerHeight || 0;
      var self = this;
      this._onViewport = function () {
        if (self._viewportTimer) clearTimeout(self._viewportTimer);
        self._viewportTimer = setTimeout(function () {
          self._viewportTimer = 0;
          var newH = W.innerHeight || 0;
          var diff = Math.abs(newH - self._lastViewH);
          var widthChanged = applyItemHeight();
          self._lastViewH = newH;
          if (widthChanged || diff > 60) {
            VList.rS = -1;
            VList.rE = -1;
            VList.render(true);
          }
        }, 150);
      };
      W.addEventListener('resize', this._onViewport, { passive: true });
      W.addEventListener('orientationchange', this._onViewport, { passive: true });
    }
  };

  function bindStaticUI() {
    var refreshBtn = byId('wkRefreshBtn');
    if (refreshBtn && !refreshBtn.__wkBound) {
      refreshBtn.__wkBound = true;
      refreshBtn.addEventListener('click', function () {
        byId('wkMessagesSubtitle').textContent = '同步中…';
        Net.sync();
      });
    }
  }

  function boot() {
    bindStaticUI();
    Ctrl.mount();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Ctrl.mounted) {
      Net.ensureSocketBound();
      Net.debouncedSync(300);
    }
  });
  W.addEventListener('focus', function () {
    if (Ctrl.mounted) {
      Net.ensureSocketBound();
      Net.debouncedSync(300);
    }
  });

  W.WKChatList = {
    mount: function () { Ctrl.mount(); },
    sync: function () { Net.sync(); },
    openRoom: function (id) { Ctrl.openRoom(id); },
    pin: function (id) { Store.setPinned(id, true); VList.scheduleRefresh(); },
    unpin: function (id) { Store.setPinned(id, false); VList.scheduleRefresh(); },
    hide: function (id) { Store.setHidden(id, true); VList.scheduleRefresh(); },
    unhide: function (id) { Store.setHidden(id, false); VList.scheduleRefresh(); },
    remark: function (id, text) { Store.setRemark(id, text); VList.scheduleRefresh(); },
    clearRemark: function (id) { Store.clearRemark(id); VList.scheduleRefresh(); },
    hiddenList: function () { return Store.hiddenList(); },
    getMeta: function () { return JSON.parse(JSON.stringify(Store.meta)); },
    resetMeta: function () { Store.meta = { pinned: {}, hidden: {}, remarks: {} }; Store.markDirty(); Store.save(); VList.scheduleRefresh(); },
    store: Store,
    version: '19.2-standalone'
  };
})(window);
