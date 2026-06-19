# 米粒太 Nostalgia — Engineering Spec v1.2

> 目标读者：Gemini 3.1 Pro（代码生成 Agent）
> 版本：v1.2（基于 PRD v1.1 修订）
> 修订重点：数据存储改为 JSON 文件、保留 militai.me 实时声谱图、对齐 militai.me 布局

---

## 0. Executive Summary

**一句话定位**：米粒太 Nostalgia 是一个开源的私人音乐记忆播放器，用户在听歌时点击"记住此刻"保存情绪锚点，生成 Friday 兼容 JSON，可选调用米粒太 MCP 获取声乐建议。

**核心流程**：听歌 → 记住此刻 → 补写情绪 → 导出 JSON → 可选录音 → 米粒太反馈

**部署模式**：
- **开源版**：本地运行，数据存本地 JSON 文件，LLM 用户自配，MCP 可选连接
- **公开 Demo**：数据存后端服务器 JSON 文件，LLM token 由开发者承担

**技术栈**：Vite + React 18 + TypeScript + Vanilla CSS + Zustand + Express

> [!IMPORTANT]
> **v1.2 关键变更**：
> 1. 数据存储从 SQLite 改为 JSON 文件（开源版和 Demo 版均适用）
> 2. 保留 militai.me 的实时声谱图（Web Audio API），作为公告栏的浅层背景
> 3. 主界面布局对齐 militai.me：上方公告栏+声谱图背景 → 中间进度条中控 → 下方文字块（MCP 反馈/大模型书信）

---

## 1. 项目概述

### 1.1 项目名称
- 中文名：米粒太 Nostalgia
- 英文名：MilitAIre Nostalgia
- 访问路径：`militai.me/nostalgia`
- 代号：`militai-nostalgia`

### 1.2 定位
面向音乐爱好者的开源私人音乐记忆播放器：用户在听歌时点击"记住此刻"记录情绪锚点，生成 Friday 兼容 JSON；可选调用米粒太 MCP 获得声乐建议，由用户自配的大模型以人格化方式给出克制的情绪陪伴反馈。

### 1.3 开源与部署策略

**开源版（Local-first）**：
- 用户 clone 后本地运行
- 数据存储在本地 JSON 文件（`./data/` 目录），不上云
- LLM 由用户自己配置（API Key + 模型选择）
- 米粒太 MCP 为可选远程服务
- 用户对自己上传的音频内容自行负责

**公开 Demo（Server-hosted）**：
- 部署在公网，供快速体验
- 数据存储在后端 JSON 文件
- LLM token 由开发者承担，写在后端配置中
- MCP 默认启用

---

## 2. 核心概念

### 2.1 Track
一首音乐或一个音频来源。字段：track_id、title、artist、album、duration、cover、source_type、source_url、friday_sample_available。

### 2.2 Public Segment
由 Friday 提供的公共情绪段落。表示大多数人在这首歌的这个时间段可能如何反应。时间单位统一为**秒（float）**。

### 2.3 Moment
用户主动保存的私人情绪锚点。由用户点击按钮（或按空格键）创建，可稍后补充文字、情绪、标签、附件。

### 2.4 Private Memory Segment
由 Moment 转换而来的 Friday-compatible JSON。既保留 Friday 的公共上下文，也保留用户的私人情绪。

### 2.5 Practice Session
用户针对某个 Moment 录制的哼唱或演唱。

### 2.6 Companion Feedback
大模型基于米粒太 MCP 的专业建议，生成的人格化陪伴反馈。要求：不过度拟人、不过度煽情、不进行心理诊断、不替用户定义情绪、以音乐练习和温柔陪伴为主。

---

## 3. 主界面布局（对齐 militai.me）

> [!IMPORTANT]
> 布局必须对齐 militai.me 的视觉结构。整体为暗色单页垂直布局。

### 3.1 布局结构（从上到下）

