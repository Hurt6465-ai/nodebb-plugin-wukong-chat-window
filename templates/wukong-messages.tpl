<div class="wk-page wk-page-messages">
  <div id="wkRootWrap">
    <div id="wk-root">
      <div class="wk-head">
        <div class="wk-head-title">
          <h1>消息</h1>
          <p id="wkMessagesSubtitle">加载中…</p>
        </div>
        <div class="wk-head-actions">
          <button id="wkRefreshBtn" class="wk-btn" type="button">刷新</button>
        </div>
      </div>
      <div class="wk-sc">
        <div class="wk-ph"></div>
        <ul class="wk-vl"></ul>
      </div>
      <div class="wk-em" style="display:none">暂无会话</div>
    </div>
  </div>
</div>

<script>
  window.__WK_MESSAGES_BOOTSTRAP__ = {
    chatPathPrefix: '/messages/u/',
    conversationSyncPath: '/bridge/conversation/sync'
  };
</script>
<script src="/plugins/nodebb-plugin-wukong-chat-window/lib/messages-page.js"></script>
