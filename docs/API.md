# Media Tracker API

## 概述

- **Base URL**: `http://<host>:8082`
- **Content-Type**: `application/json`
- **统一响应格式**:

```json
{
  "code": 0,        // 0=成功, -1=失败
  "message": "ok",
  "data": { ... }
}
```

- 认证失败 (401): `{"code":-1, "message":"未提供认证令牌"}`
- 权限不足 (403): `{"code":-1, "message":"需要管理员权限"}`

---

## 认证

支持两种认证方式（二选一），所有 `/api` 下路由除 `/api/auth/*` 和 `/api/tmdb/poster/*` 外均需认证：

| 方式 | 请求头 |
|------|--------|
| JWT Bearer | `Authorization: Bearer <token>` |
| API Key | `X-API-Key: <api_key>` |

---

## 接口列表

### 1. 用户认证

#### `POST /api/auth/register` — 注册

**Request**:
```json
{
  "username": "string (2-50字)",
  "password": "string (6-100字)",
  "invite_code": "string (可选，邀请码)"
}
```

**Response** `data`:
```json
{
  "user_id": 1,
  "username": "user1",
  "api_key": "a1b2c3...",
  "role": "user"
}
```

> 注：第一个注册用户自动成为 `admin`；若配置要求邀请码则需提供有效邀请码。

#### `POST /api/auth/login` — 登录

**Request**:
```json
{
  "username": "string",
  "password": "string"
}
```

**Response** `data`:
```json
{
  "token": "eyJ...",
  "user_id": 1,
  "username": "user1",
  "role": "user"
}
```

> JWT 有效期由 `config.yaml` `jwt.expire_hours` 配置。

---

### 2. 媒体上传

所有上传接口**需要认证**。

#### `POST /api/upload` — 单条上传

**Request**:
```json
{
  "sha256": "文件哈希 (64字符)",
  "size": 12345678,
  "name": "文件名 (在文件名)",
  "cloud": "cloud-1"
}
```

**Response** `data`:
```json
{
  "batch_id": "00000001",
  "total": 1
}
```

> 提交后异步处理，进度通过 WebSocket 推送。

#### `POST /api/upload/batch` — 批量上传

**Request**: `Array` of upload objects:
```json
[
  { "sha256": "...", "size": 123, "name": "a.mkv", "cloud": "cloud-1" },
  { "sha256": "...", "size": 456, "name": "b.mkv", "cloud": "cloud-2" }
]
```

**Response** `data`:
```json
{
  "batch_id": "00000002",
  "total": 2
}
```

#### `POST /api/upload/file` — 上传 JSON 文件

- `Content-Type: multipart/form-data`
- 字段名: `file`
- 文件内容为单条或批量上传的 JSON 结构（自动识别）。

**Response** `data`: 同单条/批量上传。

---

### 3. 媒体查询

需要认证。

#### `GET /api/media` — 列表查询

**Query Parameters**:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | int | 1 | 页码 |
| `page_size` | int | 20 | 每页条数 (max 100) |
| `q` | string | - | 文件名模糊搜索 |
| `media_type` | string | - | 过滤 `movie` / `tv` |
| `tmdb_id` | int | - | 过滤指定 TMDB ID |
| `year` | int | - | 按年份过滤 (JSON_EXTRACT `$.year`) |
| `group_by` | string | - | 设为 `tmdb` 则按 tmdb_id 分组 |

