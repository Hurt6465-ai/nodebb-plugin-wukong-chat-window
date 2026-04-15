<div class="wk-page wk-page-chat">
  <div class="wk-shell wk-chat-shell">
    <header class="wk-chat-topbar">
      <a class="wk-back-link" href="/messages">← 返回</a>
      <div class="wk-chat-headings">
        <h1 id="wkChatTitle">聊天</h1>
        <p id="wkStatus">初始化中…</p>
      </div>
    </header>

    <section class="wk-card wk-chat-card">
      <div class="wk-chat-meta">
        <div id="wkCurrentUser"></div>
        <div>对方：<span id="wkPeerLabel"></span></div>
      </div>

      <div id="wkMessageList" class="wkMessageList"></div>

      <div class="wkComposer">
        <textarea id="wkInput" placeholder="输入消息…"></textarea>
        <div class="wkComposerActions">
          <button id="wkConnectBtn" type="button">连接</button>
          <button id="wkLoadHistoryBtn" type="button">历史</button>
          <button id="wkSendBtn" type="button">发送</button>
        </div>
      </div>
    </section>
  </div>
</div>

<script>
  window.__WK_CHAT_BOOTSTRAP__ = {
    bootstrapPath: '/api/chat-app/bootstrap',
    peerKey: '{peerKey}'
  };
</script>
<script src="/plugins/nodebb-plugin-wukong-chat-window/lib/chat-page.js"></script>
