(function () {
  'use strict';

  const BOOT = window.__WK_CHAT_BOOTSTRAP__ || {};
  const CFG_KEY = 'wk_chat_ui_cfg_v1';
  const BG_KEY = 'wk_chat_bg_v1';
  const LANG_LIST = [
    { n: '中文', f: '🇨🇳' },
    { n: 'English', f: '🇺🇸' },
    { n: 'မြန်မာစာ', f: '🇲🇲' },
    { n: '日本語', f: '🇯🇵' },
    { n: '한국어', f: '🇰🇷' },
    { n: 'ภาษาไทย', f: '🇹🇭' },
    { n: 'Tiếng Việt', f: '🇻🇳' },
    { n: 'Русский', f: '🇷🇺' }
  ];

  const ICON = {
    mic: '<i class="fa fa-microphone"></i>',
    send: '<i class="fa fa-arrow-up"></i>',
    photo: '<i class="fa fa-image"></i>',
    quote: '<i class="fa fa-reply"></i>',
    recall: '<i class="fa fa-undo"></i>',
    trans: '<i class="fa fa-language"></i>',
    more: '<i class="fa fa-ellipsis-v"></i>',
    spinner: '<i class="fa fa-circle-o-notch fa-spin"></i>',
    ai: '<span style="font-weight:900;font-size:13px;background:linear-gradient(45deg,#3b82f6,#8b5cf6);-webkit-background-clip:text;color:transparent;">译</span>'
  };

  const state = {
    bootstrap: null,
    token: null,
    peerKey: String(BOOT.peerKey || '').trim(),
    peerName: String(BOOT.peerName || '').trim(),
    myUid: String(BOOT.myUid || '').trim(),
    peerWkUid: '',
    sdk: null,
    connected: false,
    loadingHistory: false,
    messages: [],
    msgIndex: new Map(),
    unreadCount: 0,
    settingsOpen: false,
    previewOpen: false,
    contextMsg: null,
    quoteTarget: null,
    aiCache: {},
    aiKeys: [],
    cfg: null,
    bgUrl: '',
    mediaRecorder: null,
    mediaStream: null,
    recChunks: [],
    recSending: false,
    currentAudio: new Audio(),
    currentAudioBtn: null,
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
  function safeParseJSON(raw, fallback) {
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  function wkUidFromKey(v) {
    v = String(v || '').trim();
    return /^\d+$/.test(v) ? ('nbb_' + v) : v;
  }
  function loadCfg() {
    const fallback = {
      autoTranslateLastMsg: false,
      sourceLang: '中文',
      targetLang: 'မြန်မာစာ',
      sendTranslateEnabled: false,
      smartReplyEnabled: true,
      voiceMaxDuration: 60,
      ai: {
        proxyPath: '/api/cp-chat-harmony/ai',
        endpoint: '',
        apiKey: '',
        model: 'gpt-4o-mini',
        allowInsecureBrowserKey: false
      }
    };
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      const out = Object.assign({}, fallback, parsed || {});
      out.ai = Object.assign({}, fallback.ai, (parsed && parsed.ai) || {});
      return out;
    } catch (e) {
      return fallback;
    }
  }
  function saveCfg() {
    localStorage.setItem(CFG_KEY, JSON.stringify(state.cfg || {}));
  }
  function loadBg() {
    try {
      state.bgUrl = localStorage.getItem(BG_KEY) || '';
    } catch (e) {
      state.bgUrl = '';
    }
  }
  function saveBg(url) {
    try { localStorage.setItem(BG_KEY, url || ''); } catch (e) {}
    state.bgUrl = url || '';
  }
  function formatTime(ts) {
    const d = new Date(ts || Date.now());
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function formatDateDivider(ts) {
    const d = new Date(ts || Date.now());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.floor((today - msgDay) / 86400000);
    if (diff === 0) return '今天';
    if (diff === 1) return '昨天';
    if (diff === 2) return '前天';
    if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }
  function toast(text) {
    const root = byId('wkChatRoot') || document.body;
    const node = document.createElement('div');
    node.className = 'wk-toast';
    node.textContent = text;
    root.appendChild(node);
    requestAnimationFrame(function () { node.classList.add('show'); });
    setTimeout(function () {
      node.classList.remove('show');
      setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 220);
    }, 1800);
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
  function normalizePayload(message) {
    try {
      if (message && message.payload && typeof message.payload === 'string') {
        const s = message.payload.trim();
        if (s[0] === '{' || s[0] === '[') return JSON.parse(s);
      }
      if (message && message.content && typeof message.content === 'string') {
        const s = message.content.trim();
        if (s[0] === '{' || s[0] === '[') return JSON.parse(s);
      }
      if (message && typeof message.content === 'object') {
        return message.content;
      }
    } catch (err) {}
    return {};
  }
  async function loadSdk(url) {
    return new Promise(function (resolve, reject) {
      if (window.wk && window.wk.WKSDK) return resolve();
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  function createMsgId(message, payload) {
    return String(message.message_id || message.messageID || payload.client_msg_no || payload.clientMsgNo || ('wk_' + Date.now() + '_' + Math.floor(Math.random() * 100000)));
  }
  function upsertMessage(msg) {
    if (!msg || !msg.id) return;
    const prev = state.msgIndex.get(String(msg.id));
    if (prev) {
      Object.assign(prev, msg);
    } else {
      state.messages.push(msg);
      state.msgIndex.set(String(msg.id), msg);
    }
    state.messages.sort(function (a, b) { return Number(a.ts || 0) - Number(b.ts || 0); });
  }
  function createMessageObj(message) {
    const payload = normalizePayload(message);
    const fromUid = String(message.fromUID || message.from_uid || '');
    const mine = fromUid === String(state.token.uid);
    let text = payload.text || payload.content || '';
    let type = 'text';
    let mediaUrl = '';
    let audioUrl = '';
    if ((/^!\[\]\((.+?)\)$/).test(text) || (/^\[图片\]\((.+?)\)$/).test(text)) {
      const m = text.match(/\((.+?)\)$/); type = 'image'; mediaUrl = m ? m[1] : ''; text = '[图片]';
    } else if ((/^\[视频\]\((.+?)\)$/).test(text)) {
      const m = text.match(/\((.+?)\)$/); type = 'video'; mediaUrl = m ? m[1] : ''; text = '[视频]';
    } else if ((/^\[语音消息\]\((.+?)\)$/).test(text)) {
      const m = text.match(/\((.+?)\)$/); type = 'voice'; audioUrl = m ? m[1] : ''; text = '[语音]';
    }
    return {
      id: createMsgId(message, payload),
      clientMsgNo: String(payload.client_msg_no || message.clientMsgNo || message.client_msg_no || ''),
      mine,
      uid: fromUid,
      username: mine ? ((state.bootstrap && state.bootstrap.user && state.bootstrap.user.username) || '我') : (state.peerName || state.peerWkUid),
      userslug: mine ? ((state.bootstrap && state.bootstrap.user && state.bootstrap.user.userslug) || '') : '',
      ts: message.timestamp ? Number(message.timestamp) * 1000 : Date.now(),
      type,
      text,
      html: type === 'text' ? esc(text) : '',
      mediaUrl,
      audioUrl,
      quote: payload.quote || '',
      quoteUser: payload.quoteUser || '',
      recalled: false,
      translation: '',
      translationOpen: false,
      sendState: 'sent',
      raw: message,
    };
  }
  function renderMessageBody(msg) {
    if (msg.recalled) return '<div class="wk-text">此消息已被撤回</div>';
    if (msg.type === 'image') return '<button class="wk-media-thumb" data-act="preview-media"><img src="' + esc(msg.mediaUrl) + '" alt="" /></button>';
    if (msg.type === 'video') return '<button class="wk-media-thumb wk-video" data-act="preview-media"><video src="' + esc(msg.mediaUrl) + '" playsinline muted preload="metadata"></video><span>视频</span></button>';
    if (msg.type === 'voice') {
      return '<button class="wk-voice" data-act="play-voice" data-audio-src="' + esc(msg.audioUrl) + '">' +
        '<span class="wk-play">▶</span><span class="wk-voice-text">语音消息</span><span class="wk-voice-time">' + esc(formatTime(msg.ts)) + '</span>' +
      '</button>';
    }
    let quote = '';
    if (msg.quote) {
      quote = '<div class="wk-quote"><div class="wk-quote-bar"></div><div class="wk-quote-body"><div class="wk-quote-name">' + esc(msg.quoteUser || '消息') + '</div><div class="wk-quote-text">' + esc(msg.quote) + '</div></div></div>';
    }
    let translation = '';
    if (msg.translation && msg.translationOpen) {
      translation = '<div class="wk-translation">✨ ' + esc(msg.translation) + '</div>';
    }
    let sending = '';
    if (msg.mine && msg.sendState === 'sending') sending = '<span class="wk-inline-send">发送中</span>';
    if (msg.mine && msg.sendState === 'failed') sending = '<span class="wk-inline-send fail">失败</span>';
    return quote + '<div class="wk-text">' + (msg.html || esc(msg.text || '')) + sending + '<span class="wk-inline-time">' + esc(formatTime(msg.ts)) + '</span></div>' + translation;
  }
  function render() {
    const list = byId('wkMsgList');
    const main = byId('wkMain');
    if (!list || !main) return;
    const oldTop = main.scrollTop;
    const oldHeight = main.scrollHeight;
    const nearBottom = (oldHeight - oldTop - main.clientHeight) < 80;
    const html = [];
    let prevDay = '';
    let lastPeerTextId = null;
    for (let i = state.messages.length - 1; i >= 0; i -= 1) {
      const m = state.messages[i];
      if (!m.mine && !m.recalled && m.type === 'text') { lastPeerTextId = m.id; break; }
    }
    state.messages.forEach(function (msg, idx) {
      const dayStr = formatDateDivider(msg.ts);
      if (dayStr !== prevDay) {
        html.push('<div class="wk-time-sep"><span>' + esc(dayStr) + '</span></div>');
        prevDay = dayStr;
      }
      const next = state.messages[idx + 1];
      const isLastInGroup = !next || next.mine !== msg.mine || (Number(next.ts || 0) - Number(msg.ts || 0)) > 180000;
      const cls = 'wk-row ' + (msg.mine ? 'mine' : 'other') + (isLastInGroup ? ' is-last' : '') + (!msg.recalled && isLastInGroup && msg.type === 'text' ? ' has-tail' : '');
      const quick = msg.id === lastPeerTextId ? '<button class="wk-quick-trans" data-act="quick-translate" data-id="' + esc(msg.id) + '">' + ICON.ai + '</button>' : '';
      html.push('<div class="' + cls + '" data-id="' + esc(msg.id) + '"><div class="wk-bubble-wrap"><div class="wk-bubble ' + (msg.type !== 'text' ? 'media-shell' : '') + '" data-act="show-menu">' + renderMessageBody(msg) + '</div>' + quick + '</div></div>');
    });
    list.innerHTML = html.join('');
    if (nearBottom) main.scrollTop = main.scrollHeight;
    else main.scrollTop = oldTop;
    updateUnreadBadge();
  }
  function updateUnreadBadge() {
    const badge = byId('wkFabBadge');
    const fab = byId('wkFabBottom');
    if (!badge || !fab) return;
    badge.hidden = !(state.unreadCount > 0);
    if (state.unreadCount > 0) badge.textContent = state.unreadCount > 99 ? '99+' : String(state.unreadCount);
    fab.classList.toggle('show', state.unreadCount > 0);
  }
  async function connectSdk() {
    if (state.connected) return;
    await loadSdk(state.bootstrap.chat.sdkCdnUrl);
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const addr = protocol + window.location.host + state.bootstrap.chat.wsPath;
    const sdk = window.wk.WKSDK.shared();
    sdk.config.uid = state.token.uid;
    sdk.config.token = state.token.token;
    sdk.config.addr = addr;
    sdk.chatManager.addMessageListener(function (message) {
      const payload = normalizePayload(message) || {};
      if (payload.type === 1006 || message.contentType === 1006) {
        const targetId = String(payload.client_msg_no || payload.message_id || '');
        if (!targetId) return;
        state.messages.forEach(function (m) {
          if (String(m.id) === targetId || String(m.clientMsgNo || '') === targetId) {
            m.recalled = true;
            m.text = '此消息已被撤回';
            m.html = '';
          }
        });
        render();
        return;
      }
      const fromUid = String(message.fromUID || message.from_uid || '');
      if (fromUid !== state.peerWkUid && fromUid !== state.token.uid) return;
      const msg = createMessageObj(message);
      const existingPending = msg.clientMsgNo ? state.messages.find(function (m) { return String(m.clientMsgNo || '') === String(msg.clientMsgNo); }) : null;
      if (existingPending) Object.assign(existingPending, msg, { sendState: 'sent' });
      else upsertMessage(msg);
      const main = byId('wkMain');
      const isAtBottom = main ? (main.scrollHeight - main.scrollTop - main.clientHeight < 140) : true;
      if (!msg.mine && !isAtBottom) state.unreadCount += 1;
      if (!msg.mine && state.cfg.autoTranslateLastMsg && msg.type === 'text') executeAIAnalysis(msg);
      render();
    });
    if (sdk.connectionManager && typeof sdk.connectionManager.connect === 'function') {
      await sdk.connectionManager.connect();
    } else if (sdk.connectManager && typeof sdk.connectManager.connect === 'function') {
      await sdk.connectManager.connect();
    }
    state.sdk = sdk;
    state.connected = true;
    setStatus('已连接：' + state.token.uid);
  }
  function setStatus(text) {
    const el = byId('wkStatus');
    if (el) el.textContent = text;
  }
  async function loadHistory(startSeq) {
    if (state.loadingHistory) return;
    state.loadingHistory = true;
    byId('wkTopSpinner').hidden = false;
    try {
      const url = state.bootstrap.chat.historyPath + '?channel_id=' + encodeURIComponent(state.peerWkUid) + '&limit=20' + (startSeq ? '&start_message_seq=' + encodeURIComponent(startSeq) : '');
      const data = await getJSON(url);
      const list = (data && data.data && data.data.messages) || data.messages || data.data || data || [];
      if (!Array.isArray(list)) return;
      list.forEach(function (message) { upsertMessage(createMessageObj(message)); });
      render();
    } finally {
      state.loadingHistory = false;
      byId('wkTopSpinner').hidden = true;
    }
  }
  function buildClientMsgNo() {
    return 'wk_' + Date.now() + '_' + Math.floor(Math.random() * 1000000);
  }
  async function sendText(text, originalText) {
    if (!state.connected || !state.sdk) return toast('消息通道未连接');
    const clientMsgNo = buildClientMsgNo();
    const channel = new window.wk.Channel(state.peerWkUid, 1);
    const content = new window.wk.MessageText(text);
    const quoteTarget = state.quoteTarget;
    if (content.encode) {
      const originalEncode = content.encode.bind(content);
      content.encode = function () {
        let payload = {};
        try {
          const raw = originalEncode();
          payload = typeof raw === 'string' ? safeParseJSON(raw, {}) : (raw || {});
        } catch (e) {}
        payload.text = payload.text || text;
        payload.client_msg_no = clientMsgNo;
        if (originalText) payload.originalText = originalText;
        if (quoteTarget) {
          payload.quote = quoteTarget.text || '';
          payload.quoteUser = quoteTarget.username || '';
        }
        return JSON.stringify(payload);
      };
    }
    content.clientMsgNo = clientMsgNo;
    const tempMsg = {
      id: 'local_' + clientMsgNo,
      clientMsgNo: clientMsgNo,
      mine: true,
      uid: state.token.uid,
      username: state.bootstrap.user.username || '我',
      userslug: state.bootstrap.user.userslug || '',
      ts: Date.now(),
      type: 'text',
      text: originalText || text,
      html: esc(originalText || text),
      quote: quoteTarget ? (quoteTarget.text || '') : '',
      quoteUser: quoteTarget ? (quoteTarget.username || '') : '',
      recalled: false,
      translation: '',
      translationOpen: false,
      sendState: 'sending',
      raw: null,
    };
    upsertMessage(tempMsg);
    render();
    hideQuoteBar();
    try {
      await state.sdk.chatManager.send(content, channel);
    } catch (err) {
      tempMsg.sendState = 'failed';
      render();
      toast('发送失败：' + err.message);
      throw err;
    }
  }
  async function uploadToNodeBB(file, onProgress) {
    return new Promise(function (resolve, reject) {
      const fd = new FormData();
      fd.append('files[]', file, file.name || ('wk_' + Date.now()));
      const xhr = new XMLHttpRequest();
      xhr.open('POST', (window.config && config.relative_path ? config.relative_path : '') + '/api/post/upload');
      xhr.withCredentials = true;
      if (window.config && config.csrf_token) xhr.setRequestHeader('x-csrf-token', config.csrf_token);
      xhr.upload.onprogress = function (e) { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = function () {
        if (xhr.status < 200 || xhr.status >= 300) return reject(new Error('upload failed'));
        const json = safeParseJSON(xhr.responseText, {});
        let url = (((json || {}).response || {}).images || [])[0] ? ((((json || {}).response || {}).images || [])[0].url || '') : '';
        if (!url && json.files && json.files[0]) url = json.files[0].url || json.files[0].path || '';
        if (url && !/^https?:\/\//i.test(url) && url.charAt(0) !== '/') url = '/' + url;
        resolve(url || '');
      };
      xhr.onerror = function () { reject(new Error('network error')); };
      xhr.send(fd);
    });
  }
  async function onPickMedia(files) {
    const wrap = byId('wkUploadProgressWrap');
    const bar = byId('wkUploadProgressBar');
    try {
      for (let i = 0; i < files.length; i += 1) {
        if (wrap) wrap.hidden = false;
        if (bar) bar.style.width = '0%';
        const url = await uploadToNodeBB(files[i], function (pct) { if (bar) bar.style.width = (pct * 100) + '%'; });
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
  function getFlag(langName) {
    for (let i = 0; i < LANG_LIST.length; i += 1) if (LANG_LIST[i].n === langName) return LANG_LIST[i].f;
    return '🌐';
  }
  function syncTranslateBar() {
    byId('wkSrcLangBtn').innerHTML = getFlag(state.cfg.sourceLang) + ' ' + esc(state.cfg.sourceLang);
    byId('wkTgtLangBtn').innerHTML = getFlag(state.cfg.targetLang) + ' ' + esc(state.cfg.targetLang);
    byId('wkSendTranslateToggle').classList.toggle('active', !!state.cfg.sendTranslateEnabled);
  }
  async function rawAIRequest(prompt) {
    const ai = state.cfg.ai || {};
    const proxy = String(ai.proxyPath || '').trim();
    if (proxy) {
      const res = await fetch(proxy, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ model: ai.model, prompt: prompt })
      });
      if (!res.ok) throw new Error('AI代理错误: ' + res.status);
      const proxyData = await res.json();
      return String(proxyData && (proxyData.text || proxyData.content || proxyData.result) || '').trim();
    }
    if (!ai.allowInsecureBrowserKey) throw new Error('未配置 AI 代理');
    if (!ai.endpoint || !ai.apiKey) throw new Error('缺少 AI 直连配置');
    const res = await fetch(ai.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + ai.apiKey },
      body: JSON.stringify({ model: ai.model, temperature: 0.3, messages: [{ role: 'user', content: prompt }] })
    });
    if (!res.ok) throw new Error('AI接口错误: ' + res.status);
    const data = await res.json();
    return (((data || {}).choices || [])[0] || {}).message ? ((((data || {}).choices || [])[0] || {}).message.content || '').trim() : '';
  }
  async function fetchAITranslationOnly(text, from, to) {
    return await rawAIRequest('把下面文本从' + from + '翻译成' + to + '，只返回译文，不要解释。文本: ' + text);
  }
  async function fetchAISmartReplies(text, peerLang, myLang) {
    const prompt = '你是一个聊天助手。对方(' + peerLang + ')发来消息：\'' + text + '\'。\n' +
      '任务1：将其翻译为' + myLang + '。\n' +
      '任务2：站在我的角度，生成3到4个简短的回复气囊，风格各异。\n' +
      '必须严格返回 JSON 字符串，不要 Markdown。格式：{"translation":"...","replies":[{"src":"' + myLang + '","tgt":"' + peerLang + '"}]}' ;
    const raw = await rawAIRequest(prompt);
    try {
      const parsed = JSON.parse(String(raw || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, ''));
      return { translation: parsed.translation || '', replies: Array.isArray(parsed.replies) ? parsed.replies : [] };
    } catch (e) {
      return { translation: String(raw || '').trim(), replies: [] };
    }
  }
  function renderSmartReplies(replies) {
    const bar = byId('wkSmartRepliesBar');
    if (!bar) return;
    let html = '';
    (replies || []).slice(0, 4).forEach(function (item) {
      if (!item || !item.src || !item.tgt) return;
      html += '<button class="wk-sr-pill" data-tgt="' + esc(item.tgt) + '" data-src="' + esc(item.src) + '">' + esc(item.src) + '</button>';
    });
    bar.innerHTML = html;
    bar.hidden = !html;
  }
  async function executeAIAnalysis(msg) {
    if (!msg || msg.recalled || msg.type !== 'text' || msg.mine) return;
    if (msg.translation && msg.translation !== '分析中...') {
      msg.translationOpen = !msg.translationOpen;
      render();
      return;
    }
    const cacheKey = [msg.text, state.cfg.sourceLang, state.cfg.targetLang, state.cfg.smartReplyEnabled ? '1' : '0'].join('|');
    if (state.aiCache[cacheKey]) {
      msg.translation = state.aiCache[cacheKey].translation;
      msg.translationOpen = true;
      if (state.cfg.smartReplyEnabled && state.aiCache[cacheKey].replies) renderSmartReplies(state.aiCache[cacheKey].replies);
      render();
      return;
    }
    msg.translation = '分析中...';
    msg.translationOpen = true;
    render();
    try {
      if (!state.cfg.smartReplyEnabled) {
        msg.translation = (await fetchAITranslationOnly(msg.text, state.cfg.targetLang, state.cfg.sourceLang)) || '翻译为空';
        state.aiCache[cacheKey] = { translation: msg.translation };
      } else {
        const json = await fetchAISmartReplies(msg.text, state.cfg.targetLang, state.cfg.sourceLang);
        msg.translation = json.translation || '翻译完成';
        state.aiCache[cacheKey] = { translation: msg.translation, replies: json.replies || [] };
        renderSmartReplies(json.replies || []);
      }
      state.aiKeys.push(cacheKey);
      if (state.aiKeys.length > 80) {
        const old = state.aiKeys.shift();
        delete state.aiCache[old];
      }
    } catch (e) {
      msg.translation = e && e.message ? e.message : 'AI 接口请求失败';
    }
    render();
  }
  function showQuoteBar(msg) {
    state.quoteTarget = msg;
    byId('wkQuotePreviewName').textContent = msg.username || '未知';
    byId('wkQuotePreviewText').textContent = msg.text || '';
    byId('wkQuotePreview').hidden = false;
  }
  function hideQuoteBar() {
    state.quoteTarget = null;
    byId('wkQuotePreview').hidden = true;
  }
  async function sendByPolicy(text) {
    if (!state.cfg.sendTranslateEnabled) return await sendText(text, null);
    const btn = byId('wkPrimaryBtn');
    const icon = byId('wkPrimaryIcon');
    if (btn) btn.disabled = true;
    if (icon) icon.innerHTML = ICON.spinner;
    try {
      const translated = await fetchAITranslationOnly(text, state.cfg.sourceLang, state.cfg.targetLang);
      await sendText(translated || text, translated ? text : null);
    } catch (e) {
      toast('翻译失败，已发送原文');
      await sendText(text, null);
    } finally {
      if (btn) btn.disabled = false;
      updatePrimaryButton();
    }
  }
  function updatePrimaryButton() {
    const input = byId('wkInput');
    const btn = byId('wkPrimaryBtn');
    const icon = byId('wkPrimaryIcon');
    if (!input || !btn || !icon) return;
    const hasText = !!String(input.value || '').trim();
    btn.classList.toggle('send', hasText);
    icon.innerHTML = hasText ? ICON.send : ICON.mic;
  }
  async function startRecording() {
    if (!navigator.mediaDevices || !window.MediaRecorder) return toast('当前浏览器不支持录音');
    try {
      state.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.recChunks = [];
      const mr = new MediaRecorder(state.mediaStream);
      state.mediaRecorder = mr;
      mr.ondataavailable = function (ev) { if (ev.data && ev.data.size > 0) state.recChunks.push(ev.data); };
      mr.onstop = async function () {
        if (state.mediaStream) state.mediaStream.getTracks().forEach(function (t) { t.stop(); });
        state.mediaStream = null;
        if (!state.recSending || !state.recChunks.length) {
          state.recSending = false;
          return;
        }
        const wrap = byId('wkUploadProgressWrap');
        const bar = byId('wkUploadProgressBar');
        try {
          const blob = new Blob(state.recChunks, { type: mr.mimeType || 'audio/webm' });
          const file = new File([blob], 'voice_' + Date.now() + '.webm', { type: mr.mimeType || 'audio/webm' });
          if (wrap) wrap.hidden = false;
          if (bar) bar.style.width = '0%';
          const url = await uploadToNodeBB(file, function (pct) { if (bar) bar.style.width = (pct * 100) + '%'; });
          if (url) await sendText('[语音消息](' + url + ')');
        } catch (e) {
          toast('语音发送失败');
        } finally {
          state.recSending = false;
          if (wrap) wrap.hidden = true;
          if (bar) bar.style.width = '0%';
        }
      };
      mr.start(120);
      byId('wkRecordingMask').hidden = false;
    } catch (e) {
      toast('录音不可用或被拒绝');
    }
  }
  function stopRecording(send) {
    if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') return;
    state.recSending = !!send;
    byId('wkRecordingMask').hidden = true;
    try { state.mediaRecorder.stop(); } catch (e) {}
  }
  async function recallMessage(id) {
    const msg = state.msgIndex.get(String(id));
    if (!msg || !msg.mine) return;
    const seq = msg.raw ? (msg.raw.messageSeq || msg.raw.message_seq || 0) : 0;
    const clientMsgNo = msg.clientMsgNo || (msg.raw ? (msg.raw.clientMsgNo || msg.raw.client_msg_no || '') : '');
    await postJSON(state.bootstrap.chat.revokePath, {
      channel_id: state.peerWkUid,
      message_seq: seq,
      client_msg_no: clientMsgNo,
      channel_type: 1,
    }).catch(function () { return null; });
    msg.recalled = true;
    msg.text = '此消息已被撤回';
    msg.html = '';
    render();
    toast('撤回成功');
  }
  function deleteMessage(id) {
    state.messages = state.messages.filter(function (m) { return String(m.id) !== String(id); });
    state.msgIndex.delete(String(id));
    render();
    toast('删除成功');
  }
  function openPreview(msg) {
    if (!msg || !msg.mediaUrl) return;
    const body = byId('wkPreviewBody');
    const mask = byId('wkPreviewMask');
    if (!body || !mask) return;
    body.innerHTML = msg.type === 'video'
      ? '<video src="' + esc(msg.mediaUrl) + '" controls autoplay playsinline style="max-width:100%;max-height:84vh;border-radius:18px;"></video>'
      : '<img src="' + esc(msg.mediaUrl) + '" style="max-width:100%;max-height:84vh;border-radius:18px;" />';
    state.previewOpen = true;
    mask.hidden = false;
    requestAnimationFrame(function () { mask.classList.add('show'); });
  }
  function closePreview() {
    state.previewOpen = false;
    const mask = byId('wkPreviewMask');
    const body = byId('wkPreviewBody');
    if (mask) mask.classList.remove('show');
    setTimeout(function () {
      if (!state.previewOpen && mask) mask.hidden = true;
      if (!state.previewOpen && body) body.innerHTML = '';
    }, 180);
  }
  function openSettings() {
    state.settingsOpen = true;
    byId('wkSettingsMask').hidden = false;
  }
  function closeSettings() {
    state.settingsOpen = false;
    byId('wkSettingsMask').hidden = true;
  }
  function syncSettingsUi() {
    byId('wkAiProxy').value = state.cfg.ai.proxyPath || '';
    byId('wkAiEndpoint').value = state.cfg.ai.endpoint || '';
    byId('wkAiKey').value = state.cfg.ai.apiKey || '';
    byId('wkAiModel').value = state.cfg.ai.model || 'gpt-4o-mini';
    byId('wkAiInsecure').checked = !!state.cfg.ai.allowInsecureBrowserKey;
    byId('wkSrSetting').checked = state.cfg.smartReplyEnabled !== false;
    byId('wkAutoTransSetting').checked = !!state.cfg.autoTranslateLastMsg;
    syncTranslateBar();
  }
  function saveSettings() {
    state.cfg.smartReplyEnabled = byId('wkSrSetting').checked;
    state.cfg.autoTranslateLastMsg = byId('wkAutoTransSetting').checked;
    state.cfg.ai.proxyPath = byId('wkAiProxy').value.trim();
    state.cfg.ai.endpoint = byId('wkAiEndpoint').value.trim();
    state.cfg.ai.apiKey = byId('wkAiKey').value.trim();
    state.cfg.ai.model = byId('wkAiModel').value.trim() || 'gpt-4o-mini';
    state.cfg.ai.allowInsecureBrowserKey = byId('wkAiInsecure').checked;
    saveCfg();
    closeSettings();
    toast('配置已保存');
  }
  function applyBackground() {
    const bg = byId('wkBg');
    const mask = byId('wkBgMask');
    if (!bg || !mask) return;
    bg.style.backgroundImage = state.bgUrl ? 'url("' + state.bgUrl + '")' : 'none';
    document.body.classList.toggle('wk-has-bg', !!state.bgUrl);
  }
  function handleBgUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function () {
      saveBg(String(reader.result || ''));
      applyBackground();
      toast('背景图已更新');
    };
    reader.readAsDataURL(file);
  }
  function showContextMenu(e, id) {
    const menu = byId('wkContextMenu');
    const msg = state.msgIndex.get(String(id));
    if (!menu || !msg) return;
    state.contextMsg = msg;
    let html = '<button class="wk-menu-item" data-action="quote">' + ICON.quote + '<span>引用</span></button>' +
      '<button class="wk-menu-item" data-action="translate">' + ICON.trans + '<span>翻译</span></button>';
    if (msg.mine && !msg.recalled) html += '<button class="wk-menu-item danger" data-action="recall">' + ICON.recall + '<span>撤回</span></button>';
    html += '<button class="wk-menu-item danger" data-action="delete">' + '<i class="fa fa-trash"></i><span>删除</span></button>';
    menu.innerHTML = html;
    menu.hidden = false;
    const x = e.clientX || Math.round(window.innerWidth / 2);
    const y = e.clientY || Math.round(window.innerHeight / 2);
    const mw = Math.min(window.innerWidth - 24, 220);
    const mh = msg.mine ? 210 : 164;
    const left = Math.min(Math.max(12, x - mw / 2), window.innerWidth - mw - 12);
    const top = Math.min(Math.max(72, y - mh / 2), window.innerHeight - mh - 16);
    menu.style.width = mw + 'px';
    menu.style.left = Math.round(left) + 'px';
    menu.style.top = Math.round(top) + 'px';
  }
  function bindActions() {
    byId('wkMain').addEventListener('scroll', function () {
      const main = byId('wkMain');
      if (!main) return;
      const distance = main.scrollHeight - main.scrollTop - main.clientHeight;
      if (distance < 80 && state.unreadCount) {
        state.unreadCount = 0;
        updateUnreadBadge();
      }
    }, { passive: true });
    byId('wkMsgList').addEventListener('click', function (e) {
      const quick = e.target.closest('[data-act="quick-translate"]');
      if (quick) {
        const msgQuick = state.msgIndex.get(String(quick.getAttribute('data-id')));
        if (msgQuick) executeAIAnalysis(msgQuick);
        return;
      }
      const row = e.target.closest('.wk-row');
      if (!row) return;
      const id = row.getAttribute('data-id');
      const msg = state.msgIndex.get(String(id));
      const media = e.target.closest('[data-act="preview-media"]');
      const voice = e.target.closest('[data-act="play-voice"]');
      if (media && msg) { openPreview(msg); return; }
      if (voice) {
        const src = voice.getAttribute('data-audio-src') || '';
        if (!src) return;
        if (state.currentAudioBtn === voice) {
          if (!state.currentAudio.paused) {
            state.currentAudio.pause();
            state.currentAudioBtn = null;
            voice.classList.remove('playing');
            voice.querySelector('.wk-play').textContent = '▶';
          } else {
            state.currentAudio.play().catch(function () {});
            voice.classList.add('playing');
            voice.querySelector('.wk-play').textContent = '❚❚';
          }
          return;
        }
        if (state.currentAudioBtn) {
          state.currentAudioBtn.classList.remove('playing');
          state.currentAudioBtn.querySelector('.wk-play').textContent = '▶';
        }
        state.currentAudioBtn = voice;
        state.currentAudio.src = src;
        state.currentAudio.play().then(function () {
          voice.classList.add('playing');
          voice.querySelector('.wk-play').textContent = '❚❚';
        }).catch(function () { toast('语音播放失败'); });
        return;
      }
      showContextMenu(e, id);
    });
    byId('wkContextMenu').addEventListener('click', function (e) {
      const item = e.target.closest('.wk-menu-item');
      if (!item || !state.contextMsg) return;
      const action = item.getAttribute('data-action');
      if (action === 'quote') showQuoteBar(state.contextMsg);
      else if (action === 'translate') executeAIAnalysis(state.contextMsg);
      else if (action === 'recall') recallMessage(state.contextMsg.id);
      else if (action === 'delete') deleteMessage(state.contextMsg.id);
      byId('wkContextMenu').hidden = true;
    });
    document.addEventListener('click', function (e) {
      const menu = byId('wkContextMenu');
      if (menu && !e.target.closest('#wkContextMenu') && !e.target.closest('.wk-bubble')) menu.hidden = true;
      const pop = byId('wkMediaPop');
      if (pop && !pop.hidden && !e.target.closest('#wkMediaPop') && !e.target.closest('#wkMediaBtn')) pop.hidden = true;
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (state.previewOpen) closePreview();
      else if (state.settingsOpen) closeSettings();
      else if (!byId('wkLangMask').hidden) byId('wkLangMask').hidden = true;
    });
    state.currentAudio.addEventListener('ended', function () {
      if (state.currentAudioBtn) {
        state.currentAudioBtn.classList.remove('playing');
        state.currentAudioBtn.querySelector('.wk-play').textContent = '▶';
      }
      state.currentAudioBtn = null;
    });
  }
  function renderRoot() {
    const root = byId('wkStandaloneChatPage');
    if (!root) return;
    const langHtml = LANG_LIST.map(function (item) {
      return '<div class="wk-lang-item" data-lang="' + esc(item.n) + '"><span>' + item.f + '</span><span>' + esc(item.n) + '</span></div>';
    }).join('');
    root.innerHTML = [
      '<div id="wkChatRoot" class="wk-chat-root">',
      '  <div id="wkBg" class="wk-bg"></div>',
      '  <div id="wkBgMask" class="wk-bg-mask"></div>',
      '  <header class="wk-header"><a class="wk-back" href="/messages">←</a><div class="wk-header-center"><div id="wkPeerInfo">加载中...</div><div id="wkStatus">初始化中…</div></div><button id="wkHeaderMore" class="wk-header-more">' + ICON.more + '</button></header>',
      '  <main id="wkMain" class="wk-main"><div id="wkTopSpinner" class="wk-top-spinner" hidden>' + ICON.spinner + ' 加载中...</div><div id="wkMsgList"></div></main>',
      '  <button id="wkFabBottom" class="wk-fab-bottom"><i class="fa fa-angle-down"></i><span id="wkFabBadge" class="wk-fab-badge" hidden>0</span></button>',
      '  <div id="wkContextMenu" class="wk-context-menu" hidden></div>',
      '  <footer class="wk-footer">',
      '    <div class="wk-translate-bar"><button id="wkSrcLangBtn" class="wk-lang-btn"></button><button id="wkLangSwap" class="wk-swap-btn">⇄</button><button id="wkTgtLangBtn" class="wk-lang-btn"></button><button id="wkSendTranslateToggle" class="wk-toggle-ai-send">译</button></div>',
      '    <div id="wkSmartRepliesBar" class="wk-smart-replies" hidden></div>',
      '    <div id="wkQuotePreview" class="wk-quote-preview" hidden><div class="wk-quote-preview-bar"></div><div class="wk-quote-preview-body"><div id="wkQuotePreviewName" class="wk-quote-preview-name"></div><div id="wkQuotePreviewText" class="wk-quote-preview-text"></div></div><button id="wkQuoteClose" class="wk-quote-preview-close">✕</button></div>',
      '    <div class="wk-toolbar">',
      '      <div id="wkUploadProgressWrap" class="wk-progress-wrap" hidden><div id="wkUploadProgressBar" class="wk-progress-bar"></div></div>',
      '      <button id="wkMediaBtn" class="wk-tool-btn">' + ICON.photo + '</button>',
      '      <div class="wk-input-box"><textarea id="wkInput" rows="1" placeholder="发送消息..."></textarea></div>',
      '      <button id="wkPrimaryBtn" class="wk-primary-btn"><span id="wkPrimaryIcon">' + ICON.mic + '</span></button>',
      '      <div id="wkMediaPop" class="wk-media-pop" hidden><button id="wkPickAlbum">选择图片/视频</button><button id="wkPickCamera">拍摄</button></div>',
      '    </div>',
      '  </footer>',
      '  <input id="wkMediaFile" type="file" accept="image/*,video/*" multiple hidden />',
      '  <input id="wkCameraFile" type="file" accept="image/*" capture="environment" hidden />',
      '  <input id="wkBgFile" type="file" accept="image/*" hidden />',
      '  <div id="wkLangMask" class="wk-modal-mask" hidden><div class="wk-modal"><div class="wk-modal-top"><h3>选择语言</h3><button id="wkLangClose">✕</button></div><div id="wkLangGrid" class="wk-lang-grid">' + langHtml + '</div></div></div>',
      '  <div id="wkSettingsMask" class="wk-modal-mask" hidden><div class="wk-modal"><div class="wk-modal-top"><h3>设置</h3></div><div class="wk-settings-section"><label><span>🌐 翻译最新消息</span><input id="wkAutoTransSetting" type="checkbox"></label><label><span>✨ 追问气囊</span><input id="wkSrSetting" type="checkbox"></label></div><button id="wkBgUploadBtn" class="wk-bg-upload">🖼️ 设置背景图片</button><div class="wk-settings-input"><label>AI Proxy URL</label><input id="wkAiProxy" type="text"></div><div class="wk-settings-input"><label>AI URL</label><input id="wkAiEndpoint" type="text"></div><div class="wk-settings-input"><label>API Key</label><input id="wkAiKey" type="password"></div><div class="wk-settings-input"><label>模型</label><input id="wkAiModel" type="text"></div><label class="wk-ai-insecure"><input id="wkAiInsecure" type="checkbox">允许前端直连 AI（不推荐）</label><div class="wk-settings-actions"><button id="wkSettingsCloseBtn" class="secondary">关闭</button><button id="wkSettingsSave">保存配置</button></div></div></div>',
      '  <div id="wkPreviewMask" class="wk-preview-mask" hidden><div id="wkPreviewBody"></div></div>',
      '  <div id="wkRecordingMask" class="wk-modal-mask" hidden><div class="wk-rec-modal"><div class="wk-rec-title">正在录音…</div><div class="wk-rec-actions"><button id="wkRecCancel" class="secondary">取消</button><button id="wkRecSend">发送</button></div></div></div>',
      '</div>'
    ].join('');
  }
  function injectCss() {
    if (byId('wkChatCss')) return;
    const s = document.createElement('style');
    s.id = 'wkChatCss';
    s.textContent = [
      'body{background:#f1f5f9;}',
      '.wk-chat-root{position:fixed;inset:0;z-index:2147483000;overflow:hidden;--footer-h:132px;--cp-bg:#f1f5f9;--cp-primary:#3b82f6;--cp-mine:#e0c3fc;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","SF Pro Display",Inter,sans-serif;background:var(--cp-bg);color:#1f2937;}',
      '.wk-chat-root *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;} .wk-chat-root *::-webkit-scrollbar{display:none !important;}',
      '.wk-bg,.wk-bg-mask{position:absolute;inset:0;pointer-events:none;} .wk-bg{background-size:cover;background-position:center;} .wk-bg-mask{background:rgba(241,245,249,.85);backdrop-filter:blur(12px);}',
      '.wk-header{position:absolute;left:0;right:0;top:0;z-index:20;height:calc(52px + env(safe-area-inset-top));padding:env(safe-area-inset-top) 12px 8px;display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.72);backdrop-filter:blur(10px);}',
      '.wk-back,.wk-header-more{border:0;background:transparent;color:#374151;text-decoration:none;font-size:22px;line-height:1;padding:6px 4px;min-width:32px;text-align:center;}',
      '.wk-header-center{position:absolute;left:50%;bottom:8px;transform:translateX(-50%);text-align:center;max-width:70%;}',
      '#wkPeerInfo{font-size:17px;font-weight:800;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} #wkStatus{font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.wk-main{position:absolute;left:0;right:0;top:calc(52px + env(safe-area-inset-top));bottom:calc(var(--footer-h) + env(safe-area-inset-bottom));overflow-y:auto;overflow-x:hidden;padding:10px 8px 20px;z-index:10;-webkit-overflow-scrolling:touch;}',
      '.wk-top-spinner{display:flex;align-items:center;justify-content:center;gap:8px;font-size:13px;color:#94a3b8;padding:10px 0;}',
      '.wk-time-sep{display:flex;justify-content:center;margin:16px 0 10px;} .wk-time-sep span{background:rgba(0,0,0,.12);color:#fff;font-size:11px;font-weight:500;padding:4px 10px;border-radius:12px;backdrop-filter:blur(4px);}',
      '.wk-row{display:flex;align-items:flex-end;justify-content:flex-start;padding:2px 0;} .wk-row.mine{justify-content:flex-end;} .wk-bubble-wrap{max-width:78%;min-width:40px;position:relative;} .wk-bubble{position:relative;padding:6px 10px 8px;font-size:15.5px;line-height:1.45;word-break:break-word;cursor:pointer;border-radius:18px 19px 13px 18px;} .wk-row.other .wk-bubble{background:#fff;color:#000;} .wk-row.mine .wk-bubble{background:var(--cp-mine);color:#111;} .wk-row.other.has-tail .wk-bubble{border-bottom-left-radius:0;} .wk-row.mine.has-tail .wk-bubble{border-bottom-right-radius:4px;}',
      '.wk-row.other.has-tail .wk-bubble::before{content:"";position:absolute;bottom:0;left:-8px;width:20px;height:10px;background:#fff;border-bottom-right-radius:16px 14px;} .wk-row.other.has-tail .wk-bubble::after{content:"";position:absolute;bottom:0;left:-12px;width:12px;height:20px;background:var(--cp-bg);border-bottom-right-radius:10px;}',
      '.wk-row.mine.has-tail .wk-bubble::before{content:"";position:absolute;bottom:0;right:-12px;width:28px;height:19px;background:var(--cp-mine);border-bottom-left-radius:18px 18px;} .wk-row.mine.has-tail .wk-bubble::after{content:"";position:absolute;bottom:0;right:-12px;width:12px;height:20px;background:var(--cp-bg);border-bottom-left-radius:10px;}',
      '.wk-bubble.media-shell{padding:0;background:transparent !important;box-shadow:none;border-radius:8px !important;overflow:hidden;} .wk-bubble.media-shell::before,.wk-bubble.media-shell::after{display:none !important;}',
      '.wk-text{white-space:pre-wrap;} .wk-inline-time{float:right;margin:12px 0 0 6px;font-size:10px;opacity:.45;font-variant-numeric:tabular-nums;line-height:1.45;} .wk-inline-send{float:right;margin:12px 6px 0 6px;font-size:10px;color:#64748b;} .wk-inline-send.fail{color:#ef4444;}',
      '.wk-quote{display:flex;gap:0;background:rgba(59,130,246,.08);border-radius:8px;margin-bottom:6px;overflow:hidden;} .wk-row.mine .wk-quote{background:rgba(0,0,0,.06);} .wk-quote-bar{width:3px;min-width:3px;background:var(--cp-primary);} .wk-quote-body{padding:5px 10px;min-width:0;overflow:hidden;} .wk-quote-name{font-size:12px;font-weight:600;color:var(--cp-primary);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .wk-row.mine .wk-quote-name{color:rgba(0,0,0,.55);} .wk-quote-text{font-size:13px;color:rgba(0,0,0,.55);line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;}',
      '.wk-media-thumb{padding:0;border:0;background:transparent;position:relative;display:block;} .wk-media-thumb img,.wk-media-thumb video{display:block;width:200px;max-height:280px;border-radius:8px;object-fit:cover;object-position:top;background:#e2e8f0;} .wk-video span{position:absolute;right:6px;bottom:6px;font-size:10px;color:#fff;background:rgba(0,0,0,.6);border-radius:8px;padding:2px 6px;}',
      '.wk-voice{display:flex;align-items:center;gap:8px;min-width:120px;border:0;background:transparent;cursor:pointer;padding:0;color:inherit;} .wk-play{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;box-shadow:0 1px 3px rgba(0,0,0,.1);flex-shrink:0;font-size:12px;background:#f1f5f9;color:#2563eb;} .wk-voice-text{font-size:14px;font-weight:600;} .wk-voice-time{margin-left:auto;font-size:10px;opacity:.45;}',
      '.wk-translation{margin-top:6px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.7);font-size:13px;color:#475569;}',
      '.wk-quick-trans{position:absolute;right:-8px;bottom:-10px;width:28px;height:28px;border-radius:50%;border:1px solid rgba(0,0,0,.04);background:#fff;display:grid;place-items:center;box-shadow:0 4px 10px rgba(0,0,0,.08);}',
      '.wk-footer{position:absolute;left:0;right:0;bottom:0;z-index:30;padding:0 12px max(12px,env(safe-area-inset-bottom));background:linear-gradient(to top,rgba(255,255,255,.95),rgba(255,255,255,.8),transparent);display:flex;flex-direction:column;gap:6px;}',
      '.wk-translate-bar{max-width:100%;margin:2px 4px 0;display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border:1px solid rgba(255,255,255,.6);border-radius:20px;background:rgba(255,255,255,.85);backdrop-filter:blur(8px);box-shadow:0 1px 6px rgba(0,0,0,.04);}',
      '.wk-lang-btn{background:transparent;border:none;font-size:12px;font-weight:600;color:#374151;cursor:pointer;padding:2px 6px;border-radius:12px;} .wk-swap-btn{border:none;background:transparent;color:#9ca3af;font-size:13px;cursor:pointer;padding:0 4px;} .wk-toggle-ai-send{position:relative;border:none;background:transparent;color:#9ca3af;font-size:14px;cursor:pointer;padding:4px 4px 4px 14px;border-radius:50%;display:flex;align-items:center;margin-left:4px;border-left:1px solid #e5e7eb;} .wk-toggle-ai-send::before{content:"";position:absolute;left:4px;top:50%;transform:translateY(-50%);width:5px;height:5px;border-radius:50%;background:#9ca3af;} .wk-toggle-ai-send.active{color:var(--cp-primary);} .wk-toggle-ai-send.active::before{background:#22c55e;box-shadow:0 0 4px #22c55e;}',
      '.wk-smart-replies{display:flex;gap:8px;overflow-x:auto;padding:4px 4px;} .wk-sr-pill{flex-shrink:0;background:#e0e7ff;color:#4338ca;padding:6px 12px;border-radius:16px;font-size:13px;font-weight:500;cursor:pointer;border:1px solid rgba(0,0,0,.05);white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,.05);}',
      '.wk-quote-preview{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.92);backdrop-filter:blur(6px);border-radius:12px;padding:6px 10px;margin:0 4px 6px;border:1px solid rgba(0,0,0,.06);font-size:13px;color:#4b5563;} .wk-quote-preview-bar{width:3px;min-height:28px;background:var(--cp-primary);border-radius:3px;flex-shrink:0;} .wk-quote-preview-body{flex:1;min-width:0;overflow:hidden;} .wk-quote-preview-name{font-size:11px;font-weight:600;color:var(--cp-primary);} .wk-quote-preview-text{font-size:12px;color:#6b7280;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;} .wk-quote-preview-close{border:none;background:none;font-size:16px;color:#9ca3af;cursor:pointer;padding:0 4px;flex-shrink:0;}',
      '.wk-toolbar{position:relative;display:flex;align-items:flex-end;padding:6px;border:1px solid rgba(0,0,0,.08);border-radius:28px;background:rgba(255,255,255,.95);box-shadow:0 4px 15px rgba(0,0,0,.06);min-height:50px;} .wk-progress-wrap{position:absolute;left:16px;right:16px;top:-5px;height:4px;background:rgba(0,0,0,.06);border-radius:4px;overflow:hidden;pointer-events:none;} .wk-progress-bar{height:100%;width:0;background:#3b82f6;transition:width .1s linear;}',
      '.wk-tool-btn{width:36px;height:36px;border:none;background:transparent;color:#6b7280;cursor:pointer;display:grid;place-items:center;flex-shrink:0;border-radius:50%;margin-bottom:2px;} .wk-input-box{flex:1;min-width:0;display:flex;align-items:center;} .wk-input-box textarea{width:100%;min-height:36px;max-height:120px;border:none;padding:8px 4px;margin:2px 0;font-size:15px;outline:none;background:transparent;color:#1f2937;resize:none;overflow-y:auto;font-family:inherit;line-height:20px;} .wk-primary-btn{width:38px;height:38px;border:none;border-radius:50%;color:#6b7280;cursor:pointer;display:grid;place-items:center;background:transparent;flex-shrink:0;margin-bottom:1px;} .wk-primary-btn.send{background:#3b82f6;color:#fff;box-shadow:0 2px 8px rgba(37,99,235,.3);}',
      '.wk-media-pop{position:absolute;bottom:70px;left:20px;background:#fff;border-radius:16px;padding:8px;box-shadow:0 5px 20px rgba(0,0,0,.15);z-index:40;} .wk-media-pop button{width:100%;background:none;border:none;padding:12px;text-align:left;font-size:15px;}',
      '.wk-context-menu{position:fixed;z-index:2147483005;background:#fff;border-radius:12px;box-shadow:0 5px 25px rgba(0,0,0,.15);padding:6px;min-width:120px;} .wk-menu-item{width:100%;padding:10px 14px;font-size:14.5px;color:#374151;cursor:pointer;border-radius:8px;display:flex;align-items:center;gap:10px;border:none;background:none;text-align:left;} .wk-menu-item:hover{background:#f3f4f6;} .wk-menu-item.danger{color:#ef4444;}',
      '.wk-modal-mask{position:absolute;inset:0;z-index:50;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px);padding:20px;} .wk-modal{width:100%;max-width:420px;max-height:86vh;overflow-y:auto;border-radius:24px;background:#fff;padding:24px 16px;box-shadow:0 10px 40px rgba(0,0,0,.2);} .wk-modal-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;} .wk-modal-top h3{margin:0;font-size:18px;}',
      '.wk-lang-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;} .wk-lang-item{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:16px;background:#f8fafc;border:1px solid #e2e8f0;cursor:pointer;font-size:15px;color:#334155;}',
      '.wk-settings-section{display:flex;gap:12px;margin-bottom:12px;} .wk-settings-section label{flex:1;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;padding:10px;border-radius:12px;border:1px solid #e2e8f0;font-size:13px;cursor:pointer;} .wk-bg-upload{width:100%;padding:10px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:12px;cursor:pointer;font-size:14px;margin-bottom:12px;} .wk-settings-input{margin-bottom:8px;} .wk-settings-input label{display:block;font-size:12px;color:#64748b;margin-bottom:4px;} .wk-settings-input input{width:100%;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;} .wk-ai-insecure{display:flex;gap:8px;align-items:center;margin-bottom:16px;font-size:12px;color:#64748b;} .wk-settings-actions{display:flex;gap:12px;} .wk-settings-actions button,.wk-rec-actions button{flex:1;padding:12px;border-radius:12px;font-weight:bold;font-size:15px;cursor:pointer;border:none;background:#3b82f6;color:#fff;} .wk-settings-actions .secondary,.wk-rec-actions .secondary{background:#f1f5f9;color:#475569;border:1px solid #cbd5e1;}',
      '.wk-preview-mask{position:absolute;inset:0;z-index:2147483010;background:rgba(0,0,0,.9);display:flex;align-items:center;justify-content:center;transition:background-color .25s ease;} .wk-fab-bottom{position:absolute;right:14px;bottom:calc(var(--footer-h) + 20px);z-index:25;width:42px;height:42px;border-radius:50%;border:none;background:rgba(15,23,42,.72);color:#fff;display:grid;place-items:center;box-shadow:0 4px 14px rgba(0,0,0,.18);opacity:0;pointer-events:none;transition:all .2s ease;} .wk-fab-bottom.show{opacity:1;pointer-events:auto;} .wk-fab-badge{position:absolute;right:-2px;top:-2px;min-width:18px;height:18px;padding:0 4px;background:#ef4444;border-radius:999px;font-size:11px;display:flex;align-items:center;justify-content:center;}',
      '.wk-toast{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(.94);z-index:2147483650;background:rgba(15,23,42,.78);color:#fff;padding:10px 18px;border-radius:999px;font-size:14px;font-weight:700;opacity:0;transition:all .18s ease;pointer-events:none;} .wk-toast.show{opacity:1;transform:translate(-50%,-50%) scale(1);}',
      '.wk-rec-modal{width:100%;max-width:320px;border-radius:20px;background:#fff;padding:20px;box-shadow:0 10px 40px rgba(0,0,0,.2);} .wk-rec-title{text-align:center;font-size:18px;font-weight:800;margin-bottom:16px;} .wk-rec-actions{display:flex;gap:12px;}',
      '@media (max-width:420px){.wk-main{padding:10px 6px 20px;}.wk-bubble-wrap{max-width:82%;}.wk-media-thumb img,.wk-media-thumb video{width:176px;max-height:240px;}}'
    ].join('');
    document.head.appendChild(s);
  }
  async function boot() {
    try {
      state.cfg = loadCfg();
      loadBg();
      state.peerWkUid = wkUidFromKey(state.peerKey);
      injectCss();
      renderRoot();
      applyBackground();
      syncSettingsUi();
      byId('wkPeerInfo').textContent = state.peerName || state.peerWkUid || '聊天';
      state.bootstrap = await getJSON(BOOT.bootstrapPath || '/api/chat-app/bootstrap');
      state.token = await getJSON(state.bootstrap.chat.tokenPath);
      state.myUid = String(state.myUid || state.bootstrap.user.uid || '');
      await connectSdk();
      await loadHistory();
      bindActions();
      byId('wkInput').addEventListener('input', function () {
        this.style.height = '36px';
        this.style.height = Math.min(this.scrollHeight, 132) + 'px';
        updatePrimaryButton();
      });
      byId('wkInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          const text = String(this.value || '').trim();
          if (text) sendByPolicy(text).then(function () { byId('wkInput').value = ''; updatePrimaryButton(); byId('wkInput').style.height = '36px'; });
        }
      });
      byId('wkPrimaryBtn').addEventListener('click', function () {
        const text = String(byId('wkInput').value || '').trim();
        if (text) {
          sendByPolicy(text).then(function () { byId('wkInput').value = ''; updatePrimaryButton(); byId('wkInput').style.height = '36px'; });
        } else if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') {
          startRecording();
        } else {
          stopRecording(true);
        }
      });
      byId('wkMediaBtn').addEventListener('click', function (e) { e.stopPropagation(); byId('wkMediaPop').hidden = !byId('wkMediaPop').hidden; });
      byId('wkPickAlbum').addEventListener('click', function () { byId('wkMediaPop').hidden = true; byId('wkMediaFile').click(); });
      byId('wkPickCamera').addEventListener('click', function () { byId('wkMediaPop').hidden = true; byId('wkCameraFile').click(); });
      byId('wkMediaFile').addEventListener('change', function (e) { onPickMedia(Array.prototype.slice.call(e.target.files || [])); e.target.value = ''; });
      byId('wkCameraFile').addEventListener('change', function (e) { onPickMedia(Array.prototype.slice.call(e.target.files || [])); e.target.value = ''; });
      byId('wkQuoteClose').addEventListener('click', hideQuoteBar);
      byId('wkFabBottom').addEventListener('click', function () { state.unreadCount = 0; updateUnreadBadge(); byId('wkMain').scrollTo({ top: byId('wkMain').scrollHeight, behavior: 'smooth' }); });
      byId('wkSrcLangBtn').addEventListener('click', function () { byId('wkLangMask').dataset.for = 'source'; byId('wkLangMask').hidden = false; });
      byId('wkTgtLangBtn').addEventListener('click', function () { byId('wkLangMask').dataset.for = 'target'; byId('wkLangMask').hidden = false; });
      byId('wkLangSwap').addEventListener('click', function () { const a = state.cfg.sourceLang; state.cfg.sourceLang = state.cfg.targetLang; state.cfg.targetLang = a; saveCfg(); syncTranslateBar(); });
      byId('wkSendTranslateToggle').addEventListener('click', function () { state.cfg.sendTranslateEnabled = !state.cfg.sendTranslateEnabled; saveCfg(); syncTranslateBar(); toast(state.cfg.sendTranslateEnabled ? '发送翻译已开启' : '发送翻译已关闭'); });
      byId('wkLangMask').addEventListener('click', function (e) { if (e.target === this) this.hidden = true; });
      byId('wkLangClose').addEventListener('click', function () { byId('wkLangMask').hidden = true; });
      byId('wkLangGrid').addEventListener('click', function (e) {
        const item = e.target.closest('.wk-lang-item');
        if (!item) return;
        const lang = item.getAttribute('data-lang');
        if (byId('wkLangMask').dataset.for === 'source') state.cfg.sourceLang = lang; else state.cfg.targetLang = lang;
        saveCfg();
        syncTranslateBar();
        byId('wkLangMask').hidden = true;
      });
      byId('wkHeaderMore').addEventListener('click', openSettings);
      byId('wkSettingsMask').addEventListener('click', function (e) { if (e.target === this) closeSettings(); });
      byId('wkSettingsCloseBtn').addEventListener('click', closeSettings);
      byId('wkSettingsSave').addEventListener('click', saveSettings);
      byId('wkBgUploadBtn').addEventListener('click', function () { byId('wkBgFile').click(); });
      byId('wkBgFile').addEventListener('change', function (e) { handleBgUpload((e.target.files || [])[0]); e.target.value = ''; });
      byId('wkPreviewMask').addEventListener('click', function (e) { if (e.target === this) closePreview(); });
      byId('wkRecCancel').addEventListener('click', function () { stopRecording(false); });
      byId('wkRecSend').addEventListener('click', function () { stopRecording(true); });
      byId('wkSmartRepliesBar').addEventListener('click', function (e) {
        const pill = e.target.closest('.wk-sr-pill');
        if (!pill) return;
        const input = byId('wkInput');
        input.value = pill.getAttribute('data-tgt') || pill.getAttribute('data-src') || '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
      });
      updatePrimaryButton();
      setStatus('已连接：' + state.token.uid);
    } catch (err) {
      setStatus('初始化失败：' + err.message);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
