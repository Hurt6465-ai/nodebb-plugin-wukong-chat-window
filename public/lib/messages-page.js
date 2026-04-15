(function (W) { 'use strict'; if (W.__wkStandaloneMessagesV1) return; W.__wkStandaloneMessagesV1 = true;

var ITEM_H = 84; var BUFFER = 4; var MAX_CONV = 200; var SYNC_PAGE = 120; var PROFILE_TTL = 12 * 36e5; var PROFILE_BATCH = 6; var POOL_MAX_EXCESS = 20; var LONG_PRESS_MS = 450; var REFRESH_MS = 15000; var DEBUG_WK = false;

var FLAGS = { '中国':'cn','cn':'cn','china':'cn','台湾':'tw','tw':'tw','taiwan':'tw', '香港':'hk','hk':'hk','澳门':'mo','mo':'mo','缅甸':'mm','mm':'mm','myanmar':'mm', '越南':'vn','vn':'vn','vietnam':'vn','日本':'jp','jp':'jp','japan':'jp', '韩国':'kr','kr':'kr','korea':'kr','美国':'us','us':'us','usa':'us', '英国':'gb','gb':'gb','uk':'gb','泰国':'th','th':'th','thailand':'th', '老挝':'la','la':'la','laos':'la','新加坡':'sg','sg':'sg','singapore':'sg', '马来西亚':'my','my':'my','malaysia':'my','菲律宾':'ph','ph':'ph','philippines':'ph', '印尼':'id','id':'id','indonesia':'id','柬埔寨':'kh','kh':'kh','cambodia':'kh', '印度':'in','in':'in','india':'in','俄罗斯':'ru','ru':'ru','russia':'ru', '德国':'de','de':'de','germany':'de','法国':'fr','fr':'fr','france':'fr', '巴西':'br','br':'br','brazil':'br','加拿大':'ca','ca':'ca','canada':'ca', '澳大利亚':'au','au':'au','australia':'au','土耳其':'tr','tr':'tr','turkey':'tr', '阿联酋':'ae','ae':'ae','uae':'ae','迪拜':'ae','沙特':'sa','sa':'sa', '埃及':'eg','eg':'eg','egypt':'eg','南非':'za','za':'za' };

var state = { bootstrap: null, token: null, mounted: false, refreshTimer: 0, profiles: {}, nodebbRooms: [], wkRooms: [], uiReady: false, socketBound: false, socketHandlers: {}, metaKey: '', rootSelector: '#wkMessagesRoot', };

function log() { if (!DEBUG_WK || !W.console) return; var a = ['[WK-MESSAGES]']; for (var i = 0; i < arguments.length; i++) a.push(arguments[i]); console.log.apply(console, a); }

function byId(id) { return document.getElementById(id); }

function esc(str) { return String(str || '') .replace(/&/g, '&') .replace(/</g, '<') .replace(/>/g, '>') .replace(/"/g, '"') .replace(/'/g, '''); }

function basePath() { return (W.config && W.config.relative_path) || ''; }

function isNumeric(v) { return /^\d+$/.test(String(v || '')); }

function wkUidFromKey(v) { v = String(v || '').trim(); return isNumeric(v) ? ('nbb_' + v) : v; }

function nodeUidFromWkUid(v) { v = String(v || ''); return /^nbb_\d+$/.test(v) ? v.slice(4) : v; }

function getRoot() { return document.querySelector(state.rootSelector); }

function getMetaStorageKey() { var uid = (state.bootstrap && state.bootstrap.user && state.bootstrap.user.uid) || 'guest'; return 'wk_messages_meta_' + uid; }

function getJSON(url, options) { return fetch(url, Object.assign({ credentials: 'same-origin' }, options || {})) .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url); return res.json(); }); }

function postJSON(url, body) { return fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}), }).then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url); return res.json(); }); }

function normalizeStatus(v) { v = String(v || '').toLowerCase(); if (!v) return 'offline'; if (v === '1' || v === 'true') return 'online'; if (v.indexOf('online') > -1 || v === 'connected' || v === 'active') return 'online'; if (v.indexOf('away') > -1 || v === 'idle') return 'away'; if (v.indexOf('dnd') > -1 || v.indexOf('busy') > -1) return 'dnd'; return 'offline'; }

function fmtTime(ts) { if (!ts) return ''; var n = String(ts).length < 13 ? Number(ts) * 1000 : Number(ts); var d = new Date(n); if (isNaN(d.getTime())) return '';

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

function teaserText(room) { var t = room && room.teaser; if (!t) return ''; var txt = String(t.content || '').replace(/<[^>]+>/g, ''); return txt.length > 50 ? txt.substring(0, 50) + '…' : txt; }

function wkMsgText(conv) { var msg = conv.last_message || (conv.recents && conv.recents[conv.recents.length - 1]); if (!msg) return { t: '', uid: '' };

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
if (/^图片|^!/.test(txt)) txt = '[图片]';
else if (/^视频/.test(txt)) txt = '[视频]';
else if (/^语音/.test(txt)) txt = '[语音]';
else if (/^\[文件/.test(txt)) txt = '[文件]';
else if (txt.length > 50) txt = txt.substring(0, 50) + '…';

return {
  t: txt || '[消息]',
  uid: String(msg.from_uid || msg.fromUid || msg.uid || '')
};

}

function userApiUrl(idOrSlug) { idOrSlug = String(idOrSlug || ''); if (!idOrSlug) return ''; return basePath() + ( isNumeric(idOrSlug) ? '/api/user/uid/' + encodeURIComponent(idOrSlug) : '/api/user/' + encodeURIComponent(idOrSlug) ); }

function flagCode(raw) { if (!raw) return ''; raw = String(raw).replace(/["[{}]/g, '').trim().toLowerCase(); if (!raw) return ''; if (FLAGS[raw]) return FLAGS[raw]; for (var k in FLAGS) { if (Object.prototype.hasOwnProperty.call(FLAGS, k) && raw.indexOf(k) > -1) return FLAGS[k]; } return /^[a-z]{2}$/.test(raw) ? raw : ''; }

function computeItemHeight() { var w = Math.max( W.innerWidth || 0, document.documentElement.clientWidth || 0, document.body ? document.body.clientWidth : 0 ); return w <= 420 ? 78 : w <= 768 ? 82 : 84; }

function applyItemHeight() { var h = computeItemHeight(); if (h === ITEM_H) return false; ITEM_H = h; var root = byId('wk-root'); if (root) root.style.setProperty('--wk-item-h', ITEM_H + 'px'); return true; }

var Store = { uid: '', rooms: [], byId: {}, profiles: {}, uidToRoom: {}, roomToUid: {}, source: 'nodebb', activeRoom: '', activeTargetUid: '', meta: { pinned: {}, deleted: {}, remarks: {} }, _dirty: true, _filtered: null, _saveTimer: 0, _savePending: false,

init: function (uid) {
  uid = String(uid || '');
  this.uid = uid;
  this.rooms = [];
  this.byId = {};
  this.profiles = {};
  this.uidToRoom = {};
  this.roomToUid = {};
  this.source = 'nodebb';
  this.activeRoom = '';
  this.activeTargetUid = '';
  this.meta = { pinned: {}, deleted: {}, remarks: {} };
  this._dirty = true;
  this._filtered = null;

  try {
    var raw = localStorage.getItem(getMetaStorageKey());
    if (raw) {
      var d = JSON.parse(raw);
      this.meta = d && d.meta ? d.meta : this.meta;
    }
  } catch (e) {}
},

saveMeta: function () {
  try {
    localStorage.setItem(getMetaStorageKey(), JSON.stringify({ meta: this.meta }));
  } catch (e) {}
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
      if (value) map[k] = value; else delete map[k];
    } else if (type === 'deleted') {
      if (value) map[k] = Number(value) || Date.now(); else delete map[k];
    } else {
      if (value) map[k] = 1; else delete map[k];
    }
  }
  this.markDirty();
  this.saveMeta();
},

markDirty: function () {
  this._dirty = true;
  this._filtered = null;
},

isPinned: function (roomOrId) {
  return !!this._metaGet('pinned', roomOrId);
},

getRemark: function (roomOrId) {
  return String(this._metaGet('remarks', roomOrId) || '');
},

getDeletedAt: function (roomOrId) {
  return Number(this._metaGet('deleted', roomOrId) || 0);
},

isDeleted: function (roomOrId) {
  return !!this.getDeletedAt(roomOrId);
},

setPinned: function (roomOrId, flag) {
  this._metaSet('pinned', roomOrId, !!flag);
},

setRemark: function (roomOrId, text) {
  text = String(text || '').trim().replace(/\s+/g, ' ');
  if (text.length > 30) text = text.slice(0, 30);
  this._metaSet('remarks', roomOrId, text);
},

clearRemark: function (roomOrId) {
  this._metaSet('remarks', roomOrId, '');
},

deleteConversation: function (roomOrId) {
  this._metaSet('deleted', roomOrId, Date.now());
},

restoreConversation: function (roomOrId) {
  this._metaSet('deleted', roomOrId, 0);
},

maybeRestoreDeletedOnActivity: function (roomOrId, ts) {
  var deletedAt = this.getDeletedAt(roomOrId);
  if (deletedAt && Number(ts || 0) > deletedAt) {
    this.restoreConversation(roomOrId);
  }
},

_rebuildIndex: function () {
  this.byId = {};
  for (var i = 0; i < this.rooms.length; i++) {
    var id = this._getRoomKey(this.rooms[i]);
    if (id) this.byId[id] = this.rooms[i];
  }
  this.markDirty();
},

getFiltered: function () {
  if (!this._dirty && this._filtered) return this._filtered;
  var pins = [];
  var rest = [];
  for (var i = 0; i < this.rooms.length; i++) {
    var room = this.rooms[i];
    var id = this._getRoomKey(room);
    if (this.isDeleted(id)) continue;
    if (this.isPinned(id)) pins.push(room); else rest.push(room);
  }
  this._filtered = pins.concat(rest);
  this._dirty = false;
  return this._filtered;
},

baseName: function (room) {
  if (!room) return '聊天';
  if (room.roomName) return room.roomName;
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
  return remark || this.baseName(room);
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

var Menu = { mask: null, head: null, list: null,

ensure: function () {
  if (this.mask) return;
  var mask = document.createElement('div');
  mask.className = 'wk-mm';
  mask.innerHTML = '<div class="wk-ms"><div class="wk-mh"></div><div class="wk-ml"></div></div>';
  document.body.appendChild(mask);
  this.mask = mask;
  this.head = mask.querySelector('.wk-mh');
  this.list = mask.querySelector('.wk-ml');
  var self = this;
  mask.addEventListener('click', function (e) {
    if (e.target === mask) self.close();
  });
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

  var room = Store.byId[id] ||
    (Store.uidToRoom[id] ? Store.byId[Store.uidToRoom[id]] : null) ||
    (Store.roomToUid[id] ? Store.byId[Store.roomToUid[id]] : null);
  var title = Store.getRemark(id) || (room ? Store.baseName(room) : ('会话 ' + id));
  var pinned = Store.isPinned(id);
  var remark = Store.getRemark(id);
  var self = this;

  this.head.textContent = title;
  this.list.innerHTML = '';

  this.list.appendChild(this._makeBtn(
    pinned ? '取消置顶' : '置顶会话',
    '',
    function () {
      Store.setPinned(id, !pinned);
      VList.scheduleRefresh();
      self.close();
    }
  ));

  this.list.appendChild(this._makeBtn(
    remark ? '修改备注' : '添加备注',
    '',
    function () {
      self.close();
      setTimeout(function () {
        var val = W.prompt('请输入备注（留空清除）', remark || '');
        if (val === null) return;
        val = String(val || '').trim();
        if (val) Store.setRemark(id, val);
        else Store.clearRemark(id);
        VList.scheduleRefresh();
      }, 30);
    }
  ));

  if (remark) {
    this.list.appendChild(this._makeBtn(
      '清除备注',
      '',
      function () {
        Store.clearRemark(id);
        VList.scheduleRefresh();
        self.close();
      }
    ));
  }

  this.list.appendChild(this._makeBtn(
    '删除会话',
    'wk-danger',
    function () {
      Store.deleteConversation(id);
      VList.scheduleRefresh();
      self.close();
    }
  ));

  this.list.appendChild(this._makeBtn(
    '取消',
    'wk-cancel',
    function () {
      self.close();
    }
  ));

  this.mask.style.display = 'block';
  requestAnimationFrame(function () {
    self.mask.setAttribute('data-v', '1');
  });
},

close: function () {
  if (!this.mask) return;
  this.mask.removeAttribute('data-v');
  var self = this;
  setTimeout(function () {
    if (self.mask) self.mask.style.display = 'none';
  }, 160);
}

};

var VList = { pool: [], used: 0, rS: -1, rE: -1, _scrollBound: false, _scroller: null, _onScroll: null, _resizer: null, _resizeTimer: 0, _rafId: 0, _refreshQueued: false,

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
  var clearTap = function () {
    clearTimeout(tapTimer);
    li.classList.remove('wk-tap');
  };
  li.addEventListener('touchend', clearTap, { passive: true });
  li.addEventListener('touchcancel', clearTap, { passive: true });

  var pressTimer = 0;
  var sx = 0, sy = 0;
  function clearPress() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = 0;
    }
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
      if (navigator.vibrate) {
        try { navigator.vibrate(10); } catch (err) {}
      }
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
    if (li._suppressClickUntil && Date.now() < li._suppressClickUntil) {
      e.preventDefault();
      return;
    }
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
        if (applyItemHeight()) {
          self.rS = -1;
          self.rE = -1;
        }
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
  var isNBB = Store.source === 'nodebb';
  var itemId, name, avatar, fc, status, timeStr, preview, unread, isActive, pinned;

  if (isNBB) {
    itemId = String(room.roomId || '');
    var other = Store.getOtherUser(room);
    var ouid = other ? String(other.uid) : '';
    var prof = Store.profiles[ouid];
    name = Store.displayName(room);
    avatar = (other && other.picture) || (prof && prof.picture) || '';
    fc = prof ? flagCode(prof.flag) : (other ? flagCode(other.language_flag || other.location) : '');
    status = normalizeStatus((prof && prof.status) || (other && other.status) || 'offline');
    preview = teaserText(room);
    var ts = room.teaser ? (room.teaser.timestamp || (room.teaser.timestampISO ? new Date(room.teaser.timestampISO).getTime() : 0)) : 0;
    timeStr = fmtTime(ts);
    unread = room.unread || 0;
    isActive = itemId === String(Store.activeRoom || '');
  } else {
    itemId = String(room.channel_id || room.uid || room.room_id || '');
    var key = String(room.channel_id || room.uid || '');
    var prof2 = Store.profiles[key] || {};
    name = Store.displayName(room);
    avatar = prof2.picture || '';
    fc = flagCode(prof2.flag);
    status = normalizeStatus(prof2.status || 'offline');
    var m = wkMsgText(room);
    preview = (m.uid === String(state.token && state.token.uid || '')) ? ('我: ' + m.t) : m.t;
    timeStr = fmtTime(room.timestamp);
    unread = room.unread || 0;
    isActive = itemId === String(Store.activeTargetUid || '');
  }

  pinned = Store.isPinned(itemId);
  name = name || '未命名会话';
  preview = preview || '暂无消息';
  timeStr = timeStr || '';
  status = status || 'offline';

  var hash = itemId + '\x01' + name + '\x01' + avatar + '\x01' + fc + '\x01' +
    status + '\x01' + timeStr + '\x01' + preview + '\x01' + unread +
    '\x01' + (isActive ? 1 : 0) + '\x01' + (pinned ? 1 : 0);
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
}

};

var Ctrl = { mount: function () { if (state.mounted) return; injectCSS(); ensureRootMarkup(); applyItemHeight(); VList.bind(); bindGlobal(); state.mounted = true; },

openRoom: function (roomId) {
  roomId = String(roomId || '');
  if (!roomId) return;

  if (Store.source === 'wukong') {
    var targetKey = roomId;
    Store.restoreConversation(targetKey);
    location.href = state.bootstrap.chat.chatPathPrefix + encodeURIComponent(nodeUidFromWkUid(targetKey) || targetKey);
    return;
  }

  var room = Store.byId[roomId];
  var other = room ? Store.getOtherUser(room) : null;
  var targetUid = other ? String(other.uid) : String(Store.roomToUid[roomId] || '');
  if (!targetUid) return;
  Store.restoreConversation(roomId);
  location.href = state.bootstrap.chat.chatPathPrefix + encodeURIComponent(targetUid);
}

};

function ensureRootMarkup() { var host = getRoot(); if (!host) return; if (byId('wk-root')) return; host.innerHTML = '<div id="wk-root">' + '<div class="wk-sc">' + '<div class="wk-ph"></div>' + '<ul class="wk-vl"></ul>' + '</div>' + '<div class="wk-em" style="display:none">暂无会话</div>' + '</div>'; }

function setSubtitle(text) { var el = byId('wkMessagesSubtitle'); if (el) el.textContent = text; }

function injectCSS() { if (byId('wk-standalone-messages-css')) return; var s = document.createElement('style'); s.id = 'wk-standalone-messages-css'; s.textContent = [ '#wk-root{', '  --wk-item-h:84px;', '  --bg:#fff;--bg2:#f3f4f6;--bg3:#e5e7eb;', '  --c1:#111827;--c2:#6b7280;--c3:#9ca3af;', '  --bd:#f3f4f6;--red:#ef4444;--green:#10b981;--yellow:#f59e0b;--gray:#d1d5db;', '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;', '  background:var(--bg);color:var(--c1);width:100%;height:calc(100vh - 180px);min-height:480px;', '  display:flex;flex-direction:column;position:relative;overflow:hidden;border-radius:16px;', '  -webkit-text-size-adjust:100%;', '}', '[data-bs-theme="dark"] #wk-root,html.dark #wk-root,body.dark #wk-root{', '  --bg:#1e1e2e;--bg2:#2a2a3c;--bg3:#363649;', '  --c1:#e4e4e7;--c2:#a1a1aa;--c3:#71717a;--bd:#2a2a3c;', '}', '#wk-root *,#wk-root *::before,#wk-root *::after{box-sizing:border-box}', '.wk-sc{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;position:relative;-webkit-overflow-scrolling:touch;overscroll-behavior-y:contain;scrollbar-width:thin;scrollbar-color:var(--bd) transparent;}', '.wk-sc::-webkit-scrollbar{width:4px}', '.wk-sc::-webkit-scrollbar-thumb{background:var(--bd);border-radius:2px}', '.wk-sc::-webkit-scrollbar-track{background:transparent}', '.wk-ph{width:100%;pointer-events:none}', '.wk-vl{position:absolute;left:0;right:0;top:0;margin:0;padding:0;list-style:none;will-change:transform;contain:layout style;}', '.wk-i{position:relative;height:var(--wk-item-h);display:flex;align-items:center;padding:0 14px;gap:14px;cursor:pointer;transition:background .12s;user-select:none;-webkit-tap-highlight-color:transparent;outline:none;contain:content;}', '.wk-i::after{content:"";position:absolute;left:84px;right:0;bottom:0;height:1px;background:var(--bd);}', '.wk-i:active,.wk-i.wk-tap{background:var(--bg3)}', '.wk-i[data-act="1"]{background:var(--bg2)}', '.wk-aw{position:relative;width:54px;height:54px;flex-shrink:0}', '.wk-av{width:100%;height:100%;border-radius:50%;object-fit:cover;background:var(--bg2);display:block}', '.wk-st{position:absolute;top:0;right:0;width:13px;height:13px;border-radius:50%;border:2px solid var(--bg);background:var(--gray);z-index:2;transition:background .3s}', '.wk-st[data-s="online"]{background:var(--green)}', '.wk-st[data-s="away"]{background:var(--yellow)}', '.wk-st[data-s="dnd"]{background:var(--red)}', '.wk-fl{position:absolute;bottom:-1px;left:-3px;width:20px;height:14px;border-radius:2px;border:1.5px solid var(--bg);z-index:2;object-fit:cover;display:none}', '.wk-fl[data-v="1"]{display:block}', '.wk-bd{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:4px}', '.wk-r1,.wk-r2{display:flex;align-items:center;justify-content:space-between}', '.wk-lt{display:flex;align-items:center;gap:4px;min-width:0;max-width:72%}', '.wk-pn{display:none;font-size:13px;line-height:1;flex-shrink:0}', '.wk-pn[data-v="1"]{display:inline-block}', '.wk-nm{font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--c1);line-height:1.25}', '.wk-tm{font-size:13px;color:var(--c3);flex-shrink:0;margin-left:8px;white-space:nowrap}', '.wk-pv{font-size:14px;color:var(--c2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;line-height:1.35}', '.wk-bg{background:var(--red);color:#fff;font-size:12px;font-weight:700;min-width:20px;height:20px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;padding:0 6px;flex-shrink:0;margin-left:8px}', '.wk-em{flex:1;display:flex;align-items:center;justify-content:center;color:var(--c3);font-size:15px;padding:36px 18px;text-align:center}', '.wk-mm{position:fixed;inset:0;background:rgba(0,0,0,.34);z-index:999999;display:none;opacity:0;transition:opacity .16s;}', '.wk-mm[data-v="1"]{display:block;opacity:1;}', '.wk-ms{position:absolute;left:12px;right:12px;bottom:10px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 10px 28px rgba(0,0,0,.18);transform:translateY(12px);transition:transform .16s;}', '.wk-mm[data-v="1"] .wk-ms{transform:translateY(0);}', '[data-bs-theme="dark"] .wk-ms,html.dark .wk-ms,body.dark .wk-ms{background:#232334;color:#e4e4e7;}', '.wk-mh{padding:14px 16px 10px;font-size:14px;font-weight:700;border-bottom:1px solid rgba(0,0,0,.06);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}', '[data-bs-theme="dark"] .wk-mh,html.dark .wk-mh,body.dark .wk-mh{border-bottom-color:rgba(255,255,255,.08);}', '.wk-ma{display:block;width:100%;padding:14px 16px;border:0;background:transparent;text-align:left;font-size:16px;line-height:1.2;color:inherit;}', '.wk-ma + .wk-ma{border-top:1px solid rgba(0,0,0,.06);}', '[data-bs-theme="dark"] .wk-ma + .wk-ma,html.dark .wk-ma + .wk-ma,body.dark .wk-ma + .wk-ma{border-top-color:rgba(255,255,255,.08);}', '.wk-ma:active{background:rgba(0,0,0,.05);}', '.wk-ma.wk-danger{color:#dc2626;}', '.wk-ma.wk-cancel{font-weight:700;}', '@media (max-width:768px){#wk-root{--wk-item-h:82px}.wk-i{padding:0 12px;gap:12px}.wk-i::after{left:76px}.wk-aw{width:50px;height:50px}.wk-nm{font-size:16px}.wk-lt{max-width:68%}.wk-tm{font-size:12px}}', '@media (max-width:420px){#wk-root{--wk-item-h:78px}.wk-i{padding:0 11px;gap:11px}.wk-i::after{left:71px}.wk-aw{width:48px;height:48px}.wk-nm{font-size:16px}.wk-lt{max-width:66%}.wk-pv{font-size:13px}.wk-tm{font-size:12px}.wk-bg{min-width:19px;height:19px;font-size:11px;padding:0 5px}}' ].join('\n'); document.head.appendChild(s); }

function mergeConversations() { var map = new Map(); var selfUid = String((state.bootstrap && state.bootstrap.user && state.bootstrap.user.uid) || '');

state.nodebbRooms.forEach(function (room) {
  var other = null;
  (room.users || []).forEach(function (u) {
    if (String(u.uid) !== selfUid && !other) other = u;
  });
  var nodeUid = other ? String(other.uid) : '';
  var wkUid = nodeUid ? ('nbb_' + nodeUid) : '';
  var item = {
    nodeUid: nodeUid,
    wkUid: wkUid,
    roomId: String(room.roomId || ''),
    name: (other && (other.displayname || other.username)) || room.usernames || '聊天',
    avatar: (other && other.picture) || '',
    preview: teaserText(room),
    time: room.teaser ? (room.teaser.timestamp || (room.teaser.timestampISO ? new Date(room.teaser.timestampISO).getTime() : 0)) : 0,
    unread: room.unread || 0,
    source: 'nodebb',
    users: room.users || []
  };
  var key = item.roomId || wkUid || nodeUid;
  if (key) map.set(key, item);
});

state.wkRooms.forEach(function (conv) {
  var wkUid = String(conv.channel_id || conv.uid || '');
  var nodeUid = nodeUidFromWkUid(wkUid);
  var roomId = String(conv.room_id || '');
  var key = roomId || wkUid || nodeUid;
  var existing = map.get(key) || {
    nodeUid: nodeUid,
    wkUid: wkUid,
    roomId: roomId,
    name: '聊天',
    avatar: '',
    preview: '',
    time: 0,
    unread: 0,
    source: 'wukong'
  };
  var m = wkMsgText(conv);
  existing.wkUid = wkUid || existing.wkUid;
  existing.nodeUid = existing.nodeUid || nodeUid;
  existing.roomId = existing.roomId || roomId;
  existing.preview = m.uid === String(state.token && state.token.uid || '') ? ('我: ' + m.t) : m.t;
  existing.time = Number(conv.timestamp || existing.time || 0);
  existing.unread = Number(conv.unread || existing.unread || 0);
  existing.source = 'wukong';
  existing.conv = conv;
  map.set(key, existing);
});

Store.rooms = Array.from(map.values());
for (var i = 0; i < Store.rooms.length; i++) {
  var item = Store.rooms[i];
  var roomKey = item.source === 'wukong' ? (item.wkUid || item.roomId) : (item.roomId || item.nodeUid);
  Store.maybeRestoreDeletedOnActivity(roomKey, item.time || 0);
}
Store._rebuildIndex();
return Store.getFiltered();

}

function ensureProfiles(items) { var tasks = []; items.forEach(function (item) { if (item.nodeUid && !state.profiles[item.nodeUid]) tasks.push(loadProfile(item.nodeUid)); else if (item.wkUid && !state.profiles[item.wkUid]) tasks.push(loadProfile(item.wkUid)); }); return Promise.all(tasks.slice(0, 12)); }

function loadProfile(key) { key = String(key || ''); if (!key || state.profiles[key]) return Promise.resolve(state.profiles[key] || null); return getJSON(userApiUrl(nodeUidFromWkUid(key))).then(function (raw) { var u = raw.user || raw.response || raw; var profile = { uid: String(u.uid || nodeUidFromWkUid(key) || ''), username: u.displayname || u.username || ('用户' + nodeUidFromWkUid(key)), picture: u.picture || '', status: normalizeStatus(u.status), flag: u.language_flag || u.location || '' }; state.profiles[key] = profile; if (profile.uid) state.profiles[profile.uid] = profile; if (profile.uid) state.profiles['nbb_' + profile.uid] = profile; Store.profiles = state.profiles; return profile; }).catch(function () { return null; }); }

function fetchNodeBBChats() { return getJSON(basePath() + '/api/v3/chats?perPage=' + SYNC_PAGE).then(function (json) { state.nodebbRooms = (((json || {}).response || {}).rooms) || []; }).catch(function () { state.nodebbRooms = []; }); }

function fetchWkConversations() { return postJSON(state.bootstrap.chat.conversationSyncPath, { version: 0, msg_count: 1 }).then(function (data) { var list = Array.isArray(data) ? data : (data.data || data.conversations || []); if (!Array.isArray(list)) list = []; state.wkRooms = list.filter(function (c) { return c && c.channel_type === 1; }); }).catch(function () { state.wkRooms = []; }); }

function renderList() { VList.scheduleRefresh(); var count = Store.getFiltered().length; setSubtitle('共 ' + count + ' 个会话'); }

function refresh(reason) { setSubtitle(reason === 'boot' ? '加载中…' : '同步中…'); return Promise.all([fetchNodeBBChats(), fetchWkConversations()]) .then(function () { var items = mergeConversations(); return ensureProfiles(items).then(function () { items = mergeConversations(); items.forEach(function (item) { var profile = state.profiles[item.wkUid] || state.profiles[item.nodeUid] || null; if (profile) { item.name = Store.getRemark(item) || item.name || profile.username || ('用户' + (item.nodeUid || item.wkUid)); item.avatar = item.avatar || profile.picture || ''; } else { item.name = Store.getRemark(item) || item.name; } }); renderList(); }); }) .catch(function (err) { setSubtitle('同步失败：' + (err && err.message ? err.message : '未知错误')); }); }

function bindGlobal() { if (state.uiReady) return; state.uiReady = true; W.addEventListener('beforeunload', function () { Store.saveMeta(); }); W.addEventListener('pagehide', function () { Store.saveMeta(); }); W.addEventListener('focus', function () { refresh('focus'); }); document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh('visible'); }); bindSocket(); startPolling(); }

function startPolling() { if (state.refreshTimer) clearInterval(state.refreshTimer); state.refreshTimer = setInterval(function () { if (!document.hidden) refresh('poll'); }, REFRESH_MS); }

function bindSocket() { if (state.socketBound || !W.socket) return; state.socketBound = true;

function onMessageLike(data) {
  tryPatchMessage(data) || refresh('socket');
}

state.socketHandlers['event:chats.receive'] = onMessageLike;
state.socketHandlers['chats.receive'] = onMessageLike;
state.socketHandlers['event:unread.updateChatCount'] = function () { refresh('socket'); };
state.socketHandlers['event:unread.updateUnreadCount'] = function () { refresh('socket'); };
state.socketHandlers['event:chats.mark'] = function () { refresh('socket'); };
state.socketHandlers['event:chats.delete'] = function () { refresh('socket'); };
state.socketHandlers['event:user_status_change'] = function (data) {
  var uid = String((data && data.uid) || '');
  var uname = data && data.username ? String(data.username) : '';
  var st = normalizeStatus(data && data.status);
  var changed = false;
  if (uid && state.profiles[uid]) { state.profiles[uid].status = st; changed = true; }
  if (uname && state.profiles[uname]) { state.profiles[uname].status = st; changed = true; }
  if (changed) renderList();
};

Object.keys(state.socketHandlers).forEach(function (ev) {
  W.socket.on(ev, state.socketHandlers[ev]);
});

}

function tryPatchMessage(data) { if (!data) return false; var roomId = String((data && (data.roomId || data.room_id)) || ''); var room = roomId ? Store.byId[roomId] : null; var msg = data.message || data.msg || data.data || {}; var fromUid = String(data.fromUid || data.uid || msg.fromuid || msg.fromUid || msg.from_uid || (msg.fromUser && msg.fromUser.uid) || '');

if (!room && data.channel_id) {
  var channelId = String(data.channel_id);
  room = Store.byId[channelId] || null;
}
if (!room) return false;

if (!room.teaser) room.teaser = {};
room.teaser.content = msg.content || msg.payload || data.content || room.teaser.content || '';
room.teaser.timestampISO = msg.timestampISO || new Date().toISOString();
room.teaser.timestamp = msg.timestamp || data.timestamp || Date.now();
room.teaser.user = msg.fromUser || { uid: fromUid };

if (room.channel_id || room.wkUid) {
  var targetKey = String(room.channel_id || room.wkUid || '');
  room.timestamp = msg.timestamp || data.timestamp || Math.floor(Date.now() / 1000);
  room.last_message = {
    payload: msg.content || msg.payload || data.content || (room.last_message && room.last_message.payload) || '',
    from_uid: fromUid
  };
  Store.maybeRestoreDeletedOnActivity(targetKey, room.timestamp);
} else {
  Store.maybeRestoreDeletedOnActivity(room.roomId, room.teaser.timestamp || Date.now());
}

var idx = Store.rooms.indexOf(room);
if (idx > 0) {
  Store.rooms.splice(idx, 1);
  Store.rooms.unshift(room);
}
Store.markDirty();
renderList();
return true;

}

function loadBootstrap() { return getJSON((W.WK_MESSAGES_BOOTSTRAP || {}).bootstrapPath || '/api/chat-app/bootstrap').then(function (data) { state.bootstrap = data; Store.init(String(data.user && data.user.uid || '')); return getJSON(data.chat.tokenPath); }).then(function (token) { state.token = token; }); }

function boot() { Ctrl.mount(); loadBootstrap().then(function () { return refresh('boot'); }).catch(function (err) { var host = getRoot(); if (host) host.innerHTML = '<div class="wk-em">会话列表初始化失败：' + esc(err && err.message ? err.message : '未知错误') + '</div>'; setSubtitle('初始化失败'); }); }

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot(); })(window);
