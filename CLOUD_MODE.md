# 网易云模式

`cloud` 分支新增了 `/nostalgia/cloud` 页面，用于搜索网易云歌曲、获取临时播放地址，并在播放过程中保存私人 Moment。

## 1. 启动网易云 API

本项目不把第三方网易云服务地址写死，也不把登录 Cookie 交给公开 Demo。请自行运行 [u3588064/NeteaseCloudMusicApi](https://github.com/u3588064/NeteaseCloudMusicApi)：

```bash
git clone https://github.com/u3588064/NeteaseCloudMusicApi.git
cd NeteaseCloudMusicApi
npm install
npm start
```

默认地址通常是 `http://localhost:3000`。

## 2. 配置 Nostalgia

复制环境变量示例：

```bash
cp .env.example .env.local
```

然后设置：

```txt
VITE_NETEASE_API_BASE=http://localhost:3000
```

也可以在 `/nostalgia/cloud` 页面的“API 设置”中临时修改。该地址只保存在浏览器 localStorage。

## 3. 本地运行

```bash
npm install
npm run dev
```

打开：

```txt
http://localhost:5173/nostalgia/cloud
```

## 当前实现

- 使用 `/cloudsearch` 搜索单曲。
- 使用 `/song/detail` 获取歌曲、歌手、专辑和封面信息。
- 使用 `/song/url/v1` 获取标准音质的临时播放地址。
- 空格键或“记住此刻”保存当前时间点。
- Moment 只存浏览器 localStorage，可导出 Friday-compatible JSON。

## 限制

网易云播放地址可能受版权、地区、账号登录状态和有效期限制。若搜索成功但无法播放，页面会显示具体错误；这不应通过硬编码公共代理或提交用户 Cookie 来绕过。