**普通模式**（不传 `group_by`）**Response** `data`:
```json
{
  "total": 100,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 1,
      "sha256": "abc...",
      "file_name": "example.mkv",
      "file_size": 12345678,
      "cloud_type": "cloud-1",
      "user_id": 1,
      "tmdb_id": 12345,
      "media_type": "movie",
      "json_data": { ... },
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

**分组模式**（`?group_by=tmdb`）**Response** `data`:
```json
{
  "total": 50,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 10,
      "sha256": "...",
      "file_name": "...",
      "count": 3,
      // ... 其他 Media 字段（分组内最新一条）
    }
  ]
}
```

> `count` 表示该 tmdb_id 分组下的文件总数。

#### `GET /api/media/:id` — 查询单条

**Path**: `id` — 媒体记录 ID

**Response** `data`: 单个 Media 对象（同上）。

---

### 4. TMDB 操作

#### `PUT /api/media/:id/tmdb` — 更新 TMDB ID

需要 `CanEditTMDB` 权限（admin 或 `can_edit_tmdb=true` 的普通用户）。

**Request**:
```json
{
  "tmdb_id": 12345
}
```

**Response** `data`: 更新后的 Media 对象。

> 后端会用新的 tmdb_id 重新识别，更新 `media_type`、`json_data`。

#### `GET /api/tmdb/poster/:type/:id` — TMDB 海报代理

**不需要认证**。

| 参数 | 说明 |
|------|------|
| `type` | `movie` 或 `tv` |
| `id` | TMDB ID |

- 从 `image.tmdb.org` 代理获取海报图，缓存 86400s。
- 无 API Key 或未找到时返回 404。

---

### 5. 数据导出

#### `GET /api/media/export` — 导出媒体列表

需要认证。

**Query Parameters**（同列表查询，非分页全量导出）:

| 参数 | 说明 |
|------|------|
| `q` | 文件名模糊搜索 |
| `media_type` | `movie` / `tv` |
| `tmdb_id` | 单个 tmdb_id |
| `ids` | 逗号分隔的 media ID 列表 |
| `tmdb_ids` | 逗号分隔的 tmdb_id 列表 |

> `tmdb_ids` 和 `ids` 优先级高于其他参数。
> `tmdb_ids` > `ids` > 普通查询。

**Response**: `Content-Disposition: attachment; filename=media_export.json` 的 JSON 文件：
```json
[
  {
    "sha256": "abc...",
    "size": 12345678,
    "name": "file.mkv",
    "cloud": "cloud-1"
  }
]
```

> 导出后异步记录 ExportLog。

---

### 6. 用户

#### `GET /api/user/apikey` — 获取当前用户的 API Key

**Response** `data`:
```json
{
  "api_key": "a1b2c3d4..."
}
```

---

### 7. 管理后台（Admin Only）

需要 `admin` 角色。

#### `GET /api/admin/users` — 用户列表

**Response** `data`:
```json
{
  "users": [
    {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "api_key": "abc...",
      "can_edit_tmdb": false,
      "disabled": false,
      "created_at": "2025-01-01T00:00:00Z",
      "updated_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

#### `PATCH /api/admin/users/:id` — 更新用户权限

**Request**:
```json
{
  "can_edit_tmdb": true
}
```

**Response**: 标准成功响应。

#### `PATCH /api/admin/users/:id/status` — 禁用/启用用户

**Request**:
```json
{
  "disabled": true
}
```

> 不能禁用 admin 账户。

**Response**: 标准成功响应。

#### `DELETE /api/admin/users/:id` — 删除用户

> 不能删除 admin 账户。

**Response**: 标准成功响应。

#### `POST /api/admin/invitations` — 生成邀请码

**Request**:
```json
{
  "expire_hours": 72,
  "count": 5
}
```

**Response** `data`:
```json
{
  "count": 5,
  "codes": [
    { "code": "a1b2c3...", "expires_at": "2025-01-04 12:00:00" }
  ]
}
```

#### `GET /api/admin/invitations` — 邀请码列表

**Response** `data`:
```json
{
  "invitations": [
    {
      "id": 1,
      "code": "abc...",
      "created_by": 1,
      "expires_at": "2025-01-04T12:00:00Z",
      "used_by": null,
      "used_at": null,
      "created_at": "2025-01-01T12:00:00Z"
    }
  ]
}
```

#### `GET /api/admin/export-logs` — 导出日志

**Query**:
| 参数 | 默认 | 说明 |
|------|------|------|
| `page` | 1 | 页码 |
| `page_size` | 20 | 每页条数 (max 100) |

**Response** `data`:
```json
{
  "total": 10,
  "page": 1,
  "page_size": 20,
  "items": [
    {
      "id": 1,
      "user_id": 1,
      "username": "user1",
      "item_count": 50,
      "params": "{\"tmdb_ids\":\"123,456\"}",
      "created_at": "2025-01-01T00:00:00Z"
    }
  ]
}
```

---

### 8. WebSocket

#### `GET /ws?token=<JWT_or_API_Key>`

- 协议: WebSocket
- 认证方式：`token` 参数（JWT 或 API Key）

**服务端推送消息类型**:

| type | payload | 说明 |
|------|---------|------|
| `new_media` | `{id, sha256, tmdb_id, title, media_type, file_name, file_size, username, year?, count?, suggested_path?}` | 新媒体识别完成（tmdb_id>0 时附带 year 与 count） |
| `media_updated` | `{id, sha256, tmdb_id, media_type, suggested_path?}` | 媒体 TMDB 信息更新 |
| `upload_progress` | `{batch_id, username, total, done, success, failed, duplicates}` | 上传进度 |
| `upload_error` | `{batch_id, username, sha256, file_name, file_size, cloud, error}` | 单条上传失败 |
| `upload_duplicate` | `{batch_id, username, sha256, tmdb_id, title}` | 重复文件 |
| `upload_batch_done` | `{batch_id, username, total, success, failed, duplicates}` | 批次全部处理完成 |

---

## 数据模型

### Media

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uint | 主键 |
| `sha256` | string(64) | 文件哈希，唯一 |
| `file_name` | string(500) | 文件名 |
| `file_size` | int64 | 文件大小 |
| `cloud_type` | string(50) | 云盘标识 |
| `user_id` | uint | 上传用户 ID |
| `tmdb_id` | int | TMDB ID，0 表示未识别 |
| `media_type` | string(10) | `movie` / `tv` |
| `json_data` | JSON | 识别结果详情（TMDB 信息、季/集等） |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### User

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uint | 主键 |
| `username` | string(50) | 唯一 |
| `password` | string(255) | bcrypt 哈希（JSON 中隐藏） |
| `api_key` | string(64) | 唯一 |
| `role` | string(10) | `admin` / `user` |
| `can_edit_tmdb` | bool | 是否允许编辑 TMDB |
| `disabled` | bool | 是否禁用 |
| `created_at` | datetime | |
| `updated_at` | datetime | |

### Invitation

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uint | 主键 |
| `code` | string(32) | 唯一 |
| `created_by` | uint | 创建者用户 ID |
| `expires_at` | datetime | 过期时间 |
| `used_by` | *uint | 使用者 ID |
| `used_at` | *datetime | 使用时间 |
| `created_at` | datetime | |

### ExportLog

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uint | 主键 |
| `user_id` | uint | 操作人 ID |
| `username` | string(50) | 操作人用户名 |
| `item_count` | int | 导出条目数 |
| `params` | text | 导出参数 JSON |
| `created_at` | datetime | |
