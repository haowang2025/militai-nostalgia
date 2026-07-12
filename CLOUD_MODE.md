# 网易云模式：本地与 Cloudflare 部署

`cloud` 分支新增 `/nostalgia/cloud`。前端始终只请求同源 `/api/*`：本地由 Vite 转发到 `127.0.0.1:3000`，线上由 Cloudflare Pages Function 转发到受保护的 NCM API。

## 本地运行

### 1. 启动 NeteaseCloudMusicApi

在本机的 `NeteaseCloudMusicApi-master` 仓库完成这些安全改动：

1. `server.js` 删除成功和异常分支的 `res.append('Set-Cookie', ...)`。
2. CORS 改为 `Access-Control-Allow-Credentials: false`，Origin 使用固定配置或 `*`，不反射任意 Origin。
3. `app.js` 使用 `serveNcmApi({ checkVersion: false })`。
4. `package.json` 增加：

```json
"start:local": "HOST=127.0.0.1 node app.js"
```

5. 为实时频谱增加 `/audio-proxy` 流式代理，且只允许 `*.music.126.net` 与 `*.163.com`，禁止任意 URL，避免 SSRF。

启动：

```bash
npm run start:local
```

API 应只监听：

```txt
http://127.0.0.1:3000
```

### 2. 启动前端

```bash
npm install
npm run dev
```

Vite 已将 `/api/*` 转发到本地 NCM API，并移除 `/api` 前缀。打开：

```txt
http://localhost:5173/nostalgia/cloud
```

## 功能

- `/cloudsearch`：搜歌。
- `/song/detail`：歌曲信息与封面。
- `/song/url/v1`：获取临时播放 URL；URL 只保存在 React 内存中，不落 localStorage，也不写导出文件。
- `/lyric`：解析 LRC；保存 Moment 时写入 `anchor_lyric`。
- `/comment/music`：展示热评 Crowd，与私人 Moment 分开。
- `/login/qr/key` → `/login/qr/create` → `/login/qr/check`：扫码登录。
- `/login/status`：启动时恢复并校验会话。
- `/logout`：退出并删除本地 token。

所有 NCM 请求自动追加：

```txt
timestamp=<当前毫秒>
noCookie=1
cookie=<仅 MUSIC_U 和 __csrf，已登录时>
```

`timestamp` 用于绕过 NCM API 的两分钟响应缓存，避免扫码轮询一直得到旧状态。

## 安全不变量

- 登录 token 只存在 `nostalgia.ncm.session` 应用存储中。
- 不写 `document.cookie`。
- 只保存 `MUSIC_U` 与 `__csrf`，丢弃其他 Set-Cookie 属性和字段。
- Friday 导出使用白名单组装，不包含 cookie、token 或临时 CDN URL。
- 本地音乐播放器仍独立可用；网易云功能位于 `/nostalgia/cloud`。
- `/audio-proxy` 必须验证 HTTPS 与网易云 CDN 域名白名单。

## Cloudflare Pages

仓库包含：

```txt
functions/api/[[path]].ts
```

它负责：

- 同源代理 `/api/*`。
- 删除上游 `Set-Cookie`。
- 服务端注入 `Authorization: Bearer <NCM_SECRET>`。
- 可追加 `realIP`。
- 为 `/api/audio-proxy` 执行 CDN 主机白名单和流式转发。

在 Pages 项目中配置服务端环境变量：

```txt
NCM_ORIGIN=https://你的受保护-NCM-源站
NCM_SECRET=长随机密钥
NCM_REAL_IP=可选的中国 IP
```

不要把 `NCM_SECRET` 命名为 `VITE_*`，否则会进入浏览器构建产物。

推荐 NCM API 运行在中国本机或 VPS，通过 Cloudflare Tunnel 暴露，并使用 Cloudflare Access 或源站 Bearer 鉴权。不要公开暴露 3000 端口。

## 验收

```bash
curl 'http://127.0.0.1:3000/search?keywords=晴天&timestamp=1&noCookie=1'
```

随后检查：

1. 前端搜索、歌曲详情和播放正常。
2. 扫码状态能从 801 → 802 → 803，DevTools Cookies 中没有 `MUSIC_U`。
3. Moment 包含当前歌词行。
4. 导出 JSON 不包含 `MUSIC_U`、`__csrf`、`cookie`、`token` 或歌曲 CDN URL。
5. 线上只访问同源 `/api/*`，无 CORS 和混合内容错误。
