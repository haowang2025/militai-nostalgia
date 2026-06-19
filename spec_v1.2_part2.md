# 米粒太 Nostalgia — Engineering Spec v1.2 (Part 2: Technical)

> 承接 Part 1，本文件覆盖数据结构、API、MCP、技术架构、验收标准

---

## 8. 数据存储（JSON 文件）

> [!IMPORTANT]
> **v1.2 关键变更**：所有数据存储使用 JSON 文件，不使用 SQLite。
> 开源版和 Demo 版均适用。数据目录为 `./data/`。

### 8.1 文件结构

```
data/
├── tracks.json              # 歌曲库
├── friday/
│   └── {track_id}.json      # 每首歌的 Friday 公共段落
├── moments/
│   └── {track_id}.json      # 每首歌的用户 Moment 列表
├── practice/
│   └── {session_id}.json    # 练习记录
├── config.json              # LLM/MCP 配置（开源版）
└── uploads/
    ├── audio/               # 用户上传的音频
    ├── practice/            # 练习录音
    └── attachments/         # 附件（图片等）
```

### 8.2 tracks.json

```json
{
  "version": "1.0.0",
  "tracks": [
    {
      "id": "flower_dance",
      "title": "Flower Dance",
      "artist": "DJ Okawari",
      "album": "",
      "duration_s": 260.0,
      "cover_url": "/assets/covers/flower_dance.jpg",
      "audio_url": "/assets/audio/flower_dance.mp3",
      "source_type": "friday_sample",
      "source_config": {},
      "friday_json_available": true,
      "created_at": "2026-06-19T20:00:00Z",
      "updated_at": "2026-06-19T20:00:00Z"
    }
  ]
}
```

### 8.3 friday/{track_id}.json

每首歌的 Friday 公共情绪段落。时间单位统一为秒（float）。

```json
{
  "version": "1.0.0",
  "track_id": "flower_dance",
  "segments": [
    {
      "id": "seg_flower_dance_34_110",
      "start": 34.0,
      "end": 110.0,
      "peak_t": 52.0,
      "source": "k",
      "content": "瞬间的震撼与集体泪目；主旋律响起引发强烈的共鸣",
      "confidence": {
        "score": 0.95,
        "scope": "overall_interpretation",
        "meaning": "当前窗口的整体解释是否有足够证据支持"
      },
      "function": ["抬升", "爆点"],
      "evidence": {
        "danmaku_examples": ["啊啊啊，泪目了，爷青回"],
        "crowd_signals": {
          "burst": "present",
          "sync_level": "high",
          "meme": []
        }
      },
      "payload": {
        "sensory": ["空灵", "悲寥"],
        "imagery": ["仙乐飘飘"]
      }
    }
  ]
}
```

### 8.4 moments/{track_id}.json

```json
{
  "version": "1.0.0",
  "track_id": "flower_dance",
  "moments": [
    {
      "id": "mom_abc123",
      "track_id": "flower_dance",
      "public_segment_id": "seg_flower_dance_34_110",
      "timestamp_s": 37.0,
      "start_s": 34.0,
      "end_s": 44.0,
      "lyric_text": "",
      "note": "这段让我想起以前放学路上。",
      "mood": ["怀念", "治愈"],
      "tags": ["放学路上", "旧时光"],
      "source": "user",
      "is_private": true,
      "allow_recall": true,
      "recall_style": "gentle",
      "user_confirmed": true,
      "attachments": [
        {
          "id": "att_001",
          "type": "image",
          "url": "/uploads/attachments/photo.jpg",
          "title": "",
          "description": ""
        }
      ],
      "created_at": "2026-06-19T20:05:00Z",
      "updated_at": "2026-06-19T20:06:00Z"
    }
  ]
}
```

### 8.5 practice/{session_id}.json

