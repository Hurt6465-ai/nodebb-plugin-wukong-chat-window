(function () {
  'use strict';

  const state = {
    bootstrap: null,
    token: null,
    sdk: null,
    peerKey: '',
    peerWkUid: '',
    connected: false,
    loadingHistory: false,
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
  function wkUidFromKey(v) {
    v = String(v || '').trim();
    return /^\d+$/.test(v) ? ('nbb_' + v) : v;
  }
  async function getJSON(url, options) {
    const res = await fetch(url, Object.assign({ credentials: 'same-origin' }, options || {}));
    if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
    return await res.json();
  }
  function setStatus(text) {
    const el = byId('wkStatus');
    if (el) el.textContent = text;
  }
  function appendMessage(msg, mine) {
    const list = byId('wkMessageList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'wk-msg ' + (mine ? 'mine' : 'other');
    row.innerHTML = '<div class="wk-bubble">' + esc(msg) + '</div>';
    list.appendChild(row);
    list.scrollTop = list.scrollHeight;
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
  async function connectSdk() {
    if (state.connected) return;
    const wsPath = state.bootstrap.chat.wsPath;
    const protocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const addr = protocol + window.location.host + wsPath;

    await loadSdk(state.bootstrap.chat.sdkCdnUrl);

    const sdk = window.wk.WKSDK.shared();
    sdk.config.uid = state.token.uid;
    sdk.config.token = state.token.token;
    sdk.config.addr = addr;

    sdk.chatManager.addMessageListener(function (message) {
      const payload = normalizePayload(message);
      const text = payload.text || payload.content || '[新消息]';
      const fromUid = String(message.fromUID || message.from_uid || '');
      if (fromUid === state.peerWkUid || fromUid === state.token.uid) {
        appendMessage(text, fromUid === state.token.uid);
      }
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
  async function loadHistory() {
    if (state.loadingHistory) return;
    state.loadingHistory = true;
    try {
      const data = await getJSON(state.bootstrap.chat.historyPath + '?channel_id=' + encodeURIComponent(state.peerWkUid) + '&limit=20');
      const list = (((data || {}).data || {}).messages) || data.messages || data.data || data || [];
      byId('wkMessageList').innerHTML = '';
      list.forEach(function (message) {
        const payload = normalizePayload(message);
        const text = payload.text || payload.content || '[历史消息]';
        const mine = String(message.from_uid || message.fromUID || '') === String(state.token.uid);
        appendMessage(text, mine);
      });
    } finally {
      state.loadingHistory = false;
    }
  }
  async function sendMessage() {
    if (!state.connected || !state.sdk) {
      alert('请先连接');
      return;
    }
    const text = String(byId('wkInput').value || '').trim();
    if (!text) return;
    try {
      const channel = new window.wk.Channel(state.peerWkUid, 1);
      const content = new window.wk.MessageText(text);
      await state.sdk.chatManager.send(content, channel);
      appendMessage(text, true);
      byId('wkInput').value = '';
    } catch (err) {
      alert('发送失败：' + err.message);
    }
  }
  async function boot() {
    try {
      state.peerKey = String((window.__WK_CHAT_BOOTSTRAP__ || {}).peerKey || '').trim();
      state.peerWkUid = wkUidFromKey(state.peerKey);
      state.bootstrap = await getJSON((window.__WK_CHAT_BOOTSTRAP__ || {}).bootstrapPath || '/api/chat-app/bootstrap');
      state.token = await getJSON(state.bootstrap.chat.tokenPath);
      byId('wkCurrentUser').textContent = state.bootstrap.user.username + ' (NodeBB uid=' + state.bootstrap.user.uid + ', WK uid=' + state.token.uid + ')';
      byId('wkPeerLabel').textContent = state.peerWkUid;
      byId('wkChatTitle').textContent = '与 ' + state.peerWkUid + ' 聊天';

      byId('wkConnectBtn').addEventListener('click', async function () {
        try {
          await connectSdk();
          await loadHistory();
        } catch (err) {
          setStatus('连接失败：' + err.message);
        }
      });
      byId('wkLoadHistoryBtn').addEventListener('click', loadHistory);
      byId('wkSendBtn').addEventListener('click', sendMessage);
      byId('wkInput').addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });

      setStatus('已获取 token，点击连接');
    } catch (err) {
      setStatus('初始化失败：' + err.message);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