```
┌─────────────────────────────────────────────────┐
│  [A] 公告栏区域 (Bulletin Board)                │
│  背景：实时声谱图 (Web Audio API AnalyserNode)   │
│  内容：歌曲信息 / Public Segment / Moment 召回   │
│  高度：约 40vh                                   │
├─────────────────────────────────────────────────┤
│  [B] 进度条中控区域 (Transport Control)          │
│  内容：进度条 + 锚点圆点 + 播放控制 + 记住此刻    │
│  高度：约 15vh                                   │
├─────────────────────────────────────────────────┤
│  [C] 文字块区域 (Response Panel)                 │
│  内容：米粒太 MCP 解析反馈 / 大模型书信式陪伴回复  │
│  高度：约 45vh，可滚动                            │
└─────────────────────────────────────────────────┘
```

### 3.2 [A] 公告栏区域

- **背景**：实时声谱图（从 militai.me 移植），使用 Web Audio API `AnalyserNode` 获取频率数据，用 Canvas 绘制
- 声谱图作为**浅层背景**（opacity 约 0.15-0.25），不抢前景信息
- 渲染方式：频率柱状图或波形图，颜色使用品牌渐变（紫→粉），底部对齐向上生长
- **前景内容**（叠加在声谱图之上）：
  - 当前歌曲信息（标题、艺术家、封面缩略图）
  - 当前 Public Segment 的情绪信息（function、content、弹幕示例）
  - 当播放时间接近已保存 Moment（提前 3 秒），展示 Moment 的标签、文字、图像
  - 多个重叠 Moment 同时展示，垂直堆叠
  - 不同时间区域的锚点独立出现/消失

**声谱图实现规范**：
```typescript
// 核心实现：从 militai.me 移植
const audioCtx = new AudioContext();
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 256; // 128 个频率 bin
const source = audioCtx.createMediaElementSource(audioElement);
source.connect(analyser);
analyser.connect(audioCtx.destination);

// Canvas 绘制循环
function drawSpectrogram() {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  // 绘制到公告栏背景 canvas
  requestAnimationFrame(drawSpectrogram);
}
```

### 3.3 [B] 进度条中控区域

- 进度条：显示播放进度 + 已保存 Moment 的锚点小圆点（品牌色发光）
- 播放控制：播放/暂停、音量、上一首/下一首（Friday 样例间切换）
- "记住此刻"按钮：核心 CTA，品牌渐变色，点击后脉冲动效
- 当前时间 / 总时长显示
- 空格快捷键提示（首次使用时显示 tooltip）

### 3.4 [C] 文字块区域（Response Panel）

- 展示来自米粒太 MCP 的解析反馈（专业声乐建议）
- 展示大模型生成的书信式陪伴回复
- 两种内容用视觉分隔（卡片式或标签切换）
- 当无内容时显示引导文案："听歌时按下空格，记住这一刻。"
- 可滚动，支持历史反馈查看

---

## 4. 用户流程

### 4.1 听歌记录流程
1. 用户选择一首样例音乐
2. 播放器展示主界面三段式布局
3. 用户听到某一段有感觉
4. 用户点击"记住此刻"或按空格键
5. 系统立即保存到 JSON 文件
6. 页面显示轻量反馈："已记录 02:55。"
7. 不强制弹窗，不暂停音乐

**快捷键**：
- 短按空格：在当前播放时间点创建 Moment
- 长按空格（>500ms）：开始标记区间，松开时结束

### 4.2 公告栏实时展示流程

触发规则：
```
触发条件：
  - currentTime >= moment.start_s - 3.0（提前 3 秒）
  - currentTime <= moment.end_s
  - JSON 中存在该 Moment 的记录即展示

展示策略：
  - recall_style === 'silent': 进度条锚点高亮，公告栏不展示文字
  - recall_style === 'gentle': 公告栏展示 Moment 内容，柔和动效
  - recall_style === 'explicit': 公告栏展示完整 Moment 卡片
```

拖动进度条同样触发公告栏展示。

### 4.3 播放结束回顾流程
- 播放结束后展示回顾卡，5 秒后自动关闭
- 有 Moment：显示时间点、情绪、笔记
- 无 Moment：引导文案
- 用户可选：生成记忆卡 / 导出 JSON / 录音 / 删除

