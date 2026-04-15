'use strict';

const controllers = require('./lib/controllers');
const wukong = require('./lib/wukong');

const Plugin = {};

Plugin.init = async ({ router, middleware }) => {
  console.log('[nodebb-plugin-wukong-chat-window] init called');

  router.get('/chat-app', middleware.ensureLoggedIn, middleware.buildHeader, controllers.renderChatApp);
  router.get('/messages', middleware.ensureLoggedIn, middleware.buildHeader, controllers.renderMessagesPage);
  router.get('/messages/u/:uid', middleware.ensureLoggedIn, middleware.buildHeader, controllers.renderChatWindowPage);

  router.get('/admin/plugins/wukong-chat-window', middleware.admin.buildHeader, controllers.renderAdmin);

  router.get('/api/chat-app/bootstrap', middleware.ensureLoggedIn, controllers.bootstrap);
  router.get('/bridge/token', middleware.ensureLoggedIn, controllers.token);
  router.get('/bridge/get-history', middleware.ensureLoggedIn, controllers.getHistory);
  router.post('/bridge/conversation/sync', middleware.ensureLoggedIn, controllers.conversationSync);
  router.post('/bridge/revoke', middleware.ensureLoggedIn, controllers.revoke);
};

Plugin.onUserCreate = async (data) => {
  const user = (data && data.user) || data || {};
  if (!user.uid) return;

  try {
    await wukong.ensureWukongUser(user);
  } catch (err) {
    console.warn('[nodebb-plugin-wukong-chat-window] auto sync user failed:', err.message);
  }
};

module.exports = Plugin;
