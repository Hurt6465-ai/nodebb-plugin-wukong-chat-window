<div class="wk-chat-page">
  <div class="wk-chat-shell">
    <header class="wk-chat-header">
      <div>
        <h1>独立聊天窗口</h1>
        <p>NodeBB + WuKongIM 同源聊天页</p>
      </div>
      <a href="/" class="btn btn-light">返回论坛</a>
    </header>

    <section class="wk-chat-layout">
      <aside class="wk-side-card">
        <div class="wk-field">
          <label>当前 NodeBB 用户</label>
          <div id="wkCurrentUser" class="wk-readonly">加载中…</div>
        </div>
        <div class="wk-field">
          <label>对方 uid（悟空侧）</label>
          <input id="wkPeerInput" class="form-control" placeholder="例如 nbb_2" />
        </div>
        <div class="wk-actions">
          <button id="wkConnectBtn" class="btn btn-primary">连接</button>
          <button id="wkLoadHistoryBtn" class="btn btn-light">历史</button>
        </div>
        <div class="wk-actions">
          <button id="wkSyncConversationBtn" class="btn btn-light">会话同步</button>
        </div>
        <div class="wk-status" id="wkStatus">未连接</div>
      </aside>

      <main class="wk-main-card">
        <div id="wkMessageList" class="wk-message-list"></div>
        <div class="wk-composer">
          <textarea id="wkInput" class="form-control" rows="3" placeholder="输入消息"></textarea>
          <div class="wk-actions right">
            <button id="wkSendBtn" class="btn btn-primary">发送</button>
          </div>
        </div>
      </main>
    </section>
  </div>
</div>
<script>
  window.__WK_CHAT_BOOTSTRAP__ = {
    bootstrapPath: '/api/chat-app/bootstrap'
  };
</script>
<script src="/plugins/nodebb-plugin-wukong-chat-window/lib/chat-page.js"></script>