```json
{
  "id": "prac_abc123",
  "track_id": "flower_dance",
  "moment_id": "mom_abc123",
  "audio_url": "/uploads/practice/prac_abc123.webm",
  "start_s": 34.0,
  "end_s": 44.0,
  "mcp_status": "completed",
  "mcp_raw_response": {},
  "professional_feedback": {
    "summary": "用户整体音高接近目标，但句尾气息支撑略弱。",
    "technical_feedback": {
      "pitch": { "status": "medium", "issue": "phrase_end_slightly_flat", "suggestion": "句尾保持气息。" },
      "breath": { "status": "needs_work", "issue": "support_drops_at_end", "suggestion": "先用慢速哼鸣练习。" }
    }
  },
  "companion_feedback": "这一段你不是没唱出感觉，反而是情绪来得很快...",
  "created_at": "2026-06-19T20:10:00Z",
  "updated_at": "2026-06-19T20:12:00Z"
}
```

### 8.6 config.json（开源版）

```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o",
    "api_key": "",
    "base_url": "https://api.openai.com/v1"
  },
  "mcp": {
    "enabled": false,
    "endpoint": "https://mcp.militai.me"
  }
}
```

### 8.7 JSON 文件读写规范

```typescript
// 服务端 JSON 文件操作工具
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.resolve('./data');

async function readJSON<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const content = await fs.readFile(
      path.join(DATA_DIR, filePath), 'utf-8'
    );
    return JSON.parse(content);
  } catch { return fallback; }
}

async function writeJSON(filePath: string, data: unknown): Promise<void> {
  const fullPath = path.join(DATA_DIR, filePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, JSON.stringify(data, null, 2), 'utf-8');
}
```

**并发写入保护**：使用简单的文件锁（`proper-lockfile` 或内存 mutex），避免同时写入同一文件导致数据损坏。

---

## 9. API 设计

Base URL：`/api/nostalgia`

### 9.1 Track API
- `GET /tracks` — 读取 `tracks.json`，支持 `q?, source_type?, mood?` 过滤
- `GET /tracks/:id` — 返回单曲详情
- `GET /tracks/:id/stream` — 返回音频流

### 9.2 Friday API
- `GET /friday/samples` — 返回 Friday 样例曲库
- `GET /friday/tracks/:track_id/segments` — 读取 `friday/{track_id}.json`
- `POST /friday/import` — 导入 Friday JSON，写入 `friday/{track_id}.json`

### 9.3 Moment API

**POST `/moments`**：
```typescript
Body: {
  track_id: string;
  timestamp_s: number;
  start_s?: number;   // 长按空格时用户自定义
  end_s?: number;
  note?: string;
  mood?: string[];
  tags?: string[];
}
```
逻辑：未提供 start_s/end_s 时默认前后 5 秒；自动匹配 public_segment；2 秒内重复点击返回已有 Moment；写入 `moments/{track_id}.json`。

- `GET /moments?track_id=X` — 读取 `moments/{track_id}.json`
- `PUT /moments/:id` — 更新 Moment（note, mood, tags, allow_recall, recall_style）
- `DELETE /moments/:id` — 删除 Moment 及其 attachments

### 9.4 Export API
- `GET /export/track/:id` — 导出 Friday-compatible JSON
- `GET /export/all` — 导出全部

### 9.5 Practice API
- `POST /practice/sessions` — 创建并上传录音
- `POST /practice/sessions/:id/analyze` — 调用米粒太 MCP
- `GET /practice/sessions/:id` — 获取反馈

### 9.6 Companion API

**POST `/companion/respond`**：
```typescript
Body: {
  moment_id: string;
  practice_session_id?: string;
  mode: 'memory_recall' | 'practice_feedback' | 'post_listening_review';
}
Response: {
  text: string;
  tone: 'gentle' | 'quiet' | 'encouraging';
  safety_flags: string[];
}
```

### 9.7 Config API（开源版）
- `GET /config/llm` — 获取 LLM 配置（不返回 api_key 明文）
- `PUT /config/llm` — 更新配置，写入 `config.json`
- `POST /config/llm/test` — 测试连接

---

## 10. JSON Export Schema

### 10.1 Friday-compatible Export Format

