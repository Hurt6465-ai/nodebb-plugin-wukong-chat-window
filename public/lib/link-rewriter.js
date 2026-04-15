'use strict';

define('forum/plugins/wukong-chat-window/link-rewriter', [], function () {
  function rewrite(root) {
    const scope = root || document;
    scope.querySelectorAll('a[href="/chats"], a[href^="/user/"][href$="/chats"]').forEach((anchor) => {
      anchor.setAttribute('href', '/chat-app');
    });
  }

  return {
    init: function () {
      rewrite(document);
      document.addEventListener('click', function () {
        setTimeout(function () { rewrite(document); }, 0);
      });
    },
  };
});

require(['forum/plugins/wukong-chat-window/link-rewriter'], function (mod) {
  if (mod && typeof mod.init === 'function') mod.init();
});
