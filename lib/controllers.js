'use strict';

const user = require.main.require('./src/user');
const config = require('./config');
const wukong = require('./wukong');

const Controllers = {};

Controllers.renderMessagesPage = async (req, res) => {
  res.render('messages', {
    title: '消息',
  });
};

Controllers.renderChatWindowPage = async (req, res) => {
  const peerKey = String((req.params && req.params.uid) || '');
  let peerName = peerKey || '聊天';
  if (/^\d+$/.test(peerKey)) {
    try {
      const fields = await user.getUserFields(peerKey, ['uid', 'username', 'displayname']);
      peerName = (fields && (fields.displayname || fields.username)) || peerName;
    } catch (err) {}
  }
  res.render('chat-window', {
    title: peerName,
    peerKey,
    peerName,
    myUid: String(req.uid || ''),
  });
};

Controllers.renderAdmin = async (req, res) => {
  const settings = await config.get();
  res.render('admin/plugins/wukong-chat-window', {
    title: 'Wukong Chat Window',
    settings,
    settingsJson: JSON.stringify(settings, null, 2),
  });
};

Controllers.bootstrap = async (req, res) => {
  const settings = await config.get();
  const current = req.user || {};
  res.json({
    ok: true,
    user: {
      uid: current.uid,
      username: current.username,
      userslug: current.userslug,
      picture: current.picture,
    },
    chat: {
      messagesPath: '/messages',
      chatPathPrefix: '/messages/u/',
      wsPath: settings.WK_WS_PATH,
      tokenPath: '/bridge/token',
      historyPath: '/bridge/get-history',
      conversationSyncPath: '/bridge/conversation/sync',
      revokePath: '/bridge/revoke',
      sdkCdnUrl: settings.WK_SDK_CDN_URL,
    },
  });
};

Controllers.token = async (req, res) => {
  try {
    const data = await wukong.ensureWukongUser(req.user);
    res.json({ ok: true, ...data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
};

Controllers.getHistory = async (req, res) => {
  try {
    const loginUid = wukong.toWkUid(req.user.uid);
    const channelId = String(req.query.channel_id || req.query.peer || '');
    const limit = req.query.limit || 20;
    const startMessageSeq = req.query.start_message_seq || 0;
    if (!channelId) {
      return res.status(400).json({ ok: false, error: 'missing channel_id' });
    }
    const data = await wukong.syncHistory(loginUid, channelId, limit, startMessageSeq);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, detail: err.response && err.response.data ? err.response.data : null });
  }
};

Controllers.conversationSync = async (req, res) => {
  try {
    const loginUid = wukong.toWkUid(req.user.uid);
    const data = await wukong.syncConversation(loginUid, req.body && req.body.version, req.body && req.body.msg_count);
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, detail: err.response && err.response.data ? err.response.data : null });
  }
};

Controllers.revoke = async (req, res) => {
  try {
    const operatorUid = wukong.toWkUid(req.user.uid);
    const data = await wukong.revokeMessage(operatorUid, req.body || {});
    res.json(data);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message, detail: err.response && err.response.data ? err.response.data : null });
  }
};

module.exports = Controllers;