```json
{
  "$schema": "https://militai.me/schemas/friday-compatible-memory-v1.json",
  "version": "1.0.0",
  "exported_at": "2026-06-19T20:00:00Z",
  "track": { "id": "...", "title": "...", "artist": "..." },
  "segments": [
    {
      "start": 34.0,
      "end": 44.0,
      "peak_t": 37.0,
      "source": "user",
      "content": "这段让我想起以前放学路上。",
      "confidence": { "score": 0.95, "scope": "user_record", "meaning": "..." },
      "function": ["用户标记", "私人记忆", "抬升"],
      "evidence": {
        "user_note": "这段让我想起以前放学路上。",
        "user_selected_mood": ["怀念", "治愈"],
        "danmaku_examples": ["啊啊啊，泪目了"],
        "crowd_signals": { "burst": "present", "sync_level": "high", "meme": [] }
      },
      "payload": {
        "sensory": ["空灵"], "imagery": ["仙乐飘飘"],
        "mood": ["怀念", "治愈"], "tags": ["放学路上"],
        "moment_ids": ["mom_abc123"],
        "track": { "id": "flower_dance", "title": "Flower Dance", "artist": "DJ Okawari" },
        "public_segment_id": "seg_flower_dance_34_110",
        "ai_usage": { "allow_recall": true, "recall_style": "gentle", "visibility": "private", "do_not_use_for_ads": true }
      }
    }
  ]
}
```

---

## 11. 米粒太 MCP 集成

MCP 是**可选服务**。Nostalgia 的听歌、记录、导出功能不依赖 MCP。

### 11.1 MCP 输入/输出格式

（与 PRD v1.1 Section 12 相同，此处不重复）

### 11.2 容错与降级

| 场景 | 策略 |
|------|------|
| MCP 未配置 | 隐藏 MCP 入口，仅保留录音保存 |
| MCP 超时（>30s） | 展示等待提示 + 可取消 |
| MCP 不可用 | "米粒太暂时不在，先保存录音" |
| LLM 未配置 | 直接展示 MCP professional feedback |
| LLM 转译失败 | 直接展示 MCP professional feedback |

---

## 12. 人格化陪伴设计

角色：温柔、克制、专业、带米粒太式幽默、不替用户定义情绪。

**三种模式**：
- **Quiet**: "这一段你之前留过记录。我不多说，陪你听完。"
- **Gentle**（默认）: "快到你上次保存的那一段了。那时你写的是'放学路上'。"
- **Practice**: "米粒太听到：句尾气息有点早收。唱得再慢一点，像把那段回忆轻轻放回去。"

禁止表达："我永远陪着你"、"你一定是因为某人难过"、"你的声音很差"。

---

## 13. 技术架构

### 13.1 技术栈

| 层 | 选型 |
|---|------|
| 前端 | Vite + React 18 + TypeScript |
| UI | Vanilla CSS + CSS Variables |
| 状态 | Zustand |
| 路由 | React Router v6 |
| 后端 | Node.js 20 + Express 4 + TypeScript |
| 数据存储 | JSON 文件（`./data/` 目录） |
| 音频播放 | HTML5 Audio API |
| 声谱图 | Web Audio API (AnalyserNode) + Canvas |
| 录音 | MediaRecorder API |
| 构建 | pnpm monorepo |
| 测试 | Vitest + Playwright |

### 13.2 目录结构

