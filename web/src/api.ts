const BASE = import.meta.env.VITE_API_BASE || ''
const WS_BASE = import.meta.env.VITE_WS_URL || (BASE ? BASE.replace(/^http/, 'ws') : '')

export interface MediaItem {
  id: number
  sha256: string
  file_name: string
  file_size: number
  cloud_type: string
  user_id: number
  tmdb_id: number
  media_type: string
  json_data: Record<string, any>
  created_at: string
  count?: number
  total_size?: number
}

export interface SubmitResult {
  batch_id: string
  total: number
  skipped: number
}

export interface UploadProgress {
  batch_id: string
  total: number
  done: number
  success: number
  failed: number
  duplicates: number
}

export interface MediaListResult {
  total: number
  page: number
  page_size: number
  items: MediaItem[]
}

function getToken(): string | null {
  return localStorage.getItem('token')
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = 'Bearer ' + token
  }
  const res = await fetch(BASE + path, { ...options, headers })
  if (res.status === 401) {
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    window.location.href = '/login'
    throw new Error('认证已过期')
  }
  const body = await res.json()
  if (body.code !== 0) {
    throw new Error(body.message || 'Request failed')
  }
  return body.data as T
}

export const api = {
  async register(username: string, password: string, inviteCode?: string) {
    await request<{ user_id: number; role: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, invite_code: inviteCode || '' }),
    })
    return api.login(username, password)
  },

  login(username: string, password: string) {
    return request<{ token: string; role: string; user_id: number; username: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  upload(jsonData: Record<string, any>) {
    return request<SubmitResult>('/api/upload', {
      method: 'POST',
      body: JSON.stringify(jsonData),
    })
  },

  uploadBatch(items: Record<string, any>[]) {
    return request<SubmitResult>('/api/upload/batch', {
      method: 'POST',
      body: JSON.stringify(items),
    })
  },

  listMedia(params?: {
    page?: number; page_size?: number; q?: string; media_type?: string; tmdb_id?: number; group_by?: string; year?: number
  }) {
    const q = new URLSearchParams()
    if (params?.page) q.set('page', String(params.page))
    if (params?.page_size) q.set('page_size', String(params.page_size))
    if (params?.q) q.set('q', params.q)
    if (params?.media_type) q.set('media_type', params.media_type)
    if (params?.tmdb_id) q.set('tmdb_id', String(params.tmdb_id))
    if (params?.group_by) q.set('group_by', params.group_by)
    if (params?.year) q.set('year', String(params.year))
    return request<MediaListResult>('/api/media?' + q.toString())
  },

  getMedia(id: number) {
    return request<MediaItem>(`/api/media/${id}`)
  },

  async exportMedia(params?: { q?: string; media_type?: string; tmdb_id?: number; ids?: number[]; tmdb_ids?: number[] }) {
    const q = new URLSearchParams()
    if (params?.q) q.set('q', params.q)
    if (params?.media_type) q.set('media_type', params.media_type)
    if (params?.tmdb_id) q.set('tmdb_id', String(params.tmdb_id))
    if (params?.ids?.length) q.set('ids', params.ids.join(','))
    if (params?.tmdb_ids?.length) q.set('tmdb_ids', params.tmdb_ids.join(','))
    const token = getToken()
    const res = await fetch(BASE + '/api/media/export?' + q.toString(), {
      headers: token ? { 'Authorization': 'Bearer ' + token } : {},
    })
    if (res.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('role')
      window.location.href = '/login'
      throw new Error('认证已过期')
    }
    if (!res.ok) throw new Error('导出失败')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'media_export.json'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },

  updateMediaTMDB(id: number, tmdbId: number, mediaType?: string) {
    return request<MediaItem>(`/api/media/${id}/tmdb`, {
      method: 'PUT',
      body: JSON.stringify({ tmdb_id: tmdbId, media_type: mediaType }),
    })
  },

  validateManual(filePath: string, mediaType: string) {
    return request<any>('/api/manual/validate', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath, media_type: mediaType }),
    })
  },

  getAPIKey() {
    return request<{ api_key: string }>('/api/user/apikey')
  },

  getUserProfile() {
    return request<{ id: number; username: string; role: string; can_edit_tmdb: boolean; created_at: string }>('/api/user/profile')
  },

  getUserStats() {
    return request<{ total_files: number; total_shows: number; total_size: number; by_type: Record<string, number> }>('/api/user/stats')
  },

  resetAPIKey() {
    return request<{ api_key: string }>('/api/user/apikey/reset', { method: 'POST' })
  },
}

export function connectWS(onMessage: (data: any) => void): WebSocket {
  const token = getToken()
  const baseUrl = WS_BASE || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`
  const wsUrl = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl
  const ws = new WebSocket(wsUrl)
  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      onMessage(msg)
    } catch { /* ignore */ }
  }
  ws.onopen = () => console.log('WebSocket 已连接')
  ws.onerror = (e) => console.error('WebSocket 错误:', e)
  ws.onclose = () => console.log('WebSocket 已断开')
  return ws
}
