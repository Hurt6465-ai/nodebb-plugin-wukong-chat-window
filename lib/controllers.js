'use strict';

const config = require('./config');
const wukong = require('./wukong');

const Controllers = {};

Controllers.renderChatApp = async (req, res) => {
  res.render('chat-app', {
    title: '消息',
  });
};

Controllers.renderAdmin = async (req, res) => {
  res.render('admin/plugins/wukong-chat-window', {
    title: 'WuKong Chat Window',
    config,
  });
};

Controllers.bootstrap = async (req, res) => {
  const user = req.user || {};
  res.json({
    ok: true,
    user: {
      uid: user.uid,
      username: user.username,
      userslug: user.userslug,
      picture: user.picture,
    },
    chat: {
      wsPath: config.WK_WS_PATH,
      tokenPath: '/bridge/token',
      historyPath: '/bridge/get-history',
      conversationSyncPath: '/bridge/conversation/sync',
      revokePath: '/bridge/revoke',
      sdkCdnUrl: config.WK_SDK_CDN_URL,
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
    const data = await wukong.syncConversation(loginUid, req.body.version, req.body.msg_count);
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
