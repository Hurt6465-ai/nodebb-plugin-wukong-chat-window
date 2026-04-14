'use strict';

const axios = require('axios');
const crypto = require('crypto');
const config = require('./config');

function toWkUid(uid) {
  uid = String(uid || '').trim();
  if (!uid) return '';
  return /^nbb_/.test(uid) ? uid : ('nbb_' + uid);
}

function signWukongToken(uid, secret) {
  return crypto.createHash('sha256').update(`wk:${uid}:${secret}`).digest('hex');
}

async function managerPost(pathList, payload, timeout = 5000) {
  const settings = await config.get();
  const host = String(settings.WK_HOST || '').replace(/\/$/, '');
  const token = String(settings.WK_MANAGER_TOKEN || '');
  if (!host) throw new Error('WK_HOST 未配置');
  if (!token) throw new Error('WK_MANAGER_TOKEN 未配置');

  let lastErr = null;
  for (const path of pathList) {
    try {
      const res = await axios.post(`${host}${path}`, payload, {
        headers: { token },
        timeout,
      });
      return res.data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('悟空管理端请求失败');
}

async function ensureWukongUser(user) {
  const settings = await config.get();
  const uid = toWkUid(user.uid);
  const username = String(user.displayname || user.username || `用户${user.uid}`);
  const token = signWukongToken(uid, String(settings.WK_SECRET_KEY || ''));

  await managerPost(['/v1/user', '/user'], { uid, name: username }).catch(() => null);
  await managerPost(['/v1/user/token', '/user/token'], {
    uid,
    token,
    device_flag: 1,
    device_level: 1,
  }).catch(() => null);

  return { uid, token, username };
}

async function syncHistory(loginUid, channelId, limit, startMessageSeq) {
  return await managerPost(['/v1/channel/messagesync', '/channel/messagesync'], {
    login_uid: String(loginUid),
    channel_id: String(channelId),
    channel_type: 1,
    start_message_seq: parseInt(startMessageSeq, 10) || 0,
    end_message_seq: 0,
    limit: parseInt(limit, 10) || 20,
    pull_mode: 1,
  }, 8000);
}

async function syncConversation(loginUid, version, msgCount) {
  return await managerPost(['/conversation/sync', '/v1/conversation/sync'], {
    uid: String(loginUid),
    version: parseInt(version, 10) || 0,
    msg_count: parseInt(msgCount, 10) || 1,
  }, 8000);
}

async function revokeMessage(operatorUid, body) {
  const payload = Object.assign({
    operator_uid: String(operatorUid),
    login_uid: String(operatorUid),
    channel_type: 1,
  }, body || {});
  return await managerPost(['/message/revoke', '/v1/message/revoke'], payload, 8000);
}

module.exports = {
  toWkUid,
  ensureWukongUser,
  syncHistory,
  syncConversation,
  revokeMessage,
};
