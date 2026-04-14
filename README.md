# nodebb-plugin-wukong-chat-window v0.2.0

这是一个可以直接安装到 NodeBB 的 **完整移动端两页式消息插件**：

- `/messages`：会话列表页
- `/messages/u/:uid`：聊天窗口页
- `/chat-app`：兼容旧入口，现在会显示会话列表页

## 这版已经包含什么

- 独立会话列表页
- 独立聊天窗口页
- `/bridge/token`
- `/bridge/get-history`
- `/bridge/conversation/sync`
- `/bridge/revoke`
- `action:user.create` 自动同步用户到悟空（失败不阻塞注册）
- 自动把 `/chats`、`/user/*/chats`、`/chat-app` 链接改到 `/messages`

## 1Panel / Docker 安装

### 可以直接上传“解压后的插件目录”吗？

可以。

你如果已经通过 1Panel 文件管理能进入 NodeBB 容器挂载目录，**直接把整个解压后的插件目录上传到 NodeBB 的 `node_modules/` 下也可以**，不一定非要先上传 zip 再服务器解压。

满足这几个条件就行：

1. 最终目录结构是：

```text
node_modules/nodebb-plugin-wukong-chat-window/
  package.json
  plugin.json
  library.js
  ...
```

2. 上传的位置是 **NodeBB 实际运行目录** 对应的 `node_modules`
3. 上传后执行一次 `./nodebb build`
4. 在 ACP 启用插件
5. 重启 NodeBB

### 推荐安装顺序

1. 用 1Panel 上传整个解压目录到：

```text
/usr/src/app/node_modules/nodebb-plugin-wukong-chat-window
```

> 具体路径以你容器里的 NodeBB 根目录为准。

2. 进入容器执行：

```bash
cd /usr/src/app
./nodebb build
```

3. 去 ACP 启用插件
4. 重启容器
5. 再执行一次 `./nodebb build` 最稳

## 访问地址

```text
/messages
/messages/u/2
/messages/u/nbb_2
```

两种写法都支持：

- 数字 NodeBB uid
- 悟空 uid（如 `nbb_2`）

## 你最可能要改的配置

文件：`lib/config.js`

```js
WK_HOST: 'http://172.17.0.1:5001'
WK_MANAGER_TOKEN: '123456'
WK_SECRET_KEY: '123456'
WK_WS_PATH: '/wkws/'
```

## 自动注册逻辑

- NodeBB 新用户注册成功
- 插件监听 `action:user.create`
- 自动为其生成：`nbb_{uid}`
- 自动向悟空管理端写入用户/token
- 即使注册瞬间失败，用户第一次打开 `/messages` 或 `/messages/u/:uid` 时，`/bridge/token` 也会再次兜底同步


## 备注

v2.2 起已移除 axios 依赖，直接使用 Node.js 内置 fetch，因此不需要在插件目录里单独执行 npm install。