```
militai-nostalgia/
├── package.json
├── pnpm-workspace.yaml
├── README.md
├── .env.example
├── data/                           # JSON 数据目录
│   ├── tracks.json
│   ├── friday/
│   ├── moments/
│   ├── practice/
│   ├── config.json
│   └── uploads/
├── packages/
│   ├── server/
│   │   └── src/
│   │       ├── index.ts
│   │       ├── jsonStore.ts        # JSON 文件读写工具
│   │       ├── routes/
│   │       │   ├── tracks.ts
│   │       │   ├── friday.ts
│   │       │   ├── moments.ts
│   │       │   ├── export.ts
│   │       │   ├── practice.ts
│   │       │   ├── companion.ts
│   │       │   └── config.ts
│   │       ├── services/
│   │       │   ├── fridayImporter.ts
│   │       │   ├── converter.ts
│   │       │   ├── mcpClient.ts
│   │       │   ├── companionPrompt.ts
│   │       │   └── llmService.ts
│   │       └── schema/
│   │           └── friday-compatible-memory-v1.schema.json
│   └── client/
│       └── src/
│           ├── main.tsx
│           ├── App.tsx
│           ├── index.css
│           ├── pages/
│           │   ├── LandingPage.tsx
│           │   ├── LibraryPage.tsx
│           │   ├── PlayerPage.tsx
│           │   └── SettingsPage.tsx
│           ├── components/
│           │   ├── BulletinBoard.tsx     # 公告栏（含声谱图背景）
│           │   ├── Spectrogram.tsx       # 实时声谱图 Canvas
│           │   ├── TransportControl.tsx  # 进度条中控
│           │   ├── ResponsePanel.tsx     # 文字块区域
│           │   ├── MomentButton.tsx
│           │   ├── MomentPanel.tsx
│           │   ├── MemoryCard.tsx
│           │   ├── PracticeRecorder.tsx
│           │   └── ExportButton.tsx
│           ├── stores/
│           │   ├── playerStore.ts
│           │   ├── momentStore.ts
│           │   └── configStore.ts
│           └── types/
│               └── index.ts
```

---

## 14. 验收标准

### 14.1 功能验收

| # | 检查项 | 通过条件 |
|---|--------|----------|
| 1 | Landing Page | 能访问 `/nostalgia` |
| 2 | 样例库 | 至少 3 首 Friday 样例 |
| 3 | 播放 | Audio 可正常播放 |
| 4 | 声谱图 | 播放时公告栏背景显示实时声谱图 |
| 5 | 公告栏 | 实时展示 Public Segment 和 Moment |
| 6 | 记住此刻 | 点击/空格创建 Moment |
| 7 | JSON 存储 | Moment 正确写入 `moments/{track_id}.json` |
| 8 | 进度条锚点 | Moment 在进度条上显示小圆点 |
| 9 | 3 秒提前触发 | 公告栏提前 3 秒展示 Moment |
| 10 | 拖动触发 | 拖动进度条触发公告栏 |
| 11 | JSON 导出 | 符合 Friday-compatible schema |
| 12 | 文字块 | MCP 反馈和陪伴回复正确展示在 [C] 区域 |
| 13 | 回顾卡 | 播放结束展示，5 秒自动关闭 |
| 14 | MCP 降级 | MCP 不可用时展示友好提示 |
| 15 | 三段式布局 | 视觉结构对齐 militai.me |
| 16 | 开源部署 | README 提供完整本地部署指南 |

### 14.2 非功能性验收

- Chrome 90+, Firefox 90+, Safari 15+, Edge 90+
- 375px 以上屏幕响应式
- 空格快捷键正常工作
- 断网时本地播放不受影响

---

## 15. 版本规划

### v0.1 Demo
Landing Page、3 首 Friday 样例、三段式播放界面（含声谱图）、记住此刻、情绪标签、JSON 导出、假数据反馈

### v0.2 MVP
真实 Moment JSON 持久化、真实 Friday 导入、真实录音、真实 MCP 调用、真实 LLM 陪伴、LLM 配置页

### v0.3 Beta
用户上传音乐、歌词导入、多次练习历史、分享静态记忆卡

---

## 16. 安全与隐私

- 默认所有 Moment 私有
- 开源版数据完全留在本地 JSON 文件
- 每个 Moment 含 `ai_usage`（allow_recall, recall_style, visibility, do_not_use_for_ads）
- 用户可关闭提醒、删除 Moment、导出 JSON、清空全部记录
- 不提供心理诊断、不判断用户精神状态
- 极端内容触发安全提示流程

---

## 17. 推荐文案

**一句话**：米粒太 Nostalgia：给每首歌留下一个属于你的情绪锚点。

**首屏**：
- 标题：米粒太 Nostalgia
- 副标题：给每首歌留下一个属于你的情绪锚点。
- 按钮：开始体验
- 辅助：听到某一刻，点一下。这首歌就不只是歌了。

**Moment Button**：记住此刻 → 已记录 02:55 → 要不要给这一刻留一句话？

**MCP 入口**：让我唱一下 → 米粒太正在听。 → 米粒太听完了这一段。
