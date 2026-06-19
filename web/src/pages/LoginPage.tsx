import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context'
import { api } from '../api'

export default function LoginPage() {
  const { setToken, setRole, setUsername: setAuthUsername, setUserId } = useAuth()
  const navigate = useNavigate()
  const [isRegister, setIsRegister] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = isRegister
        ? await api.register(username, password, inviteCode)
        : await api.login(username, password)
      setToken(res.token)
      if (res.role) setRole(res.role)
      if (res.username) setAuthUsername(res.username)
      if (res.user_id) setUserId(res.user_id)
      navigate('/')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      {/* decorative bg glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{
          position: 'absolute', top: '-30%', right: '-15%',
          width: '60vw', height: '60vw', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,168,83,0.04) 0%, transparent 70%)',
        }} />
        <div style={{
          position: 'absolute', bottom: '-20%', left: '-10%',
          width: '50vw', height: '50vw', borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(45,212,191,0.035) 0%, transparent 70%)',
        }} />
      </div>

      <div className="w-full max-w-md px-6" style={{ animation: 'slideUp 0.6s cubic-bezier(0.16,1,0.3,1) both' }}>
        <div className="card p-10">
          <div className="text-center mb-10">
            <div className="tracking-tight" style={{
              fontFamily: "'Archivo Black', sans-serif",
              fontSize: '28px', letterSpacing: '-0.03em',
              color: 'var(--accent-amber)', marginBottom: '6px',
            }}>
              MEDIA TRACKER
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              哈希识别 &amp; 元数据归档
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <div className="text-xxs mb-2" style={{
                fontFamily: "'Archivo Black', sans-serif", fontSize: '11px',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}>
                用户名
              </div>
              <input
                className="input-base"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>

            <div>
              <div className="text-xxs mb-2" style={{
                fontFamily: "'Archivo Black', sans-serif", fontSize: '11px',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}>
                密码
              </div>
              <input
                className="input-base"
                type="password"
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {isRegister && (
              <div>
                <div className="text-xxs mb-2" style={{
                  fontFamily: "'Archivo Black', sans-serif", fontSize: '11px',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  color: 'var(--text-muted)',
                }}>
                  邀请码
                </div>
                <input
                  className="input-base"
                  placeholder="请输入邀请码"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                />
              </div>
            )}

            {error && (
              <div style={{
                padding: '10px 14px',
                background: 'rgba(229, 72, 77, 0.1)',
                border: '1px solid rgba(229, 72, 77, 0.3)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--error)',
                fontSize: '13px',
              }}>
                {error}
              </div>
            )}

            <button className="btn-primary w-full" disabled={loading}>
              {loading ? (
                <span style={{ opacity: 0.6 }}>处理中...</span>
              ) : isRegister ? '创建账户' : '登录'}
            </button>
          </form>

          <div className="text-center mt-8" style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {isRegister ? '已有账户？' : '没有账户？'}{' '}
            <button
              onClick={() => { setIsRegister(!isRegister); setError(''); setInviteCode('') }}
              style={{
                background: 'none', border: 'none', color: 'var(--accent-teal)',
                cursor: 'pointer', fontWeight: '600', fontSize: '13px', padding: 0,
              }}
            >
              {isRegister ? '登录' : '注册'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
