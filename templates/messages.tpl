<div class="wk-page wk-page-messages">
  <div class="wk-shell wk-messages-shell">
    <header class="wk-page-header">
      <div>
        <h1>消息</h1>
        <p id="wkMessagesSubtitle">正在同步会话列表…</p>
      </div>
    </header>

    <section class="wk-card wk-messages-card">
      <div id="wkMessagesRoot" class="wkMessagesRoot">
        <div class="wk-loading">加载中…</div>
      </div>
    </section>
  </div>
</div>

<script>
  window.__WK_MESSAGES_BOOTSTRAP__ = {
    bootstrapPath: '/api/chat-app/bootstrap'
  };
</script>
<script src="/plugins/nodebb-plugin-wukong-chat-window/lib/messages-page.js"></script>