### 4.4 录音给米粒太流程
1. 用户在 Moment 卡片点击"让我唱一下"
2. 录音面板在 [C] 区域展开
3. 用户录制 10-30 秒
4. 上传到 server
5. server 调用米粒太 MCP（可选）
6. [C] 区域展示两层反馈：专业反馈 + 陪伴式书信反馈

---

## 5. MVP 范围

### 5.1 P0 必做
1. Landing Page
2. Friday 样例音乐库（至少 3 首）
3. 三段式主播放界面（公告栏+声谱图 / 进度条中控 / 文字块）
4. 实时声谱图背景（Web Audio API）
5. "记住此刻"按钮 + 空格键快捷键
6. Moment 创建与补写面板
7. 情绪标签选择（多选、自定义、不限数量）
8. 公告栏实时展示（含 3 秒提前触发）
9. 进度条锚点展示
10. Friday-compatible JSON 导出
11. JSON 文件存储（读写 `./data/` 目录）
12. Schema 校验

### 5.2 P1 应做
- MCP 录音分析入口（含降级）
- 大模型陪伴反馈（书信式）
- Memory Card（含自动关闭）
- allow_recall 设置
- LLM 配置页（开源版）

### 5.3 P2 可做
- 上传音乐、附件、分享卡、练习历史、长期记忆库

### 5.4 MVP 不做
实时频谱/声谱图属于**保留项**（从 militai.me 移植，算 P0）。不做的是：用户账号系统、多端同步、桌面客户端、复杂虚拟角色动画、长期心理画像、社区分享、商业化订阅、移动端 App。

---

## 6. 页面设计

### 6.1 Landing Page (`/nostalgia`)

1. **Hero 区**：标题（米粒太 Nostalgia）、副标题（给每首歌留下一个属于你的情绪锚点）、CTA（开始体验）
2. **产品解释区**：听到某一刻 → 点击记住 → 保存成 JSON → 想唱时交给米粒太 → AI 温柔陪你回到这一刻
3. **样例展示区**：3-6 首 Friday 样例
4. **品牌说明区**：米粒太开源实验项目声明

### 6.2 Library Page (`/nostalgia/library`)

展示 Friday 样例、搜索、按情绪/标签筛选、添加本地音乐。

### 6.3 Player Page (`/nostalgia/player/:track_id`)

**使用 Section 3 定义的三段式布局**（公告栏+声谱图 / 进度条中控 / 文字块）。

### 6.4 Settings Page (`/nostalgia/settings`)

开源版：LLM 配置（provider/model/API key/base URL）、MCP endpoint 配置。

---

## 7. 视觉与品牌规范

### 7.1 品牌继承
必须保持 `militai.me` 现有视觉风格。Nostalgia 是米粒太的子产品。

### 7.2 设计 Token

```css
:root {
  --bg-primary: #08080d;
  --bg-secondary: #11111a;
  --bg-card: #181827;
  --bg-elevated: #202036;
  --text-primary: #f1f1f5;
  --text-secondary: #9a9ab2;
  --accent: #7c5cff;
  --accent-pink: #ec4899;
  --accent-blue: #60a5fa;
  --accent-gradient: linear-gradient(135deg, #7c5cff, #ec4899);
  --border: rgba(255,255,255,0.08);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 20px;
  --shadow-glow: 0 0 24px rgba(124,92,255,0.32);
  --font-main: Inter, system-ui, sans-serif;
  --transition: 0.2s ease;
  /* 声谱图专用 */
  --spectrogram-opacity: 0.2;
  --spectrogram-gradient-start: #7c5cff;
  --spectrogram-gradient-end: #ec4899;
}
```

### 7.3 命名规范

按钮文案：记住此刻、稍后再写、让我唱一下、让米粒太听听、导出 Friday JSON、查看记忆卡、以后可以提醒我。

禁止使用：AI 女友、赛博女友、替代 Olivia、官方平替、米哈游同款、复制林离。
