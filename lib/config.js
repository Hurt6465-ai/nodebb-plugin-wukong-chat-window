'use strict';

module.exports = {
  // 直接按你提供的值预填了。后续如果地址或 token 变了，再改这里即可。
  WK_HOST: process.env.WK_HOST || 'http://172.17.0.1:5001',
  WK_MANAGER_TOKEN: process.env.WK_MANAGER_TOKEN || '123456',
  WK_SECRET_KEY: process.env.WK_SECRET_KEY || '123456',
  WK_WS_PATH: process.env.WK_WS_PATH || '/wkws/',
  WK_SDK_CDN_URL: process.env.WK_SDK_CDN_URL || 'https://cdn.jsdelivr.net/npm/wukongimjssdk@latest/lib/wukongimjssdk.umd.js'
};
