'use strict';

const meta = require.main.require('./src/meta');

const defaults = {
  WK_HOST: process.env.WK_HOST || 'http://172.17.0.1:5001',
  WK_MANAGER_TOKEN: process.env.WK_MANAGER_TOKEN || '123456',
  WK_SECRET_KEY: process.env.WK_SECRET_KEY || '123456',
  WK_WS_PATH: process.env.WK_WS_PATH || '/wkws/',
  WK_SDK_CDN_URL: process.env.WK_SDK_CDN_URL || 'https://cdn.jsdelivr.net/npm/wukongimjssdk@latest/lib/wukongimjssdk.umd.js',
};

async function get() {
  let settings = {};
  try {
    settings = await meta.settings.get('wukong-chat-window');
  } catch (err) {}
  return Object.assign({}, defaults, settings || {});
}

module.exports = {
  defaults,
  get,
};
