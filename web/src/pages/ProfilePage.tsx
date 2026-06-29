import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context'
import { api } from '../api'

interface Profile {
  id: number
  username: string
  role: string
  can_edit_tmdb: boolean
  created_at: string
}

interface Stats {
  total_files: number
  total_shows: number
  total_size: number
  by_type: Record<string, number>
}

export default function ProfilePage() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const [profile, setProfile] = useState<Profile | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [copied, setCopied] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [loading, setLoading] = useState(true)
  const [playerToken, setPlayerToken] = useState('')
  const [playerTokenSaved, setPlayerTokenSaved] = useState(false)
  const [playerParentId, setPlayerParentId] = useState('')
  const [playerParentIdSaved, setPlayerParentIdSaved] = useState(false)

  useEffect(() => {
    Promise.all([
      api.getUserProfile(),
      api.getUserStats(),
      api.getAPIKey(),
    ]).then(([p, s, k]) => {
      setProfile(p)
      setStats(s)
      setApiKey(k.api_key)
    }).catch(() => {
    }).finally(() => setLoading(false))

    const savedToken = localStorage.getItem('player_auth_token') || ''
    setPlayerToken(savedToken)
    const savedParentId = localStorage.getItem('player_parent_id') || '/'
    setPlayerParentId(savedParentId)
  }, [])

  function handleCopy() {
    navigator.clipboard.writeText(apiKey).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function handleSavePlayerToken() {
    localStorage.setItem('player_auth_token', playerToken)
    setPlayerTokenSaved(true)
    setTimeout(() => setPlayerTokenSaved(false), 2000)
  }

  function handleSavePlayerParentId() {
    localStorage.setItem('player_parent_id', playerParentId)
    setPlayerParentIdSaved(true)
    setTimeout(() => setPlayerParentIdSaved(false), 2000)
  }

  async function handleResetKey() {
    setResetting(true)
    try {
      const res = await api.resetAPIKey()
      setApiKey(res.api_key)
      setShowKey(true)
      setConfirmReset(false)
    } catch {
    } finally {
      setResetting(false)
    }
  }

  function formatBytes(bytes: number): string {
    if (!bytes) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    let size = bytes
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024
      i++
    }
    return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>加载中...</div>
      </div>
    )
  }

  const maxTypeCount = stats ? Math.max(...Object.values(stats.by_type), 1) : 1

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
              个人中心
            </span>
            <button className="btn-ghost" onClick={() => navigate('/')}
              style={{ fontSize: '13px', padding: '5px 12px' }}>
              ← 返回
            </button>
          </div>
          <button onClick={logout} className="btn-ghost">退出登录</button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="profile-content-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Profile Card */}
          <section className="card animate-in stagger-1">
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: '15px', color: 'var(--text-primary)' }}>
                个人信息
              </h3>
            </div>
            <div className="px-6 py-5 space-y-4">
              {profile && (
                <>
                  <div>
                    <div style={{ fontSize: '11px', fontFamily: "'Archivo Black', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      用户名
                    </div>
                    <div style={{ fontSize: '15px', fontWeight: '500', color: 'var(--text-primary)' }}>
                      {profile.username}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontFamily: "'Archivo Black', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      角色
                    </div>
                    <div>
                      <span className="media-type-badge" style={{
                        color: profile.role === 'admin' ? 'var(--accent-amber)' : 'var(--accent-teal)',
                        background: profile.role === 'admin' ? 'var(--accent-amber-glow)' : 'var(--accent-teal-dim)',
                      }}>
                        {profile.role === 'admin' ? 'ADMIN' : 'USER'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontFamily: "'Archivo Black', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      TMDB 编辑权限
                    </div>
                    <div style={{ fontSize: '14px', color: profile.can_edit_tmdb ? 'var(--success)' : 'var(--text-dim)' }}>
                      {profile.can_edit_tmdb ? '已开启' : '未开启'}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', fontFamily: "'Archivo Black', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      注册时间
                    </div>
                    <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>
                      {new Date(profile.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          {/* Stats Card */}
          <section className="card animate-in stagger-2">
            <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: '15px', color: 'var(--text-primary)' }}>
                上传统计
              </h3>
            </div>
            <div className="px-6 py-5">
              {stats && (
                <>
                  <div className="profile-stats-row" style={{
                    display: 'flex',
                    marginBottom: '28px',
                  }}>
                    {[
                      { value: stats.total_files, label: '文件总数', color: 'var(--accent-amber)' },
                      { value: stats.total_shows, label: '剧集/电影', color: 'var(--accent-teal)' },
                      { value: formatBytes(stats.total_size), label: '上传总大小', color: 'var(--accent-amber)' },
                    ].map((item, i) => (
                      <div key={i} className="profile-stat-block" style={{
                        flex: 1,
                        textAlign: 'center',
                        padding: '4px 12px',
                        borderRight: i < 2 ? '1px solid var(--border)' : 'none',
                      }}>
                        <div className="profile-stat-value" style={{
                          fontSize: '28px',
                          fontFamily: "'Archivo Black', sans-serif",
                          color: item.color,
                          lineHeight: 1.15,
                          letterSpacing: '-0.02em',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {item.value}
                        </div>
                        <div className="profile-stat-label" style={{
                          fontSize: '11px',
                          color: 'var(--text-dim)',
                          marginTop: '6px',
                          fontFamily: "'DM Sans', sans-serif",
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                        }}>
                          {item.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {Object.keys(stats.by_type).length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '11px', fontFamily: "'Archivo Black', sans-serif", letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '2px' }}>
                        类型分布
                      </div>
                      {Object.entries(stats.by_type).map(([type, count]) => (
                        <div key={type}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                            <span className="media-type-badge" style={{
                              color: type === 'movie' ? 'var(--accent-amber)' : 'var(--accent-teal)',
                              background: type === 'movie' ? 'var(--accent-amber-glow)' : 'var(--accent-teal-dim)',
                              fontSize: '10px',
                            }}>
                              {type === 'movie' ? 'MOVIE' : type === 'tv' ? 'TV' : type.toUpperCase()}
                            </span>
                            <span style={{ fontSize: '13px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                              {count}
                            </span>
                          </div>
                          <div style={{
                            height: '6px',
                            background: 'var(--bg-elevated)',
                            borderRadius: '3px',
                            overflow: 'hidden',
                          }}>
                            <div style={{
                              height: '100%',
                              width: `${(count / maxTypeCount) * 100}%`,
                              background: type === 'movie' ? 'var(--accent-amber)' : 'var(--accent-teal)',
                              borderRadius: '3px',
                              transition: 'width 0.5s ease',
                            }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        </div>

        {/* API Key Card */}
        <section className="card animate-in stagger-3" style={{ marginTop: '16px' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: '15px', color: 'var(--text-primary)' }}>
              API Key
            </h3>
          </div>
          <div className="px-6 py-5">
            <div className="profile-api-row" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div className="profile-api-key" style={{
                flex: 1,
                padding: '10px 14px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                fontFamily: 'monospace',
                fontSize: '13px',
                color: 'var(--text-primary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                userSelect: showKey ? 'text' : 'none',
                filter: showKey ? 'none' : 'blur(4px)',
                transition: 'filter 0.2s ease',
              }}>
                {apiKey}
              </div>
              <button
                className="btn-ghost"
                onClick={() => setShowKey(!showKey)}
                style={{ whiteSpace: 'nowrap', fontSize: '12px', padding: '8px 14px' }}
              >
                {showKey ? '隐藏' : '显示'}
              </button>
              <button
                className="btn-ghost"
                onClick={handleCopy}
                disabled={!showKey}
                style={{ whiteSpace: 'nowrap', fontSize: '12px', padding: '8px 14px' }}
              >
                {copied ? '已复制' : '复制'}
              </button>
            </div>
            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button
                className="btn-ghost"
                onClick={() => setConfirmReset(true)}
                style={{
                  whiteSpace: 'nowrap',
                  fontSize: '12px',
                  padding: '8px 14px',
                  color: 'var(--error)',
                  borderColor: 'rgba(229, 72, 77, 0.3)',
                }}
              >
                重置 API Key
              </button>
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                重置后旧 Key 将立即失效
              </span>
            </div>
          </div>
        </section>

        <section style={{ marginTop: '32px' }}>
          <h2 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: '16px', color: 'var(--text-primary)', marginBottom: '16px', letterSpacing: '-0.01em' }}>
            播放设置
          </h2>
          <div className="card" style={{ padding: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              Yun139 Auth Token（Base64 编码）
            </label>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input
                type="text"
                value={playerToken}
                onChange={(e) => setPlayerToken(e.target.value)}
                placeholder="输入 auth_token"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                }}
              />
              <button
                className="btn-primary"
                onClick={handleSavePlayerToken}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                {playerTokenSaved ? '已保存' : '保存'}
              </button>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '8px', marginBottom: '16px' }}>
              从 Yun139 网页端获取认证信息，格式为 Base64 编码的字符串
            </p>

            <label style={{ display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
              秒传目标文件夹 ID
            </label>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <input
                type="text"
                value={playerParentId}
                onChange={(e) => setPlayerParentId(e.target.value)}
                placeholder="输入文件夹 ID，如 / 或具体文件夹ID"
                style={{
                  flex: 1,
                  padding: '8px 12px',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  background: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '14px',
                }}
              />
              <button
                className="btn-primary"
                onClick={handleSavePlayerParentId}
                style={{ padding: '8px 16px', fontSize: '13px' }}
              >
                {playerParentIdSaved ? '已保存' : '保存'}
              </button>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-dim)', marginTop: '8px' }}>
              秒传文件的目标文件夹，默认为根目录 "/"
            </p>
          </div>
        </section>
      </div>

      {/* Reset Confirmation Modal */}
      {confirmReset && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 200,
        }} onClick={() => setConfirmReset(false)}>
          <div className="card" style={{ padding: '24px', maxWidth: '400px', width: '90%' }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: '16px', color: 'var(--text-primary)', marginBottom: '12px' }}>
              确认重置 API Key
            </h3>
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
              重置后当前 API Key 将立即失效，任何使用旧 Key 的应用都将无法继续访问。此操作不可撤销。
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={() => setConfirmReset(false)}>取消</button>
              <button
                className="btn-primary"
                onClick={handleResetKey}
                disabled={resetting}
                style={{ background: 'var(--error)', padding: '8px 20px', fontSize: '13px' }}
              >
                {resetting ? '重置中...' : '确认重置'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
