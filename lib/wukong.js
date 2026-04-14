'use strict';

const crypto = require('crypto');
const config = require('./config');

function signWukongToken(uid) {
  return crypto.createHash('sha256').update(`wk:${uid}:${config.WK_SECRET_KEY}`).digest('hex');
}

function toWkUid(nodebbUid) {
  return `nbb_${nodebbUid}`;
}

async function postJson(url, payload, timeout = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        token: config.WK_MANAGER_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (err) {
      data = { raw: text };
    }

    if (!res.ok) {
      const error = new Error(`HTTP ${res.status}`);
      error.status = res.status;
      error.response = { status: res.status, data };
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function smartPost(pathList, payload, timeout = 5000) {
  let lastErr = null;
  for (const path of pathList) {
    try {
      return await postJson(`${config.WK_HOST}${path}`, payload, timeout);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

async function ensureWukongUser(nodebbUser) {
  const wkUid = toWkUid(nodebbUser.uid);
  const token = signWukongToken(wkUid);
  const username = nodebbUser.username || `用户${nodebbUser.uid}`;

  try {
    await smartPost(['/v1/user', '/user'], {
      uid: String(wkUid),
      name: String(username),
    }, 3000);
  } catch (err) {
    // 某些版本可能不需要显式建用户，继续走 token 更新兜底
  }

  await smartPost(['/v1/user/token', '/user/token'], {
    uid: String(wkUid),
    token: token,
    device_flag: 1,
    device_level: 1,
  }, 3000);

  return {
    uid: wkUid,
    token,
    username,
  };
}

async function syncHistory(loginUid, channelId, limit = 20, startMessageSeq = 0) {
  return await smartPost(['/v1/channel/messagesync', '/channel/messagesync'], {
    login_uid: String(loginUid),
    channel_id: String(channelId),
    channel_type: 1,
    start_message_seq: parseInt(startMessageSeq, 10) || 0,
    end_message_seq: 0,
    limit: parseInt(limit, 10) || 20,
    pull_mode: 1,
  }, 5000);
}

async function syncConversation(loginUid, version = 0, msgCount = 1) {
  return await smartPost(['/conversation/sync', '/v1/conversation/sync'], {
    uid: String(loginUid),
    version: parseInt(version, 10) || 0,
    msg_count: parseInt(msgCount, 10) || 1,
  }, 5000);
}

async function revokeMessage(operatorUid, body) {
  const payload = {
    uid: String(operatorUid),
    channel_id: String(body.channel_id || ''),
    channel_type: 1,
    message_seq: parseInt(body.message_seq, 10) || 0,
    client_msg_no: body.client_msg_no || '',
  };

  return await smartPost(['/message/revoke', '/v1/message/revoke'], payload, 5000);
}

module.exports = {
  signWukongToken,
  toWkUid,
  ensureWukongUser,
  syncHistory,
  syncConversation,
  revokeMessage,
};
