'use strict';

const user = require.main.require('./src/user');
const wukong = require('./wukong');

async function getCurrentUser(req) {
  if (!req.uid) {
    return null;
  }

  return await user.getUserFields(req.uid, [
    'uid',
    'username',
    'userslug',
    'picture',
  ]);
}

const controllers = {};

controllers.renderMessagesPage = async (req, res) => {
  const me = await getCurrentUser(req);

  res.render('messages', {
    title: '消息',
    wkCurrentUid: me ? `nbb_${me.uid}` : '',
    wkCurrentUsername: me ? me.username : '',
  });
};

controllers.renderChatWindowPage = async (req, res) => {
  const me = await getCurrentUser(req);

  res.render('chat-window', {
    title: '聊天',
    targetUid: req.params.uid || '',
    wkCurrentUid: me ? `nbb_${me.uid}` : '',
    wkCurrentUsername: me ? me.username : '',
  });
};

controllers.renderChatApp = async (req, res) => {
  const me = await getCurrentUser(req);

  res.render('chat-app', {
    title: '聊天应用',
    wkCurrentUid: me ? `nbb_${me.uid}` : '',
    wkCurrentUsername: me ? me.username : '',
  });
};

controllers.renderAdmin = async (req, res) => {
  res.render('admin/plugins/wukong-chat-window', {
    title: 'WuKong Chat Window',
  });
};

controllers.bootstrap = async (req, res) => {
  try {
    const me = await getCurrentUser(req);
    if (!me) {
      return res.status(401).json({ error: 'not_logged_in' });
    }

    const wkUser = await wukong.ensureWukongUser(me);

    res.json({
      ok: true,
      user: {
        uid: String(me.uid),
        username: me.username,
        userslug: me.userslug,
        picture: me.picture,
      },
      wukong: wkUser,
      routes: {
        messages: '/messages',
        chatApp: '/chat-app',
      },
    });
  } catch (err) {
    res.status(500).json({
      error: err.message || 'bootstrap_failed',
    });
  }
};

controllers.token = async (req, res) => {
  try {
    const me = await getCurrentUser(req);
    if (!me) {
      return res.status(401).json({ error: 'not_logged_in' });
    }

    const wkUser = await wukong.ensureWukongUser(me);

    res.json({
      uid: wkUser.uid,
      token: wkUser.token,
      username: wkUser.username,
      nodebbUid: String(me.uid),
    });
  } catch (err) {
    res.status(500).json({
      error: err.message || 'token_failed',
    });
  }
};

controllers.getHistory = async (req, res) => {
  try {
    const me = await getCurrentUser(req);
    if (!me) {
      return res.status(401).json({ error: 'not_logged_in' });
    }

    const loginUid = `nbb_${me.uid}`;
    const channelId = String(req.query.channel_id || '');
    const limit = parseInt(req.query.limit, 10) || 20;
    const startMessageSeq = parseInt(req.query.start_message_seq, 10) || 0;

    if (!channelId) {
      return res.status(400).json({ error: 'missing_channel_id' });
    }

    const data = await wukong.syncHistory(loginUid, channelId, limit, startMessageSeq);
    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: err.message || 'history_failed',
    });
  }
};

controllers.conversationSync = async (req, res) => {
  try {
    const me = await getCurrentUser(req);
    if (!me) {
      return res.status(401).json({ error: 'not_logged_in' });
    }

    const loginUid = `nbb_${me.uid}`;
    const version = parseInt(req.body.version, 10) || 0;
    const msgCount = parseInt(req.body.msg_count, 10) || 1;

    const data = await wukong.syncConversation(loginUid, version, msgCount);
    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: err.message || 'conversation_sync_failed',
    });
  }
};

controllers.revoke = async (req, res) => {
  try {
    const me = await getCurrentUser(req);
    if (!me) {
      return res.status(401).json({ error: 'not_logged_in' });
    }

    const operatorUid = `nbb_${me.uid}`;
    const data = await wukong.revokeMessage(operatorUid, req.body || {});
    res.json(data);
  } catch (err) {
    res.status(500).json({
      error: err.message || 'revoke_failed',
    });
  }
};

module.exports = controllers;
