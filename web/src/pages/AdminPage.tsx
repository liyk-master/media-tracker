import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context'

interface UserItem {
  id: number
  username: string
  role: string
  api_key: string
  can_edit_tmdb: boolean
  disabled: boolean
  created_at: string
}

interface InvitationItem {
  id: number
  code: string
  created_by: number
  expires_at: string
  used_by: number | null
  used_at: string | null
  created_at: string
}

interface ExportLogItem {
  id: number
  user_id: number
  username: string
  item_count: number
  params: string
  created_at: string
}

const BASE = import.meta.env.VITE_API_BASE || ''

async function adminRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token')
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(options.headers as Record<string, string>),
    },
  })
  const body = await res.json()
  if (body.code !== 0) throw new Error(body.message)
  return body.data as T
}

export default function AdminPage() {
  const { role, logout } = useAuth()
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserItem[]>([])
  const [invitations, setInvitations] = useState<InvitationItem[]>([])
  const [exportLogs, setExportLogs] = useState<ExportLogItem[]>([])
  const [exportLogPage, setExportLogPage] = useState(1)
  const [exportLogTotal, setExportLogTotal] = useState(0)
  const [expireHours, setExpireHours] = useState(72)
  const [genCount, setGenCount] = useState(1)
  const [genResult, setGenResult] = useState<string[]>([])
  const [error, setError] = useState('')

  const loadData = useCallback(async () => {
    try {
      const [u, inv] = await Promise.all([
        adminRequest<{ users: UserItem[] }>('/api/admin/users'),
        adminRequest<{ invitations: InvitationItem[] }>('/api/admin/invitations'),
      ])
      setUsers(u.users)
      setInvitations(inv.invitations)
    } catch { /* ignore */ }
  }, [])

  const loadExportLogs = useCallback(async (p: number) => {
    try {
      const res = await adminRequest<{ items: ExportLogItem[]; total: number; page: number }>('/api/admin/export-logs?page=' + p + '&page_size=20')
      setExportLogs(res.items)
      setExportLogTotal(res.total)
      setExportLogPage(res.page)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => { loadExportLogs(exportLogPage) }, [exportLogPage, loadExportLogs])

  async function handleGenerate() {
    setError('')
    try {
      const res = await adminRequest<{ count: number; codes: { code: string; expires_at: string }[] }>('/api/admin/invitations', {
        method: 'POST',
        body: JSON.stringify({ expire_hours: expireHours, count: genCount }),
      })
      setGenResult(res.codes.map((c) => c.code))
      loadData()
    } catch (err: any) {
      setError(err.message)
    }
  }

  if (role !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="card p-8 text-center">
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
            无管理员权限
          </div>
          <button className="btn-primary" onClick={() => navigate('/')}>返回首页</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: '18px', letterSpacing: '-0.02em', color: 'var(--accent-amber)' }}>
              管理面板
            </span>
            <button className="btn-ghost" onClick={() => navigate('/')}
              style={{ fontSize: '13px', padding: '5px 12px' }}>
              ← 返回
            </button>
          </div>
          <button onClick={logout} className="btn-ghost">退出登录</button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* 用户列表 */}
        <section className="card">
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: '15px', color: 'var(--text-primary)' }}>
              用户管理
            </h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                  <tr>
                    <th>ID</th>
                    <th>用户名</th>
                    <th>状态</th>
                    <th>角色</th>
                    <th>编辑权限</th>
                    <th>API Key</th>
                    <th>注册时间</th>
                    <th>操作</th>
                  </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} style={{
                    opacity: u.disabled ? 0.5 : 1,
                    transition: 'opacity 0.2s',
                  }}>
                    <td>{u.id}</td>
                    <td style={{ fontWeight: '500' }}>{u.username}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '12px',
                        background: u.disabled ? 'rgba(239,68,68,0.1)' : 'rgba(45,212,191,0.1)',
                        color: u.disabled ? 'rgb(239,68,68)' : 'var(--accent-teal)',
                      }}>
                        {u.disabled ? '已禁用' : '正常'}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '12px',
                        background: u.role === 'admin' ? 'rgba(212,168,83,0.15)' : 'rgba(45,212,191,0.1)',
                        color: u.role === 'admin' ? 'var(--accent-amber)' : 'var(--accent-teal)',
                      }}>
                        {u.role === 'admin' ? '管理员' : '用户'}
                      </span>
                    </td>
                    <td>
                      <button className="btn-ghost" style={{
                        fontSize: '12px', padding: '2px 10px',
                        color: u.can_edit_tmdb ? 'var(--accent-teal)' : 'var(--text-dim)',
                      }} onClick={async () => {
                        try {
                          await adminRequest('/api/admin/users/' + u.id, {
                            method: 'PATCH',
                            body: JSON.stringify({ can_edit_tmdb: !u.can_edit_tmdb }),
                          })
                          loadData()
                        } catch (err: any) {
                          setError(err.message)
                        }
                      }}>
                        {u.can_edit_tmdb ? '已允许' : '未允许'}
                      </button>
                    </td>
                    <td><code style={{ fontSize: '12px', color: 'var(--text-dim)' }}>{u.api_key?.slice(0, 16)}...</code></td>
                    <td style={{ color: 'var(--text-dim)', fontSize: '12px' }}>{u.created_at?.slice(0, 10)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {u.role !== 'admin' && (
                          <>
                            <button className="btn-ghost" style={{
                              fontSize: '12px', padding: '2px 8px',
                              color: u.disabled ? 'var(--accent-teal)' : 'var(--text-dim)',
                            }} onClick={async () => {
                              try {
                                await adminRequest('/api/admin/users/' + u.id + '/status', {
                                  method: 'PATCH',
                                  body: JSON.stringify({ disabled: !u.disabled }),
                                })
                                loadData()
                              } catch (err: any) {
                                setError(err.message)
                              }
                            }}>
                              {u.disabled ? '启用' : '禁用'}
                            </button>
                            <button className="btn-ghost" style={{
                              fontSize: '12px', padding: '2px 8px',
                              color: 'rgb(239,68,68)',
                            }} onClick={async () => {
                              if (!confirm('确定要删除用户「' + u.username + '」吗？')) return
                              try {
                                await adminRequest('/api/admin/users/' + u.id, { method: 'DELETE' })
                                loadData()
                              } catch (err: any) {
                                setError(err.message)
                              }
                            }}>
                              删除
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 生成邀请码 */}
        <section className="card">
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: '15px', color: 'var(--text-primary)' }}>
              生成邀请码
            </h3>
          </div>
          <div className="p-6">
            <div className="flex items-end gap-4 mb-4">
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>有效期（小时）</div>
                <input className="input-base" type="number" style={{ width: '100px' }}
                  value={expireHours} onChange={(e) => setExpireHours(Number(e.target.value))} min={1} />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>生成数量</div>
                <input className="input-base" type="number" style={{ width: '80px' }}
                  value={genCount} onChange={(e) => setGenCount(Number(e.target.value))} min={1} max={100} />
              </div>
              <button className="btn-primary" onClick={handleGenerate}>生成</button>
            </div>

            {genResult.length > 0 && (
              <div style={{
                padding: '12px', background: 'var(--bg-card)', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', fontSize: '13px',
              }}>
                <div style={{ color: 'var(--accent-teal)', marginBottom: '8px' }}>
                  生成了 {genResult.length} 个邀请码
                </div>
                {genResult.map((code, i) => (
                  <div key={i} className="flex items-center justify-between py-1"
                    style={{ borderBottom: i < genResult.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <code style={{ fontFamily: "'DM Sans', monospace", color: 'var(--text-primary)' }}>{code}</code>
                    <button className="btn-ghost" style={{ fontSize: '11px', padding: '2px 8px' }}
                      onClick={() => { navigator.clipboard.writeText(code) }}>
                      复制
                    </button>
                  </div>
                ))}
              </div>
            )}

            {error && <div style={{ color: 'var(--error)', fontSize: '13px', marginTop: '8px' }}>{error}</div>}
          </div>
        </section>

        {/* 邀请码列表 */}
        <section className="card">
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: '15px', color: 'var(--text-primary)' }}>
              邀请记录
            </h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>邀请码</th>
                  <th>过期时间</th>
                  <th>状态</th>
                  <th>使用时间</th>
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv) => (
                  <tr key={inv.id}>
                    <td><code style={{ fontSize: '12px' }}>{inv.code}</code></td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{inv.expires_at?.slice(0, 16)}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: '4px', fontSize: '12px',
                        background: inv.used_by ? 'rgba(45,212,191,0.1)' : 'rgba(212,168,83,0.15)',
                        color: inv.used_by ? 'var(--accent-teal)' : 'var(--accent-amber)',
                      }}>
                        {inv.used_by ? '已使用' : '未使用'}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                      {inv.used_at ? inv.used_at.slice(0, 16) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 导出记录 */}
        <section className="card">
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: '15px', color: 'var(--text-primary)' }}>
              导出记录
            </h3>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>用户</th>
                  <th>数量</th>
                  <th>筛选条件</th>
                </tr>
              </thead>
              <tbody>
                {exportLogs.map((log) => {
                  let paramsDisplay = '—'
                  try {
                    const p = JSON.parse(log.params)
                    const parts: string[] = []
                    if (p.q) parts.push('搜索: ' + p.q)
                    if (p.media_type) parts.push('类型: ' + p.media_type)
                    if (p.tmdb_ids) parts.push('TMDB ID: ' + p.tmdb_ids)
                    if (p.ids) parts.push('选中 ' + p.ids.split(',').length + ' 条')
                    paramsDisplay = parts.join(' · ') || '全部'
                  } catch { /* ignore */ }
                  return (
                    <tr key={log.id}>
                      <td style={{ fontSize: '12px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{log.created_at?.slice(0, 16)}</td>
                      <td style={{ fontWeight: '500' }}>{log.username}</td>
                      <td style={{ color: 'var(--text-muted)' }}>{log.item_count}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{paramsDisplay}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {exportLogTotal > 20 && (
            <div className="flex items-center justify-center gap-3 py-4" style={{ borderTop: '1px solid var(--border)' }}>
              <button className="btn-ghost" disabled={exportLogPage <= 1}
                onClick={() => setExportLogPage(p => p - 1)}
                style={{ padding: '5px 14px', fontSize: '12px', opacity: exportLogPage <= 1 ? 0.4 : 1 }}>
                ← 上一页
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                {exportLogPage} / {Math.ceil(exportLogTotal / 20)}
              </span>
              <button className="btn-ghost" disabled={exportLogPage >= Math.ceil(exportLogTotal / 20)}
                onClick={() => setExportLogPage(p => p + 1)}
                style={{ padding: '5px 14px', fontSize: '12px', opacity: exportLogPage >= Math.ceil(exportLogTotal / 20) ? 0.4 : 1 }}>
                下一页 →
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
