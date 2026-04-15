(function () {
  'use strict';

  if (window.__wkHarmonyStandaloneLoaded) return;
  window.__wkHarmonyStandaloneLoaded = true;

  var mountEl = document.getElementById('wkHarmonyBootstrap');
  if (!mountEl) return;

  var LS_PREFIX = 'cp_chat_harmony_' + location.pathname.replace(/[^\w]/g, '_');
  var KEY_CFG = LS_PREFIX + '_cfg';
  var KEY_BG = LS_PREFIX + '_bg';
  var KEY_SCROLL = LS_PREFIX + '_scroll';

  var LANG_LIST = [
    { n: '中文', f: '🇨🇳' },
    { n: 'English', f: '🇺🇸' },
    { n: 'မြန်မာစာ', f: '🇲🇲' },
    { n: '日本語', f: '🇯🇵' },
    { n: '한국어', f: '🇰🇷' },
    { n: 'ภาษาไทย', f: '🇹🇭' },
    { n: 'Tiếng Việt', f: '🇻🇳' },
    { n: 'Русский', f: '🇷🇺' }
  ];

  var ICON = {
    play: '<i class="fa fa-play"></i>',
    pause: '<i class="fa fa-pause"></i>',
    mic: '<i class="fa fa-microphone"></i>',
    send: '<i class="fa fa-arrow-up"></i>',
    photo: '<i class="fa fa-image"></i>',
    quote: '<i class="fa fa-reply"></i>',
    recall: '<i class="fa fa-undo"></i>',
    trans: '<i class="fa fa-language"></i>',
    camera: '<i class="fa fa-camera"></i>',
    album: '<i class="fa fa-picture-o"></i>',
    ai: '<span style="font-weight:900;font-size:13px;background:linear-gradient(45deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;color:transparent;">译</span>'
  };

  var waveHeights = [5, 8, 12, 16, 10, 7, 14, 9, 13, 6, 11, 15];
  var state = {
    bootstrap: null,
    token: null,
    sdk: null,
    wkReady: false,
    peerKey: String(mountEl.getAttribute('data-peer-key') || '').trim(),
    peerWkUid: '',
    peerNodeUid: '',
    peerProfile: null,
    messages: [],
    cfg: null,
    bg: null,
    scrollTop: 0,
    unreadCount: 0,
    lazyObserver: null,
    renderPending: false,
    contextMsg: null,
    quoteTarget: null,
    pickingLangFor: null,
    previewOpen: false,
    settingsOpen: false,
    audio: new Audio(),
    currentAudioEl: null,
    aiCache: {},
    aiCacheKeys: [],
    persistTimer: null,
    rec: { mediaRecorder: null, stream: null, mimeType: '', chunks: [], timer: null, sec: 0, paused: false, shouldSend: false },
  };

  function byId(id) { return document.getElementById(id); }
  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function escAttr(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return JSON.parse(JSON.stringify(fallback));
      var parsed = JSON.parse(raw);
      if (fallback && typeof fallback === 'object') {
        var out = JSON.parse(JSON.stringify(fallback));
        for (var k in parsed) out[k] = parsed[k];
        if (fallback.ai && parsed.ai) {
          out.ai = out.ai || {};
          for (var ak in parsed.ai) out.ai[ak] = parsed.ai[ak];
        }
        return out;
      }
      return parsed;
    } catch (e) {
      return JSON.parse(JSON.stringify(fallback));
    }
  }
  function saveJSON(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }
  function wkUidFromKey(v) {
    v = String(v || '').trim();
    return /^\d+$/.test(v) ? ('nbb_' + v) : v;
  }
  function nodeUidFromWkUid(v) {
    v = String(v || '');
    return /^nbb_\d+$/.test(v) ? v.slice(4) : v;
  }
  function formatTime(ts) {
    var d = new Date(Number(ts) || Date.now());
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function formatDateDivider(ts) {
    var d = new Date(ts || Date.now());
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    var msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var diff = Math.floor((today - msgDay) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function formatDuration(sec) {
    sec = Math.max(0, Math.floor(Number(sec) || 0));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function getFlag(langName) {
    for (var i = 0; i < LANG_LIST.length; i++) if (LANG_LIST[i].n === langName) return LANG_LIST[i].f;
    return '🌐';
  }
  function toast(text) {
    var node = document.createElement('div');
    node.className = 'cp-toast';
    node.textContent = text;
    document.body.appendChild(node);
    requestAnimationFrame(function () { node.classList.add('show'); });
    setTimeout(function () {
      node.classList.remove('show');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
    }, 1700);
  }
  async function getJSON(url, options) {
    var res = await fetch(url, Object.assign({ credentials: 'same-origin' }, options || {}));
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return await res.json();
  }
  async function postJSON(url, body) {
    var res = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return await res.json();
  }
  function getAvatarHtml(uid, username, picture) {
    if (picture) return '<img class="avatar" src="' + escAttr(picture) + '" style="width:100%;height:100%;border-radius:40%;object-fit:cover;" />';
    var text = String(username || '?').charAt(0).toUpperCase();
    return '<div class="avatar" style="background:#72a5f2;color:#fff;display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:40%;font-size:16px;">' + esc(text) + '</div>';
  }
  function updateHeaderPeerInfo() {
    var info = byId('cp-peer-info');
    if (!info) return;
    var p = state.peerProfile || {};
    var name = p.displayname || p.username || state.peerNodeUid || state.peerWkUid || '聊天';
    var userslug = p.userslug || encodeURIComponent(String(name).toLowerCase().replace(/ /g, '-'));
    info.innerHTML = '<a href="/user/' + escAttr(userslug) + '/topics">' + esc(name) + '</a>';
  }
  function makeClientMsgNo() {
    return 'cp_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
  }
  function createMessageObj(text, isMine, uid, payload, rawMessage) {
    var myUser = state.bootstrap && state.bootstrap.user ? state.bootstrap.user : {};
    var p = state.peerProfile || {};
    var username = isMine ? (myUser.username || '我') : (p.displayname || p.username || state.peerNodeUid || state.peerWkUid || '对方');
    var userslug = isMine ? (myUser.userslug || '') : (p.userslug || '');
    var picture = isMine ? (myUser.picture || '') : (p.picture || '');
    var obj = {
      id: String((rawMessage && (rawMessage.message_id || rawMessage.messageID || rawMessage.client_msg_no || rawMessage.clientMsgNo)) || ('local_' + Date.now() + '_' + Math.floor(Math.random() * 10000))),
      clientMsgNo: String((rawMessage && (rawMessage.clientMsgNo || rawMessage.client_msg_no)) || (payload && payload.client_msg_no) || ''),
      seq: Number((rawMessage && (rawMessage.message_seq || rawMessage.messageSeq)) || 0),
      mine: !!isMine,
      ts: Number((rawMessage && rawMessage.timestamp ? rawMessage.timestamp * 1000 : 0) || Date.now()),
      username: username,
      userslug: userslug,
      uid: String(uid || ''),
      avatarHtml: getAvatarHtml(uid, username, picture),
      type: 'text',
      text: text || '',
      html: esc(text || ''),
      quote: payload && payload.quote ? String(payload.quote) : '',
      quoteUser: payload && payload.quoteUser ? String(payload.quoteUser) : '',
      recalled: false,
      mediaUrl: '',
      audioUrl: '',
      durationStr: '',
      translation: '',
      translationOpen: false,
      sendState: rawMessage ? 'sent' : 'sending',
      raw: rawMessage || null,
    };

    var match;
    if ((match = String(text).match(/^!\[\]\((.+?)\)$/)) || (match = String(text).match(/^\[图片\]\((.+?)\)$/))) {
      obj.type = 'image';
      obj.mediaUrl = match[1];
      obj.text = '[图片]';
      obj.html = '';
    } else if ((match = String(text).match(/^\[视频\]\((.+?)\)$/))) {
      obj.type = 'video';
      obj.mediaUrl = match[1];
      obj.text = '[视频]';
      obj.html = '';
    } else if ((match = String(text).match(/^\[语音消息\]\((.+?)\)$/))) {
      obj.type = 'voice';
      obj.audioUrl = match[1];
      obj.text = '[语音]';
      obj.html = '';
      if (payload && payload.duration) obj.durationStr = formatDuration(payload.duration);
    }
    return obj;
  }
  function extractPayload(m) {
    try {
      if (m.payload) {
        if (typeof m.payload === 'string') {
          var s = m.payload.trim();
          if (s[0] === '{' || s[0] === '[') return JSON.parse(s);
        } else if (typeof m.payload === 'object') {
          return m.payload;
        }
      }
      if (m.content && typeof m.content === 'object') return m.content;
      if (m.content && typeof m.content === 'string') {
        var c = m.content.trim();
        if (c[0] === '{' || c[0] === '[') return JSON.parse(c);
      }
    } catch (e) {}
    return {};
  }
  function addOrMergeMessage(msg) {
    var i;
    for (i = 0; i < state.messages.length; i++) {
      var cur = state.messages[i];
      if (cur.id === msg.id || (msg.clientMsgNo && cur.clientMsgNo && cur.clientMsgNo === msg.clientMsgNo)) {
        state.messages[i] = Object.assign({}, cur, msg, { sendState: 'sent' });
        return state.messages[i];
      }
    }
    state.messages.push(msg);
    state.messages.sort(function (a, b) { return Number(a.ts || 0) - Number(b.ts || 0); });
    return msg;
  }
  function schedulePersist() {
    if (state.persistTimer) clearTimeout(state.persistTimer);
    state.persistTimer = setTimeout(function () {
      state.persistTimer = null;
      saveJSON(KEY_SCROLL, { scrollTop: byId('cp-main') ? byId('cp-main').scrollTop : 0, messages: state.messages.slice(-120) });
    }, 1200);
  }
  function restoreLocalCache() {
    var cached = loadJSON(KEY_SCROLL, { scrollTop: 0, messages: [] });
    if (cached && Array.isArray(cached.messages) && cached.messages.length) {
      state.messages = cached.messages;
    }
    state.scrollTop = Number((cached && cached.scrollTop) || 0);
  }
  async function loadPeerProfile() {
    if (!state.peerNodeUid) return;
    try {
      var raw = await getJSON('/api/user/uid/' + encodeURIComponent(state.peerNodeUid));
      state.peerProfile = raw.user || raw.response || raw;
      updateHeaderPeerInfo();
    } catch (e) {}
  }
  async function loadSdk(url) {
    if (window.wk && window.wk.WKSDK) return;
    await new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  async function connectSdk() {
    if (state.wkReady) return;
    await loadSdk(state.bootstrap.chat.sdkCdnUrl);
    var sdk = window.wk.WKSDK.shared();
    sdk.config.uid = state.token.uid;
    sdk.config.token = state.token.token;
    var protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    sdk.config.addr = protocol + window.location.host + state.bootstrap.chat.wsPath;

    sdk.chatManager.addMessageListener(function (message) {
      if (!message) return;
      var payload = extractPayload(message) || {};
      if (message.contentType === 1006 || payload.type === 1006) {
        var revokeId = payload.client_msg_no || payload.message_id || payload.clientMsgNo;
        for (var i = 0; i < state.messages.length; i++) {
          var m = state.messages[i];
          if (m.id === revokeId || (m.clientMsgNo && m.clientMsgNo === revokeId)) {
            m.recalled = true;
            m.text = '此消息已被撤回';
            m.html = '';
          }
        }
        render('keep');
        return;
      }
      var fromUid = String(message.fromUID || message.from_uid || '');
      if (fromUid !== state.peerWkUid && fromUid !== state.token.uid) return;
      var text = payload.text || payload.content || '[消息]';
      if (fromUid === state.token.uid && payload.originalText) text = payload.originalText;
      var msg = createMessageObj(text, fromUid === state.token.uid, fromUid, payload, message);
      addOrMergeMessage(msg);
      if (fromUid === state.peerWkUid) {
        var main = byId('cp-main');
        var nearBottom = main ? (main.scrollHeight - main.scrollTop - main.clientHeight < 120) : true;
        if (!nearBottom) state.unreadCount += 1;
      }
      schedulePersist();
      render('bottom');
    });

    if (sdk.connectionManager && typeof sdk.connectionManager.connect === 'function') {
      await sdk.connectionManager.connect();
    } else if (sdk.connectManager && typeof sdk.connectManager.connect === 'function') {
      await sdk.connectManager.connect();
    }
    state.sdk = sdk;
    state.wkReady = true;
  }
  async function loadHistory() {
    var data = await getJSON(state.bootstrap.chat.historyPath + '?channel_id=' + encodeURIComponent(state.peerWkUid) + '&limit=40');
    var list = (((data || {}).data || {}).messages) || data.messages || data.data || data || [];
    if (!Array.isArray(list)) list = [];
    list.forEach(function (message) {
      var payload = extractPayload(message);
      var text = payload.text || payload.content || '[历史消息]';
      var fromUid = String(message.from_uid || message.fromUID || '');
      if (fromUid === state.token.uid && payload.originalText) text = payload.originalText;
      var msg = createMessageObj(text, fromUid === state.token.uid, fromUid, payload, message);
      msg.sendState = 'sent';
      addOrMergeMessage(msg);
    });
    schedulePersist();
    render(state.messages.length ? 'restore' : 'bottom');
  }
  function render(mode) {
    if (state.renderPending) return;
    state.renderPending = true;
    requestAnimationFrame(function () {
      state.renderPending = false;
      doRender(mode || 'keep');
    });
  }
  function doRender(mode) {
    var list = byId('cp-msg-list');
    var main = byId('cp-main');
    if (!list || !main) return;

    var oldTop = main.scrollTop;
    var oldHeight = main.scrollHeight;
    var nearBottom = (oldHeight - oldTop - main.clientHeight) < 80;
    var arr = state.messages.slice();

    var html = '';
    var prevDay = '';
    var lastPeerTextId = '';
    for (var p = arr.length - 1; p >= 0; p--) {
      if (!arr[p].mine && !arr[p].recalled && arr[p].type === 'text') { lastPeerTextId = arr[p].id; break; }
    }

    for (var i = 0; i < arr.length; i++) {
      var m = arr[i];
      var day = formatDateDivider(m.ts);
      if (day !== prevDay) {
        html += '<div class="cp-time-sep"><span>' + esc(day) + '</span></div>';
        prevDay = day;
      }
      var isLastInGroup = true;
      if (i < arr.length - 1) {
        var next = arr[i + 1];
        var a = m.mine ? state.token.uid : m.uid;
        var b = next.mine ? state.token.uid : next.uid;
        if (a === b && (next.ts - m.ts) < 180000) isLastInGroup = false;
      }
      var isMediaType = (m.type === 'image' || m.type === 'video');
      var rowClass = 'cp-row ' + (m.mine ? 'mine' : 'other') + (isLastInGroup ? ' is-last' : '') + (!m.recalled && isLastInGroup && !isMediaType ? ' has-tail' : '');
      var bubbleClass = 'cp-bubble' + (m.recalled ? ' recalled' : '') + (isMediaType ? ' media-shell' : '');
      var avatar = m.mine ? '' : '<a href="/user/' + escAttr(m.userslug || '') + '/topics" class="cp-avatar-wrap">' + (m.avatarHtml || '') + '</a>';
      var timeStr = formatTime(m.ts);
      var quick = m.id === lastPeerTextId ? '<button class="cp-quick-trans" data-act="quick-translate" data-id="' + escAttr(m.id) + '">' + ICON.ai + '</button>' : '';
      var quote = '';
      if (m.quote) {
        quote = '<div class="cp-quote-card"><div class="cp-quote-bar"></div><div class="cp-quote-body"><div class="cp-quote-name">' + esc(m.quoteUser || '消息') + '</div><div class="cp-quote-text">' + esc(m.quote) + '</div></div></div>';
      }
      var inlineTime = '<span class="cp-inline-time">' + esc(timeStr) + '</span>';
      var trans = (m.translation && m.translationOpen) ? '<div class="cp-translation-wrap"><div class="cp-translation-text">✨ ' + esc(m.translation) + '</div></div>' : '';
      var sendState = m.mine && m.sendState === 'sending' ? '<span class="cp-inline-send">发送中</span>' : (m.mine && m.sendState === 'failed' ? '<span class="cp-inline-send fail">失败</span>' : '');
      var body = '';
      if (m.recalled) {
        body = '<div class="cp-text">此消息已被撤回</div>';
      } else if (m.type === 'voice') {
        body = '<button class="cp-voice" data-act="play-voice" data-audio-src="' + escAttr(m.audioUrl || '') + '"><span class="cp-play-circle">' + ICON.play + '</span><span class="cp-wave">' + waveHeights.map(function (h) { return '<i style="height:' + h + 'px"></i>'; }).join('') + '</span><div class="cp-voice-info-col"><span class="cp-voice-dur">' + esc(m.durationStr || '--:--') + '</span><span class="cp-voice-time">' + esc(timeStr) + '</span></div></button>';
      } else if (m.type === 'image') {
        body = '<button class="cp-media-thumb" data-act="preview-media" data-type="image" data-src="' + escAttr(m.mediaUrl || '') + '"><img src="' + escAttr(m.mediaUrl || '') + '" loading="lazy" /></button><span class="cp-media-time">' + esc(timeStr) + '</span>';
      } else if (m.type === 'video') {
        body = '<button class="cp-media-thumb cp-video-wrap" data-act="preview-media" data-type="video" data-src="' + escAttr(m.mediaUrl || '') + '"><video preload="metadata" playsinline muted src="' + escAttr(m.mediaUrl || '') + '#t=0.001"></video><span class="cp-video-mark">视频</span></button><span class="cp-media-time">' + esc(timeStr) + '</span>';
      } else {
        body = quote + '<div class="cp-text">' + (m.html || esc(m.text || '')) + sendState + inlineTime + '</div>' + trans;
      }
      html += '<div class="' + rowClass + '" data-id="' + escAttr(m.id) + '">' + avatar + '<div class="cp-bubble-wrap"><div class="' + bubbleClass + '" data-act="show-menu">' + body + '</div>' + quick + '</div></div>';
    }

    list.innerHTML = html;
    updateUnreadBadge();

    if (mode === 'bottom') {
      if (nearBottom) main.scrollTop = main.scrollHeight;
      else main.scrollTop = oldTop;
    } else if (mode === 'restore') {
      main.scrollTop = state.scrollTop || main.scrollHeight;
    } else {
      main.scrollTop = oldTop;
    }
  }
  function showQuoteBar(msg) {
    state.quoteTarget = msg;
    byId('cp-quote-preview-name').textContent = msg.username || '未知';
    byId('cp-quote-preview-text').textContent = msg.text || msg.html || '';
    byId('cp-quote-preview').hidden = false;
    byId('cp-input').focus();
  }
  function hideQuoteBar() {
    state.quoteTarget = null;
    byId('cp-quote-preview').hidden = true;
  }
  function updatePrimaryButton() {
    var hasText = String(byId('cp-input').value || '').trim().length > 0;
    var btn = byId('cp-primary-btn');
    var icon = byId('cp-primary-icon');
    if (hasText) {
      btn.classList.add('send');
      icon.innerHTML = ICON.send;
    } else {
      btn.classList.remove('send');
      icon.innerHTML = ICON.mic;
    }
  }
  function updateUnreadBadge() {
    var badge = byId('cp-fab-badge');
    var fab = byId('cp-fab-bottom');
    if (!badge || !fab) return;
    badge.hidden = !(state.unreadCount > 0);
    if (state.unreadCount > 0) badge.textContent = state.unreadCount > 99 ? '99+' : String(state.unreadCount);
    fab.classList.toggle('show', state.unreadCount > 0 || ((byId('cp-main').scrollHeight - byId('cp-main').scrollTop - byId('cp-main').clientHeight) > 200));
  }
  async function sendText(text, originalText) {
    if (!state.wkReady || !state.sdk) {
      toast('消息通道尚未就绪');
      return;
    }
    var channel = new window.wk.Channel(state.peerWkUid, 1);
    var clientMsgNo = makeClientMsgNo();
    var payload = { text: text, originalText: originalText || '', client_msg_no: clientMsgNo };
    if (state.quoteTarget) {
      payload.quote = state.quoteTarget.text || '';
      payload.quoteUser = state.quoteTarget.username || '';
    }
    var content = new window.wk.MessageText(text);
    var originalEncode = content.encode ? content.encode.bind(content) : null;
    content.encode = function () {
      var base = originalEncode ? originalEncode() : {};
      if (typeof base === 'string') {
        try { base = JSON.parse(base); } catch (e) { base = {}; }
      }
      base.text = text;
      if (originalText) base.originalText = originalText;
      if (payload.quote) {
        base.quote = payload.quote;
        base.quoteUser = payload.quoteUser;
      }
      base.client_msg_no = clientMsgNo;
      return JSON.stringify(base);
    };
    var local = createMessageObj(originalText || text, true, state.token.uid, payload, null);
    local.clientMsgNo = clientMsgNo;
    local.id = 'local_' + clientMsgNo;
    local.sendState = 'sending';
    addOrMergeMessage(local);
    render('bottom');
    schedulePersist();
    try {
      await state.sdk.chatManager.send(content, channel);
      var input = byId('cp-input');
      input.value = '';
      input.style.height = '36px';
      updatePrimaryButton();
      hideQuoteBar();
    } catch (err) {
      local.sendState = 'failed';
      render('keep');
      toast('发送失败：' + err.message);
    }
  }
  async function fetchAITranslationOnly(text, from, to, ai) {
    var prompt = '把下面文本从' + from + '翻译成' + to + '，只返回译文，不要解释。文本: ' + text;
    return rawAIRequest(prompt, ai);
  }
  async function fetchAISmartReplies(text, peerLang, myLang, ai) {
    var prompt = '你是一个聊天助手。对方(' + peerLang + ')发来消息：\'' + text + '\'。\n任务1：将其翻译为' + myLang + '。\n任务2：站在我的角度，生成3到4个简短的回复气囊，风格各异。\n必须严格返回 JSON 字符串，不要 Markdown。格式：{"translation":"...","replies":[{"src":"' + myLang + '","tgt":"' + peerLang + '"}]}';
    var raw = await rawAIRequest(prompt, ai);
    try {
      raw = String(raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');
      var parsed = JSON.parse(raw);
      return { translation: parsed.translation || '', replies: Array.isArray(parsed.replies) ? parsed.replies : [] };
    } catch (e) {
      return { translation: String(raw || '').trim(), replies: [] };
    }
  }
  async function rawAIRequest(prompt, ai) {
    var endpoint = String((ai && ai.endpoint) || '').trim();
    var apiKey = String((ai && ai.apiKey) || '').trim();
    var model = String((ai && ai.model) || 'gpt-4o-mini').trim();
    if (!endpoint || !apiKey) throw new Error('请先在设置里填写 AI 接口');
    var res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({ model: model, temperature: 0.3, messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error('AI接口错误');
    var data = await res.json();
    return (((data || {}).choices || [])[0] || {}).message ? ((((data || {}).choices || [])[0] || {}).message.content || '').trim() : '';
  }
  function addToAiCache(key, val) {
    state.aiCache[key] = val;
    state.aiCacheKeys.push(key);
    if (state.aiCacheKeys.length > 50) {
      var old = state.aiCacheKeys.shift();
      delete state.aiCache[old];
    }
  }
  function renderSmartReplies(replies) {
    var bar = byId('cp-smart-replies-bar');
    var html = '';
    (replies || []).slice(0, 4).forEach(function (item) {
      if (!item || !item.src || !item.tgt) return;
      html += '<button class="cp-sr-pill" data-src="' + escAttr(item.src) + '" data-tgt="' + escAttr(item.tgt) + '">' + esc(item.src) + '</button>';
    });
    bar.innerHTML = html;
    bar.hidden = !html;
  }
  async function executeAIAnalysis(msg) {
    if (!msg || msg.mine || msg.recalled || msg.type !== 'text') return;
    if (msg.translation && msg.translation !== '分析中...') {
      msg.translationOpen = !msg.translationOpen;
      render('keep');
      return;
    }
    var cacheKey = [msg.text, state.cfg.sourceLang, state.cfg.targetLang, state.cfg.smartReplyEnabled ? '1' : '0'].join('|');
    if (state.aiCache[cacheKey]) {
      msg.translation = state.aiCache[cacheKey].translation;
      msg.translationOpen = true;
      if (state.cfg.smartReplyEnabled && state.aiCache[cacheKey].replies) renderSmartReplies(state.aiCache[cacheKey].replies);
      render('keep');
      return;
    }
    msg.translation = '分析中...';
    msg.translationOpen = true;
    render('keep');
    try {
      if (!state.cfg.smartReplyEnabled) {
        msg.translation = await fetchAITranslationOnly(msg.text, state.cfg.targetLang, state.cfg.sourceLang, state.cfg.ai);
        addToAiCache(cacheKey, { translation: msg.translation });
      } else {
        var json = await fetchAISmartReplies(msg.text, state.cfg.targetLang, state.cfg.sourceLang, state.cfg.ai);
        msg.translation = json.translation || '翻译完成';
        addToAiCache(cacheKey, { translation: msg.translation, replies: json.replies || [] });
        renderSmartReplies(json.replies || []);
      }
    } catch (err) {
      msg.translation = err.message || 'AI 请求失败';
    }
    render('keep');
  }
  async function sendByPolicy(text) {
    if (!state.cfg.sendTranslateEnabled) return sendText(text, null);
    var btn = byId('cp-primary-btn');
    var icon = byId('cp-primary-icon');
    btn.disabled = true;
    icon.innerHTML = '<i class="fa fa-spinner fa-spin"></i>';
    try {
      var translated = await fetchAITranslationOnly(text, state.cfg.sourceLang, state.cfg.targetLang, state.cfg.ai);
      await sendText(translated || text, translated ? text : null);
    } catch (err) {
      toast('翻译失败，直接发送原文');
      await sendText(text, null);
    } finally {
      btn.disabled = false;
      updatePrimaryButton();
    }
  }
  function handlePrimaryAction() {
    var text = String(byId('cp-input').value || '').trim();
    if (text) return sendByPolicy(text);
    if (!state.rec.mediaRecorder || state.rec.mediaRecorder.state === 'inactive') startRecording();
    else stopRecording(true);
  }
  function getSupportedMimeType() {
    if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') return '';
    var types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (var i = 0; i < types.length; i++) if (MediaRecorder.isTypeSupported(types[i])) return types[i];
    return '';
  }
  function toggleUIForRecording(on) {
    byId('cp-toolbar-inputs').hidden = on;
    byId('cp-rec-inline').hidden = !on;
  }
  async function uploadToNodeBB(file, onProgress) {
    return new Promise(function (resolve, reject) {
      var fd = new FormData();
      fd.append('files[]', file, file.name || ('cp_' + Date.now()));
      var xhr = new XMLHttpRequest();
      xhr.open('POST', ((window.config && config.relative_path) || '') + '/api/post/upload');
      xhr.withCredentials = true;
      if (window.config && config.csrf_token) xhr.setRequestHeader('x-csrf-token', config.csrf_token);
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) return reject(new Error('upload failed'));
        try {
          var json = JSON.parse(xhr.responseText || '{}');
          var url = (((json || {}).response || {}).images || [])[0] ? ((((json || {}).response || {}).images || [])[0].url || '') : '';
          if (!url && json.files && json.files[0]) url = json.files[0].url || json.files[0].path || '';
          if (url && !/^https?:\/\//i.test(url) && url.charAt(0) !== '/') url = '/' + url;
          resolve(url || '');
        } catch (e) { reject(e); }
      };
      xhr.onerror = function () { reject(new Error('network error')); };
      xhr.send(fd);
    });
  }
  async function onPickMedia(e) {
    var files = Array.prototype.slice.call((e.target && e.target.files) || []);
    e.target.value = '';
    if (!files.length) return;
    var wrap = byId('cp-upload-progress-wrap');
    var bar = byId('cp-upload-progress-bar');
    try {
      for (var i = 0; i < files.length; i++) {
        if (wrap) wrap.hidden = false;
        if (bar) bar.style.width = '0%';
        var url = await uploadToNodeBB(files[i], function (pct) { if (bar) bar.style.width = (pct * 100) + '%'; });
        if (!url) continue;
        if ((files[i].type || '').indexOf('image/') === 0) await sendText('![](' + url + ')');
        else if ((files[i].type || '').indexOf('video/') === 0) await sendText('[视频](' + url + ')');
        else await sendText('[文件](' + url + ')');
      }
    } catch (err) {
      toast('上传失败');
    } finally {
      if (wrap) wrap.hidden = true;
      if (bar) bar.style.width = '0%';
    }
  }
  async function startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('当前浏览器不支持录音');
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.rec.stream = stream;
      state.rec.chunks = [];
      state.rec.sec = 0;
      state.rec.paused = false;
      state.rec.shouldSend = false;
      state.rec.mimeType = getSupportedMimeType();
      state.rec.mediaRecorder = new MediaRecorder(stream, state.rec.mimeType ? { mimeType: state.rec.mimeType } : undefined);
      state.rec.mediaRecorder.ondataavailable = function (ev) { if (ev.data && ev.data.size > 0) state.rec.chunks.push(ev.data); };
      state.rec.mediaRecorder.onstop = async function () {
        if (state.rec.stream) {
          state.rec.stream.getTracks().forEach(function (t) { t.stop(); });
          state.rec.stream = null;
        }
        clearInterval(state.rec.timer);
        toggleUIForRecording(false);
        updatePrimaryButton();
        if (state.rec.shouldSend && state.rec.chunks.length) {
          var wrap = byId('cp-upload-progress-wrap');
          var bar = byId('cp-upload-progress-bar');
          try {
            var mime = (state.rec.mediaRecorder && state.rec.mediaRecorder.mimeType) || state.rec.mimeType || 'audio/webm';
            var ext = mime.indexOf('mp4') > -1 ? 'm4a' : 'webm';
            var blob = new Blob(state.rec.chunks, { type: mime });
            var file = new File([blob], 'voice_' + Date.now() + '.' + ext, { type: mime });
            if (wrap) wrap.hidden = false;
            if (bar) bar.style.width = '0%';
            var url = await uploadToNodeBB(file, function (pct) { if (bar) bar.style.width = (pct * 100) + '%'; });
            if (url) await sendText('[语音消息](' + url + ')');
          } catch (err) {
            toast('语音发送失败');
          } finally {
            if (wrap) wrap.hidden = true;
            if (bar) bar.style.width = '0%';
          }
        }
      };
      toggleUIForRecording(true);
      var pauseIcon = byId('cp-rec-pause').querySelector('i');
      if (pauseIcon) pauseIcon.className = 'fa fa-pause-circle';
      byId('cp-rec-time').textContent = '0:00';
      state.rec.mediaRecorder.start(120);
      state.rec.timer = setInterval(function () {
        if (state.rec.paused) return;
        state.rec.sec += 1;
        byId('cp-rec-time').textContent = formatDuration(state.rec.sec);
        if (state.rec.sec >= (state.cfg.voiceMaxDuration || 60)) stopRecording(true);
      }, 1000);
    } catch (err) {
      toast('录音不可用或被拒绝');
    }
  }
  function stopRecording(send) {
    if (!state.rec.mediaRecorder || state.rec.mediaRecorder.state === 'inactive') return;
    state.rec.shouldSend = !!send;
    try { state.rec.mediaRecorder.stop(); } catch (e) {}
  }
  function togglePauseRecording() {
    var mr = state.rec.mediaRecorder;
    var icon = byId('cp-rec-pause').querySelector('i');
    if (!mr) return;
    if (mr.state === 'recording') {
      mr.pause();
      state.rec.paused = true;
      if (icon) icon.className = 'fa fa-play-circle';
    } else if (mr.state === 'paused') {
      mr.resume();
      state.rec.paused = false;
      if (icon) icon.className = 'fa fa-pause-circle';
    }
  }
  function applyBackground() {
    var bgEl = byId('cp-bg');
    var mask = byId('cp-bg-mask');
    if (!bgEl || !mask) return;
    if (state.bg && state.bg.dataUrl) {
      bgEl.style.backgroundImage = 'url("' + state.bg.dataUrl + '")';
      document.body.classList.add('cp-has-bg');
    } else {
      bgEl.style.backgroundImage = 'none';
      document.body.classList.remove('cp-has-bg');
    }
    mask.style.setProperty('--bg-op', String((state.bg && state.bg.opacity != null) ? state.bg.opacity : 0.85));
  }
  function syncTranslateBar() {
    byId('cp-src-lang-btn').innerHTML = getFlag(state.cfg.sourceLang) + ' ' + esc(state.cfg.sourceLang);
    byId('cp-tgt-lang-btn').innerHTML = getFlag(state.cfg.targetLang) + ' ' + esc(state.cfg.targetLang);
    byId('cp-send-translate-toggle').classList.toggle('active', !!state.cfg.sendTranslateEnabled);
  }
  function syncSettingsUI() {
    byId('cp-ai-endpoint').value = state.cfg.ai.endpoint || '';
    byId('cp-ai-key').value = state.cfg.ai.apiKey || '';
    byId('cp-ai-model').value = state.cfg.ai.model || 'gpt-4o-mini';
    byId('cp-sr-setting').checked = !!state.cfg.smartReplyEnabled;
    byId('cp-auto-trans-setting').checked = !!state.cfg.autoTranslateLastMsg;
    var op = state.bg && state.bg.opacity != null ? state.bg.opacity : 0.85;
    byId('cp-bg-opacity').value = String(op);
    byId('cp-bg-op-val').textContent = Math.round(op * 100) + '%';
    syncTranslateBar();
  }
  async function handleBackgroundUpload(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        var max = 1080, w = img.width, h = img.height;
        if (w > max || h > max) {
          if (w > h) { h = Math.round(h * max / w); w = max; }
          else { w = Math.round(w * max / h); h = max; }
        }
        canvas.width = w; canvas.height = h; ctx.drawImage(img, 0, 0, w, h);
        state.bg.dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        saveJSON(KEY_BG, state.bg);
        applyBackground();
        toast('背景图已更新');
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }
  function saveSettings() {
    state.cfg.smartReplyEnabled = byId('cp-sr-setting').checked;
    state.cfg.autoTranslateLastMsg = byId('cp-auto-trans-setting').checked;
    state.cfg.ai.endpoint = byId('cp-ai-endpoint').value.trim();
    state.cfg.ai.apiKey = byId('cp-ai-key').value.trim();
    state.cfg.ai.model = byId('cp-ai-model').value.trim() || 'gpt-4o-mini';
    state.bg.opacity = parseFloat(byId('cp-bg-opacity').value || '0.85');
    saveJSON(KEY_CFG, state.cfg);
    saveJSON(KEY_BG, state.bg);
    applyBackground();
    closeSettings();
    toast('配置已保存');
  }
  function openSettings() {
    byId('cp-settings-mask').hidden = false;
    state.settingsOpen = true;
  }
  function closeSettings() {
    byId('cp-settings-mask').hidden = true;
    state.settingsOpen = false;
  }
  function openPreview(type, src) {
    var body = byId('cp-preview-body');
    if (type === 'video') {
      body.innerHTML = '<video src="' + escAttr(src) + '" controls autoplay playsinline style="max-width:100%;max-height:80vh;border-radius:12px;"></video>';
    } else {
      body.innerHTML = '<img src="' + escAttr(src) + '" style="max-width:100%;max-height:80vh;border-radius:12px;pointer-events:none;" />';
    }
    byId('cp-preview-mask').hidden = false;
    state.previewOpen = true;
  }
  function closePreview() {
    byId('cp-preview-mask').hidden = true;
    byId('cp-preview-body').innerHTML = '';
    state.previewOpen = false;
  }
  async function recallMessage(msg) {
    if (!msg || !msg.mine) return;
    try {
      await postJSON(state.bootstrap.chat.revokePath, {
        channel_id: state.peerWkUid,
        message_seq: msg.seq || 0,
        client_msg_no: msg.clientMsgNo || ''
      });
      msg.recalled = true;
      msg.text = '此消息已被撤回';
      msg.html = '';
      render('keep');
      toast('撤回成功');
    } catch (err) {
      toast('撤回失败');
    }
  }
  function deleteMessage(msg) {
    if (!msg) return;
    state.messages = state.messages.filter(function (x) { return x.id !== msg.id; });
    render('keep');
    schedulePersist();
    toast('已删除');
  }
  function showContextMenu(e, msg) {
    var menu = byId('cp-context-menu');
    if (!menu || !msg) return;
    state.contextMsg = msg;
    var html = '<div class="cp-menu-item" data-action="quote">' + ICON.quote + ' 引用</div>' +
      '<div class="cp-menu-item" data-action="translate">' + ICON.trans + ' 翻译</div>';
    if (msg.mine && !msg.recalled) html += '<div class="cp-menu-item danger" data-action="recall">' + ICON.recall + ' 撤回</div>';
    html += '<div class="cp-menu-item danger" data-action="delete"><i class="fa fa-trash"></i> 删除</div>';
    menu.innerHTML = html;
    menu.hidden = false;
    var x = e.clientX || Math.round(window.innerWidth / 2);
    var y = e.clientY || Math.round(window.innerHeight / 2);
    var mw = 150;
    var mh = msg.mine ? 180 : 132;
    x = Math.min(Math.max(12, x), window.innerWidth - mw - 12);
    y = Math.min(Math.max(72, y), window.innerHeight - mh - 12);
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }
  function handleScroll() {
    var main = byId('cp-main');
    var fab = byId('cp-fab-bottom');
    var distance = main.scrollHeight - main.scrollTop - main.clientHeight;
    fab.classList.toggle('show', distance > 220 || state.unreadCount > 0);
    if (distance < 80) {
      if (state.unreadCount) {
        state.unreadCount = 0;
        updateUnreadBadge();
      }
    }
    state.scrollTop = main.scrollTop;
    schedulePersist();
  }
  function playVoice(btn) {
    var src = btn.getAttribute('data-audio-src') || '';
    if (!src) return;
    if (state.currentAudioEl === btn && !state.audio.paused) {
      state.audio.pause();
      btn.classList.remove('playing');
      btn.querySelector('.cp-play-circle').innerHTML = ICON.play;
      state.currentAudioEl = null;
      return;
    }
    if (state.currentAudioEl) {
      state.currentAudioEl.classList.remove('playing');
      var oldIcon = state.currentAudioEl.querySelector('.cp-play-circle');
      if (oldIcon) oldIcon.innerHTML = ICON.play;
    }
    state.audio.src = src;
    state.audio.play().then(function () {
      btn.classList.add('playing');
      btn.querySelector('.cp-play-circle').innerHTML = ICON.pause;
      state.currentAudioEl = btn;
    }).catch(function () { toast('播放失败'); });
  }
  function bindEvents() {
    var main = byId('cp-main');
    var input = byId('cp-input');
    main.addEventListener('scroll', handleScroll, { passive: true });
    byId('cp-fab-bottom').addEventListener('click', function () {
      state.unreadCount = 0;
      updateUnreadBadge();
      main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' });
    });
    input.addEventListener('input', function () {
      this.style.height = '36px';
      this.style.height = Math.min(this.scrollHeight, 120) + 'px';
      updatePrimaryButton();
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handlePrimaryAction();
      }
    });
    byId('cp-primary-btn').addEventListener('click', handlePrimaryAction);
    byId('cp-media-btn').addEventListener('click', function (e) {
      e.stopPropagation();
      var pop = byId('cp-media-pop');
      pop.hidden = !pop.hidden;
    });
    byId('cp-pick-camera').addEventListener('click', function () { byId('cp-media-pop').hidden = true; byId('cp-camera-file').click(); });
    byId('cp-pick-album').addEventListener('click', function () { byId('cp-media-pop').hidden = true; byId('cp-media-file').click(); });
    byId('cp-camera-file').addEventListener('change', onPickMedia);
    byId('cp-media-file').addEventListener('change', onPickMedia);
    byId('cp-quote-close').addEventListener('click', hideQuoteBar);
    byId('cp-send-translate-toggle').addEventListener('click', function () {
      state.cfg.sendTranslateEnabled = !state.cfg.sendTranslateEnabled;
      saveJSON(KEY_CFG, state.cfg);
      syncTranslateBar();
      toast(state.cfg.sendTranslateEnabled ? '发送翻译已开启' : '发送翻译已关闭');
    });
    byId('cp-lang-swap').addEventListener('click', function () {
      var a = state.cfg.sourceLang; state.cfg.sourceLang = state.cfg.targetLang; state.cfg.targetLang = a;
      saveJSON(KEY_CFG, state.cfg); syncTranslateBar();
    });
    byId('cp-src-lang-btn').addEventListener('click', function () { state.pickingLangFor = 'source'; byId('cp-lang-mask').hidden = false; });
    byId('cp-tgt-lang-btn').addEventListener('click', function () { state.pickingLangFor = 'target'; byId('cp-lang-mask').hidden = false; });
    byId('cp-lang-close').addEventListener('click', function () { byId('cp-lang-mask').hidden = true; });
    byId('cp-lang-grid').addEventListener('click', function (e) {
      var item = e.target.closest('.cp-lang-item');
      if (!item) return;
      var lang = item.getAttribute('data-lang');
      if (state.pickingLangFor === 'source') state.cfg.sourceLang = lang;
      else state.cfg.targetLang = lang;
      saveJSON(KEY_CFG, state.cfg);
      syncTranslateBar();
      byId('cp-lang-mask').hidden = true;
    });
    byId('cp-header-more').addEventListener('click', openSettings);
    byId('cp-settings-mask').addEventListener('click', function (e) { if (e.target === this) closeSettings(); });
    byId('cp-settings-close-btn').addEventListener('click', closeSettings);
    byId('cp-settings-save').addEventListener('click', saveSettings);
    byId('cp-bg-upload-btn').addEventListener('click', function () { byId('cp-bg-file').click(); });
    byId('cp-bg-file').addEventListener('change', handleBackgroundUpload);
    byId('cp-bg-opacity').addEventListener('input', function () {
      state.bg.opacity = parseFloat(this.value || '0.85');
      byId('cp-bg-op-val').textContent = Math.round(state.bg.opacity * 100) + '%';
      applyBackground();
    });
    byId('cp-clear-history').addEventListener('click', function () {
      if (!window.confirm('确定要清空本地聊天记录吗？')) return;
      state.messages = [];
      render('bottom');
      schedulePersist();
      toast('已清空记录');
      closeSettings();
    });
    byId('cp-preview-mask').addEventListener('click', function (e) { if (e.target === this) closePreview(); });
    byId('cp-smart-replies-bar').addEventListener('click', function (e) {
      var btn = e.target.closest('.cp-sr-pill');
      if (!btn) return;
      var input = byId('cp-input');
      input.value = btn.getAttribute('data-tgt') || btn.getAttribute('data-src') || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.focus();
    });
    byId('cp-rec-cancel').addEventListener('click', function () { stopRecording(false); });
    byId('cp-rec-send').addEventListener('click', function () { stopRecording(true); });
    byId('cp-rec-pause').addEventListener('click', togglePauseRecording);
    byId('cp-msg-list').addEventListener('click', function (e) {
      var actEl = e.target.closest('[data-act]');
      if (!actEl) return;
      var act = actEl.getAttribute('data-act');
      if (act === 'show-menu' && !e.target.closest('.cp-voice') && !e.target.closest('.cp-media-thumb')) {
        var row = actEl.closest('.cp-row');
        var id = row ? row.getAttribute('data-id') : '';
        var msg = state.messages.find(function (m) { return m.id === id; });
        if (msg) showContextMenu(e, msg);
        return;
      }
      if (act === 'play-voice') {
        playVoice(actEl);
        return;
      }
      if (act === 'preview-media') {
        openPreview(actEl.getAttribute('data-type'), actEl.getAttribute('data-src'));
        return;
      }
      if (act === 'quick-translate') {
        var id2 = actEl.getAttribute('data-id');
        var msg2 = state.messages.find(function (m) { return m.id === id2; });
        if (msg2) executeAIAnalysis(msg2);
      }
    });
    byId('cp-context-menu').addEventListener('click', function (e) {
      var item = e.target.closest('.cp-menu-item');
      if (!item || !state.contextMsg) return;
      var action = item.getAttribute('data-action');
      if (action === 'quote') showQuoteBar(state.contextMsg);
      else if (action === 'translate') executeAIAnalysis(state.contextMsg);
      else if (action === 'recall') recallMessage(state.contextMsg);
      else if (action === 'delete') deleteMessage(state.contextMsg);
      byId('cp-context-menu').hidden = true;
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#cp-context-menu') && !e.target.closest('.cp-bubble')) byId('cp-context-menu').hidden = true;
      if (!e.target.closest('#cp-media-pop') && !e.target.closest('#cp-media-btn')) byId('cp-media-pop').hidden = true;
    });
    state.audio.addEventListener('ended', function () {
      if (state.currentAudioEl) {
        state.currentAudioEl.classList.remove('playing');
        var icon = state.currentAudioEl.querySelector('.cp-play-circle');
        if (icon) icon.innerHTML = ICON.play;
      }
      state.currentAudioEl = null;
    });
  }
  function injectStyle() {
    if (document.getElementById('cp-chat-style')) return;
    var css = `
      body { background: #f1f5f9; }
      #cp-chat-root { position: fixed; inset: 0; z-index: 2147483000; --cp-other: #ffffff; --cp-mine: #e0c3fc; --cp-bg: #f1f5f9; --cp-text: #1f2937; --cp-primary: #3b82f6; --cp-danger: #ef4444; --cp-footer-h: 128px; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; color: var(--cp-text); overflow: hidden; background: var(--cp-bg); }
      #cp-chat-root *::-webkit-scrollbar { display: none !important; }
      .cp-bg { position: absolute; inset: 0; background-size: cover; background-position: center; z-index: 0; pointer-events: none; }
      .cp-bg-mask { position: absolute; inset: 0; background: rgba(241,245,249,var(--bg-op,0.85)); z-index: 1; pointer-events: none; }
      .cp-header { position: absolute; left: 0; right: 0; top: 0; z-index: 20; height: calc(48px + env(safe-area-inset-top)); padding: env(safe-area-inset-top) 12px 6px; display: flex; align-items: flex-end; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,.35); background: rgba(255,255,255,.72); backdrop-filter: blur(10px); box-shadow: 0 1px 3px rgba(0,0,0,0.02); }
      .cp-header-center { position: absolute; left: 50%; bottom: 10px; transform: translateX(-50%); font-size: 17px; font-weight: bold; color: #1f2937; white-space: nowrap; }
      .cp-header-center a { color: inherit; text-decoration: none; }
      .cp-header-actions button { border: none; background: transparent; font-size: 20px; color: #4b5563; cursor: pointer; padding: 0 4px; }
      .cp-main { position: absolute; left: 0; right: 0; top: calc(48px + env(safe-area-inset-top)); bottom: calc(var(--cp-footer-h) + env(safe-area-inset-bottom)); z-index: 10; overflow-y: auto; overflow-x: hidden; padding: 10px 8px 20px; scroll-behavior: auto; -webkit-overflow-scrolling: touch; }
      .cp-fab-bottom { position: absolute; right: 16px; bottom: calc(var(--cp-footer-h) + 20px); width: 38px; height: 38px; border-radius: 50%; border:1px solid rgba(0,0,0,0.05); background: rgba(255,255,255,0.9); backdrop-filter: blur(5px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); display: flex; align-items: center; justify-content: center; font-size: 20px; color: var(--cp-primary); cursor: pointer; opacity: 0; pointer-events: none; transform: translateY(20px); transition: all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); z-index: 35; }
      .cp-fab-bottom.show { opacity: 1; pointer-events: auto; transform: translateY(0); }
      .cp-fab-badge { position:absolute; top:-4px; right:-4px; background:#ef4444; color:#fff; font-size:10px; font-family:sans-serif; font-weight:bold; padding:2px 5px; border-radius:10px; box-shadow:0 1px 2px rgba(0,0,0,0.2); }
      .cp-time-sep { display: flex; justify-content: center; margin: 16px 0 10px; pointer-events: none; }
      .cp-time-sep span { background: rgba(0,0,0,0.12); color: #fff; font-size: 11px; font-weight: 500; padding: 4px 10px; border-radius: 12px; backdrop-filter: blur(4px); }
      .cp-row { display: flex; align-items: flex-end; gap: 8px; padding: 2px 0; position: relative; }
      .cp-row.mine { justify-content: flex-end; }
      .cp-row.mine .cp-avatar-wrap { display: none; }
      .cp-avatar-wrap { display: block; flex-shrink: 0; width: 40px; height: 40px; cursor: pointer; border-radius: 40%; overflow: hidden; visibility: hidden; position: relative !important; z-index: 8 !important; transform: translateZ(0); }
      .cp-row.is-last .cp-avatar-wrap { visibility: visible; }
      .cp-bubble-wrap { max-width: 78%; min-width: 40px; position: relative !important; z-index: 1 !important; }
      .cp-bubble { position: relative !important; z-index: 1 !important; padding: 6px 10px 8px; font-size: 15.5px; line-height: 1.45; word-break: break-word; -webkit-touch-callout: none; user-select: none; cursor: pointer; border-radius: 18px 19px 13px 18px; }
      .cp-row.other .cp-bubble { background: var(--cp-other); color: #000; }
      .cp-row.mine .cp-bubble { background: var(--cp-mine); color: #111; }
      .cp-row.other.has-tail .cp-bubble { border-bottom-left-radius: 0px; }
      .cp-row.other.has-tail .cp-bubble::before { content: ''; position: absolute; bottom: 0; left: -8px; width: 20px; height: 10px; background: var(--cp-other); border-bottom-right-radius: 16px 14px; z-index:0 !important; pointer-events:none !important; }
      .cp-row.other.has-tail .cp-bubble::after { content: ''; position: absolute; bottom: 0; left: -12px; width: 12px; height: 20px; background: var(--cp-bg); border-bottom-right-radius: 10px; z-index:0 !important; pointer-events:none !important; }
      body.cp-has-bg .cp-row.other.has-tail .cp-bubble::before, body.cp-has-bg .cp-row.other.has-tail .cp-bubble::after { display:none; }
      body.cp-has-bg .cp-row.other.has-tail .cp-bubble { border-bottom-left-radius: 4px; -webkit-mask-image: radial-gradient(circle 12px at -2px 0, transparent 12px, black 12.5px), linear-gradient(black, black); -webkit-mask-size: 20px 20px, 100% 100%; -webkit-mask-position: bottom left, center; -webkit-mask-repeat: no-repeat, no-repeat; mask-image: radial-gradient(circle 12px at -2px 0, transparent 12px, black 12.5px), linear-gradient(black, black); mask-size: 20px 20px, 100% 100%; mask-position: bottom left, center; mask-repeat: no-repeat, no-repeat; }
      .cp-row.mine.has-tail .cp-bubble { border-bottom-right-radius: 4px; }
      .cp-row.mine.has-tail .cp-bubble::before { content: ''; position: absolute; bottom: 0; right: -12px; width: 28px; height: 19px; background: var(--cp-mine); border-bottom-left-radius: 18px 18px; z-index:0 !important; pointer-events:none !important; }
      .cp-row.mine.has-tail .cp-bubble::after { content: ''; position: absolute; bottom: 0; right: -12px; width: 12px; height: 20px; background: var(--cp-bg); border-bottom-left-radius: 10px; z-index:0 !important; pointer-events:none !important; }
      body.cp-has-bg .cp-row.mine.has-tail .cp-bubble::before, body.cp-has-bg .cp-row.mine.has-tail .cp-bubble::after { display:none; }
      body.cp-has-bg .cp-row.mine.has-tail .cp-bubble { border-bottom-right-radius: 4px; -webkit-mask-image: radial-gradient(circle 12px at calc(100% + 2px) 0, transparent 12px, black 12.5px), linear-gradient(black, black); -webkit-mask-size: 20px 20px, 100% 100%; -webkit-mask-position: bottom right, center; -webkit-mask-repeat: no-repeat, no-repeat; mask-image: radial-gradient(circle 12px at calc(100% + 2px) 0, transparent 12px, black 12.5px), linear-gradient(black, black); mask-size: 20px 20px, 100% 100%; mask-position: bottom right, center; mask-repeat: no-repeat, no-repeat; }
      .cp-bubble.recalled { opacity: .72; background: #e5e7eb !important; border-radius: 8px !important; }
      .cp-bubble.recalled::before, .cp-bubble.recalled::after { display: none !important; }
      .cp-bubble.media-shell { padding: 0px; background: transparent !important; box-shadow: none; border-radius: 8px !important; overflow: hidden; }
      .cp-bubble.media-shell::before, .cp-bubble.media-shell::after { display: none !important; }
      .cp-quote-card { display: flex; gap: 0; background: rgba(59,130,246,0.08); border-radius: 8px; margin-bottom: 6px; overflow: hidden; pointer-events: none; }
      .cp-row.mine .cp-quote-card { background: rgba(0,0,0,0.06); }
      .cp-quote-bar { width: 3px; min-width: 3px; background: var(--cp-primary); border-radius: 3px 0 0 3px; flex-shrink: 0; }
      .cp-row.mine .cp-quote-bar { background: rgba(0,0,0,0.35); }
      .cp-quote-body { padding: 5px 10px; min-width: 0; overflow: hidden; }
      .cp-quote-name { font-size: 12px; font-weight: 600; color: var(--cp-primary); line-height: 1.3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cp-row.mine .cp-quote-name { color: rgba(0,0,0,0.55); }
      .cp-quote-text { font-size: 13px; color: rgba(0,0,0,0.55); line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
      .cp-quote-preview { display: flex; align-items: center; gap: 8px; background: rgba(255,255,255,0.92); backdrop-filter: blur(6px); border-radius: 12px; padding: 6px 10px; margin: 0 4px 4px; border: 1px solid rgba(0,0,0,0.06); font-size: 13px; color: #4b5563; }
      .cp-quote-preview-bar { width: 3px; min-height: 28px; background: var(--cp-primary); border-radius: 3px; flex-shrink: 0; }
      .cp-quote-preview-body { flex: 1; min-width: 0; overflow: hidden; }
      .cp-quote-preview-name { font-size: 11px; font-weight: 600; color: var(--cp-primary); }
      .cp-quote-preview-text { font-size: 12px; color: #6b7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .cp-quote-preview-close { border: none; background: none; font-size: 16px; color: #9ca3af; cursor: pointer; padding: 0 4px; flex-shrink: 0; }
      .cp-inline-time { float: right; margin: 12px 0 0 6px; font-size: 10px; opacity: 0.45; font-variant-numeric: tabular-nums; line-height: 1.45; }
      .cp-inline-send { float:right; margin:12px 6px 0 6px; font-size:10px; color:#64748b; }
      .cp-inline-send.fail { color:#ef4444; }
      .cp-media-time { position: absolute; right: 6px; bottom: 6px; font-size: 10px; color: #fff; background: rgba(0,0,0,0.5); border-radius: 8px; padding: 2px 6px; z-index:2; font-variant-numeric: tabular-nums; }
      .cp-text { white-space: pre-wrap; pointer-events: none; }
      .cp-voice { display: flex; align-items: center; gap: 6px; min-width: 100px; border: 0; background: transparent; cursor: pointer; pointer-events: auto; padding:0; color:inherit; }
      .cp-play-circle { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); flex-shrink:0; font-size: 12px; background: #f1f5f9; color: var(--cp-primary); }
      .cp-wave { display: flex; align-items: center; gap: 2px; height: 14px; flex: 1; opacity: 0.6; }
      .cp-wave i { width: 2px; border-radius: 2px; background: currentColor; }
      .cp-voice.playing .cp-wave i { animation: cp-wave-pulse .6s ease-in-out infinite alternate; opacity: 1; }
      .cp-voice-info-col { display: flex; flex-direction: column; align-items: flex-end; line-height: 1; margin-left: 2px; }
      .cp-voice-dur { font-size: 13px; font-weight:bold; }
      .cp-voice-time { font-size: 9px; opacity: 0.45; margin-top:3px; font-variant-numeric: tabular-nums; }
      @keyframes cp-wave-pulse { from { transform: scaleY(.4); } to { transform: scaleY(1.5); } }
      .cp-translation-wrap { clear: both; margin-top: 6px; padding-top: 6px; border-top: 1px dashed rgba(0,0,0,.1); }
      .cp-translation-text { font-size: 13.5px; white-space: pre-wrap; opacity: 0.95; color: #374151; }
      .cp-quick-trans { position: absolute; right: -12px; bottom: -2px; width: 24px; height: 24px; background: rgba(255,255,255,0.95); border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,.1); display: grid; place-items: center; cursor: pointer; border: 1px solid rgba(0,0,0,0.03); z-index:10; transition: transform 0.2s; }
      .cp-quick-trans:active { transform: scale(0.9); }
      .cp-media-thumb { display: block; border: 0; padding: 0; margin: 0; background: transparent; cursor: pointer; pointer-events: auto; position:relative; }
      .cp-media-thumb img { display: block; width: 200px; max-height: 280px; border-radius: 8px; object-fit: cover; object-position: top; }
      .cp-video-wrap { width: 200px; max-height: 280px; border-radius: 8px; overflow: hidden; position: relative; background: #e2e8f0; }
      .cp-video-wrap video { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
      .cp-video-wrap::after { content: "\\f01d"; font-family: FontAwesome; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font-size: 32px; color: rgba(255,255,255,0.8); pointer-events: none; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
      .cp-video-mark { position: absolute; right: 6px; bottom: 6px; font-size: 10px; color: #fff; background: rgba(0,0,0,.6); border-radius: 8px; padding: 2px 6px; z-index:2; }
      .cp-context-menu { position: fixed; z-index: 2147483005; background: #fff; border-radius: 12px; box-shadow: 0 5px 25px rgba(0,0,0,0.15); padding: 6px; min-width: 120px; }
      .cp-menu-item { padding: 10px 14px; font-size: 14.5px; color: #374151; cursor: pointer; border-radius: 8px; display: flex; align-items: center; gap: 10px; }
      .cp-menu-item:hover { background: #f3f4f6; }
      .cp-menu-item.danger { color: #ef4444; }
      .cp-footer { position: absolute; left: 0; right: 0; bottom: 0; z-index: 30; padding: 0 12px max(12px, env(safe-area-inset-bottom)); background: linear-gradient(to top, rgba(255,255,255,0.95), rgba(255,255,255,0.8), transparent); display: flex; flex-direction: column; }
      .cp-smart-replies-bar { display: flex; gap: 8px; overflow-x: auto; padding: 6px 4px; scroll-behavior: smooth; -webkit-overflow-scrolling: touch; scrollbar-width: none; background: transparent; max-width: 100%; }
      .cp-smart-replies-bar::-webkit-scrollbar { display: none; }
      .cp-sr-pill { flex-shrink: 0; background: #e0e7ff; color: #4338ca; padding: 6px 12px; border-radius: 16px; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid rgba(0,0,0,0.05); white-space: nowrap; box-shadow: 0 2px 4px rgba(0,0,0,0.05); transition: background 0.2s; }
      .cp-sr-pill:active { background: #c7d2fe; }
      .cp-translate-bar { max-width: 100%; margin: 0 4px 0; display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border: 1px solid rgba(255,255,255,0.6); border-radius: 20px; background: rgba(255,255,255,0.85); backdrop-filter: blur(8px); box-shadow: 0 1px 6px rgba(0,0,0,0.04); }
      .cp-lang-btn { background: transparent; border: none; font-size: 12px; font-weight: 600; color: #374151; cursor: pointer; padding: 2px 6px; border-radius: 12px; }
      .cp-swap-btn { border: none; background: transparent; color: #9ca3af; font-size: 13px; cursor: pointer; padding: 0 4px; }
      .cp-toggle-ai-send { position: relative; border: none; background: transparent; color: #9ca3af; font-size: 14px; cursor: pointer; padding: 4px 4px 4px 14px; border-radius: 50%; display: flex; align-items: center; margin-left: 4px; border-left: 1px solid #e5e7eb; }
      .cp-toggle-ai-send::before { content: ''; position: absolute; left: 4px; top: 50%; transform: translateY(-50%); width: 5px; height: 5px; border-radius: 50%; background: #9ca3af; }
      .cp-toggle-ai-send.active { color: var(--cp-primary); }
      .cp-toggle-ai-send.active::before { background: #22c55e; box-shadow: 0 0 4px #22c55e; }
      .cp-toolbar { position: relative; max-width: 100%; margin: 0; display: flex; align-items: flex-end; padding: 6px; border: 1px solid rgba(0,0,0,0.08); border-radius: 28px; background: rgba(255,255,255,0.95); box-shadow: 0 4px 15px rgba(0,0,0,.06); min-height: 50px; }
      .cp-progress-wrap { position: absolute; left: 16px; right: 16px; top: -5px; height: 4px; background: rgba(0,0,0,0.06); border-radius: 4px; overflow: hidden; pointer-events: none; }
      .cp-progress-bar { height: 100%; width: 0%; background: var(--cp-primary); transition: width 0.1s linear; }
      .cp-tool-btn { width: 36px; height: 36px; border: none; background: transparent; color: #6b7280; cursor: pointer; display: grid; place-items: center; flex-shrink: 0; border-radius: 50%; margin-bottom: 2px; }
      .cp-input-box { flex: 1; min-width: 0; display: flex; align-items: center; }
      .cp-input-box textarea { width: 100%; min-height: 36px; max-height: 120px; border: none; padding: 8px 4px; margin: 2px 0; font-size: 15px; outline: none; background: transparent; color: #1f2937; resize: none; overflow-y: auto; font-family: inherit; line-height: 20px; }
      .cp-primary-btn { width: 38px; height: 38px; border: none; border-radius: 50%; color: #6b7280; cursor: pointer; display: grid; place-items: center; background: transparent; flex-shrink: 0; margin-bottom: 1px; }
      .cp-primary-btn.send { background: var(--cp-primary); color: #fff; box-shadow: 0 2px 8px rgba(37,99,235,.3); }
      .cp-modal-mask { position: absolute; inset: 0; z-index: 50; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px); padding: 20px; }
      .cp-modal { width: 100%; max-width: 420px; max-height: 86vh; overflow-y: auto; border-radius: 24px; background: #fff; padding: 24px 16px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); }
      .cp-lang-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
      .cp-lang-item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 16px; background: #f8fafc; border: 1px solid #e2e8f0; cursor: pointer; font-size: 15px; color: #334155; }
      .cp-rec-inline { display: flex; align-items: center; gap: 6px; flex: 1; padding: 2px 4px; background: transparent; width: 100%; }
      .cp-rec-btn-icon { background: none; border: none; padding: 4px 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; }
      .cp-rec-vis { flex: 1; display: flex; align-items: center; gap: 4px; min-width: 0; }
      .cp-rec-dot { width: 8px; height: 8px; background: #ef4444; border-radius: 50%; flex-shrink: 0; animation: cp-rec-blink 1.5s infinite; }
      .cp-rec-dash { flex: 1; height: 2px; border-bottom: 3px dotted #9ca3af; margin: 0 4px; opacity: 0.8; }
      .cp-rec-bars { display: flex; align-items: center; justify-content: center; gap: 3px; height: 20px; width: 28px; margin-right: 4px; }
      .cp-rec-bars i { width: 3px; border-radius: 2px; background: #9ca3af; transform: scaleY(1); }
      @keyframes cp-rec-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      .cp-preview-mask { position:absolute;inset:0;z-index:2147483010;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;transition:background-color 0.25s ease; }
      .cp-toast { position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(.94);z-index:2147483650;background:rgba(15,23,42,.78);color:#fff;padding:10px 18px;border-radius:999px;font-size:14px;font-weight:700;opacity:0;transition:all .18s ease;pointer-events:none; }
      .cp-toast.show { opacity:1; transform:translate(-50%,-50%) scale(1); }
    `;
    var st = document.createElement('style');
    st.id = 'cp-chat-style';
    st.textContent = css;
    document.head.appendChild(st);
  }
  function injectRoot() {
    if (byId('cp-chat-root')) return;
    var langHtml = '';
    LANG_LIST.forEach(function (item) {
      langHtml += '<div class="cp-lang-item" data-lang="' + escAttr(item.n) + '"><span>' + item.f + '</span><span>' + esc(item.n) + '</span></div>';
    });
    document.body.insertAdjacentHTML('beforeend',
      '<div id="cp-chat-root">' +
        '<div class="cp-bg" id="cp-bg"></div><div class="cp-bg-mask" id="cp-bg-mask"></div>' +
        '<header class="cp-header"><div style="width:32px;"></div><div class="cp-header-center" id="cp-peer-info">加载中...</div><div class="cp-header-actions"><button id="cp-header-more"><i class="fa fa-ellipsis-v"></i></button></div></header>' +
        '<main class="cp-main" id="cp-main"><div id="cp-msg-list"></div></main>' +
        '<button id="cp-fab-bottom" class="cp-fab-bottom"><i class="fa fa-angle-down"></i><span id="cp-fab-badge" class="cp-fab-badge" hidden>0</span></button>' +
        '<div id="cp-context-menu" class="cp-context-menu" hidden></div>' +
        '<footer class="cp-footer" id="cp-footer">' +
          '<div style="text-align:center"><div class="cp-translate-bar" id="cp-translate-bar"><button class="cp-lang-btn" id="cp-src-lang-btn">🇨🇳 中文</button><button class="cp-swap-btn" id="cp-lang-swap">⇄</button><button class="cp-lang-btn" id="cp-tgt-lang-btn">🇲🇲 မြန်မာစာ</button><button class="cp-toggle-ai-send" id="cp-send-translate-toggle">译</button></div></div>' +
          '<div id="cp-smart-replies-bar" class="cp-smart-replies-bar" hidden></div>' +
          '<div id="cp-quote-preview" class="cp-quote-preview" hidden><div class="cp-quote-preview-bar"></div><div class="cp-quote-preview-body"><div class="cp-quote-preview-name" id="cp-quote-preview-name"></div><div class="cp-quote-preview-text" id="cp-quote-preview-text"></div></div><button class="cp-quote-preview-close" id="cp-quote-close">✕</button></div>' +
          '<div class="cp-toolbar" id="cp-toolbar"><div id="cp-upload-progress-wrap" class="cp-progress-wrap" hidden><div id="cp-upload-progress-bar" class="cp-progress-bar"></div></div><div id="cp-toolbar-inputs" style="display:flex;width:100%;align-items:flex-end;"><button id="cp-media-btn" class="cp-tool-btn">' + ICON.photo + '</button><div class="cp-input-box"><textarea id="cp-input" rows="1" placeholder="发送消息..."></textarea></div><button id="cp-primary-btn" class="cp-primary-btn"><span id="cp-primary-icon">' + ICON.mic + '</span></button></div><div id="cp-rec-inline" class="cp-rec-inline" hidden><button id="cp-rec-cancel" class="cp-rec-btn-icon"><i class="fa fa-trash-o" style="font-size:20px;color:#6b7280;"></i></button><div class="cp-rec-vis"><span class="cp-rec-dot"></span><div class="cp-rec-dash"></div><div class="cp-rec-bars" id="cp-rec-bars"></div></div><button id="cp-rec-pause" class="cp-rec-btn-icon"><i class="fa fa-pause-circle" style="font-size:22px;color:#0ea5e9;"></i></button><span id="cp-rec-time" style="font-size:16px;color:#4b5563;font-family:sans-serif;font-weight:500;width:38px;text-align:center;">0:00</span><button id="cp-rec-send" class="cp-rec-btn-icon"><i class="fa fa-paper-plane" style="font-size:20px;color:#0ea5e9;"></i></button></div></div>' +
          '<div class="cp-media-pop" id="cp-media-pop" hidden style="position:absolute;bottom:70px;left:20px;background:#fff;border-radius:16px;padding:8px;box-shadow:0 5px 20px rgba(0,0,0,.15);z-index:40"><button id="cp-pick-camera" style="width:100%;background:none;border:none;padding:12px;text-align:left;display:flex;gap:12px;font-size:15px"><span class="mi">' + ICON.camera + '</span><span>拍摄</span></button><button id="cp-pick-album" style="width:100%;background:none;border:none;padding:12px;text-align:left;display:flex;gap:12px;font-size:15px"><span class="mi">' + ICON.album + '</span><span>相册图片/视频</span></button></div>' +
        '</footer>' +
        '<input id="cp-media-file" type="file" accept="image/*,video/*" multiple hidden />' +
        '<input id="cp-camera-file" type="file" accept="image/*" capture="environment" hidden />' +
        '<input id="cp-bg-file" type="file" accept="image/*" hidden />' +
        '<div class="cp-modal-mask" id="cp-lang-mask" hidden><div class="cp-modal"><div style="display:flex;justify-content:space-between;align-items:center;"><h3 style="margin:0;font-size:18px;">选择语言</h3><button id="cp-lang-close" style="border:none;background:none;font-size:20px;color:#666;cursor:pointer;">✕</button></div><div class="cp-lang-grid" id="cp-lang-grid">' + langHtml + '</div></div></div>' +
        '<div class="cp-modal-mask" id="cp-settings-mask" hidden><div class="cp-modal" id="cp-settings-modal"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;"><h3 style="margin:0;font-size:18px;">设置</h3></div><button id="cp-clear-history" style="width:100%;padding:10px;background:transparent;color:#ef4444;border:1px solid #ef4444;border-radius:10px;font-size:13px;cursor:pointer;margin-bottom:16px;">🗑️ 清空本地聊天记录</button><div style="display:flex;gap:12px;margin-bottom:12px;"><label style="flex:1;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:10px;border-radius:12px;border:1px solid #e2e8f0;font-size:13px;cursor:pointer;"><span>🌐 翻译最新消息</span><input id="cp-auto-trans-setting" type="checkbox" style="width:16px;height:16px;accent-color:#3b82f6" /></label><label style="flex:1;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:10px;border-radius:12px;border:1px solid #e2e8f0;font-size:13px;cursor:pointer;"><span>✨ 追问气囊</span><input id="cp-sr-setting" type="checkbox" style="width:16px;height:16px;accent-color:#3b82f6" /></label></div><div style="margin-bottom:12px;"><button id="cp-bg-upload-btn" style="width:100%;padding:10px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:12px;cursor:pointer;font-size:14px;">🖼️ 设置自定义背景图片</button></div><div style="margin-bottom:12px;"><label style="font-size:12px;color:#64748b;display:flex;justify-content:space-between;">背景白雾遮罩 <span id="cp-bg-op-val">85%</span></label><input id="cp-bg-opacity" type="range" min="0" max="1" step="0.05" style="width:100%;accent-color:#3b82f6;margin-top:4px;"></div><div style="margin-bottom:8px;"><label style="font-size:12px;color:#64748b;">AI URL</label><input id="cp-ai-endpoint" type="text" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin-top:4px;background:#f8fafc;" /></div><div style="margin-bottom:8px;"><label style="font-size:12px;color:#64748b;">API Key</label><input id="cp-ai-key" type="password" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin-top:4px;background:#f8fafc;" /></div><div style="margin-bottom:16px;"><label style="font-size:12px;color:#64748b;">模型</label><input id="cp-ai-model" type="text" style="width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;margin-top:4px;background:#f8fafc;" /></div><div style="display:flex;gap:12px;margin-bottom:12px;"><button id="cp-settings-close-btn" style="flex:1;padding:12px;background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;border-radius:12px;font-weight:bold;font-size:15px;cursor:pointer;">关闭</button><button id="cp-settings-save" style="flex:2;padding:12px;background:#3b82f6;color:#fff;border:none;border-radius:12px;font-weight:bold;font-size:15px;cursor:pointer;">保存配置</button></div></div></div>' +
        '<div class="cp-preview-mask" id="cp-preview-mask" hidden><div id="cp-preview-body" style="transition:transform 0.25s;display:flex;align-items:center;justify-content:center;"></div></div>' +
      '</div>'
    );
    renderRecBars();
  }
  function renderRecBars() {
    var bars = byId('cp-rec-bars');
    if (!bars) return;
    bars.innerHTML = waveHeights.slice(0, 5).map(function (h, i) { return '<i style="height:' + h + 'px;animation-delay:' + (i * 0.05) + 's"></i>'; }).join('');
  }
  async function boot() {
    state.cfg = loadJSON(KEY_CFG, { autoTranslateLastMsg: false, sourceLang: '中文', targetLang: 'မြန်မာစာ', sendTranslateEnabled: false, smartReplyEnabled: true, voiceMaxDuration: 60, ai: { endpoint: '', apiKey: '', model: 'gpt-4o-mini' } });
    state.bg = loadJSON(KEY_BG, { dataUrl: null, opacity: 0.85 });
    restoreLocalCache();
    state.peerWkUid = wkUidFromKey(state.peerKey);
    state.peerNodeUid = nodeUidFromWkUid(state.peerWkUid);
    injectStyle();
    injectRoot();
    applyBackground();
    syncSettingsUI();
    bindEvents();
    try {
      state.bootstrap = await getJSON(String(mountEl.getAttribute('data-bootstrap-path') || '/api/chat-app/bootstrap'));
      state.token = await getJSON(state.bootstrap.chat.tokenPath);
      updateHeaderPeerInfo();
      await loadPeerProfile();
      updateHeaderPeerInfo();
      await connectSdk();
      await loadHistory();
      updatePrimaryButton();
      byId('cp-input').focus();
    } catch (err) {
      toast('初始化失败：' + err.message);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
