(function () {
  'use strict';

  const state = {
    bootstrap: null,
    token: null,
    sdk: null,
    peer: '',
    connected: false,
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
        return JSON.parse(message.payload);
      }
      if (message && message.content && typeof message.content === 'string') {
        return JSON.parse(message.content);
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
      appendMessage(text, fromUid === state.token.uid);
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
    if (!state.peer) {
      alert('请先填写对方 uid，例如 nbb_2');
      return;
    }
    const data = await getJSON(state.bootstrap.chat.historyPath + '?channel_id=' + encodeURIComponent(state.peer) + '&limit=20');
    const list = (((data || {}).data || {}).messages) || data.messages || data.data || data || [];
    byId('wkMessageList').innerHTML = '';
    list.forEach(function (message) {
      const payload = normalizePayload(message);
      const text = payload.text || payload.content || '[历史消息]';
      const mine = String(message.from_uid || message.fromUID || '') === String(state.token.uid);
      appendMessage(text, mine);
    });
  }

  async function syncConversations() {
    const data = await postJSON(state.bootstrap.chat.conversationSyncPath, { version: 0, msg_count: 1 });
    console.log('conversation sync', data);
    alert('会话同步已调用，结果请看控制台');
  }

  async function sendMessage() {
    if (!state.connected || !state.sdk) {
      alert('请先连接');
      return;
    }
    state.peer = String(byId('wkPeerInput').value || '').trim();
    if (!state.peer) {
      alert('请先填写对方 uid，例如 nbb_2');
      return;
    }
    const text = String(byId('wkInput').value || '').trim();
    if (!text) return;

    try {
      const channel = new window.wk.Channel(state.peer, 1);
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
      state.bootstrap = await getJSON((window.__WK_CHAT_BOOTSTRAP__ || {}).bootstrapPath || '/api/chat-app/bootstrap');
      state.token = await getJSON(state.bootstrap.chat.tokenPath);
      byId('wkCurrentUser').textContent = state.bootstrap.user.username + ' (NodeBB uid=' + state.bootstrap.user.uid + ', WK uid=' + state.token.uid + ')';

      byId('wkConnectBtn').addEventListener('click', async function () {
        try {
          await connectSdk();
        } catch (err) {
          setStatus('连接失败：' + err.message);
        }
      });
      byId('wkLoadHistoryBtn').addEventListener('click', async function () {
        state.peer = String(byId('wkPeerInput').value || '').trim();
        await loadHistory();
      });
      byId('wkSyncConversationBtn').addEventListener('click', syncConversations);
      byId('wkSendBtn').addEventListener('click', sendMessage);

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
