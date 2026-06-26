import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api, type LeaderboardItem } from '../api'

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const size = bytes / Math.pow(1024, i)
  return size.toFixed(i > 0 ? 2 : 0) + ' ' + units[i]
}

function getRankEmoji(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return String(rank)
}

export default function LeaderboardPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<LeaderboardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getLeaderboard()
      .then(data => setItems(data.items))
      .catch(err => setError(err.message || '加载失败'))
      .finally(() => setLoading(false))
  }, [])

  const totalSize = items.reduce((sum, item) => sum + item.total_size, 0)
  const totalCount = items.reduce((sum, item) => sum + item.total_count, 0)

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, margin: 0 }}>
          上传排行榜
        </h1>
        <button
          onClick={() => navigate('/')}
          className="btn-ghost"
          style={{ fontSize: '13px', padding: '5px 12px' }}
        >
          返回首页
        </button>
      </header>

      <main style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            加载中...
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--error)' }}>
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
            暂无数据
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '16px',
              marginBottom: '24px',
            }}>
              <div style={{
                background: 'var(--bg-elevated)',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  总用户数
                </div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text)' }}>
                  {items.length}
                </div>
              </div>
              <div style={{
                background: 'var(--bg-elevated)',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  总上传数量
                </div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--text)' }}>
                  {totalCount} 个
                </div>
              </div>
              <div style={{
                background: 'var(--bg-elevated)',
                padding: '20px',
                borderRadius: '8px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              }}>
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  总上传大小
                </div>
                <div style={{ fontSize: '24px', fontWeight: 600, color: 'var(--accent-teal)' }}>
                  {formatSize(totalSize)}
                </div>
              </div>
            </div>

            <table style={{
              width: '100%',
              borderCollapse: 'collapse',
              background: 'var(--bg-elevated)',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 600, width: '80px' }}>排名</th>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600 }}>用户名</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, width: '120px' }}>上传数量</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, width: '140px' }}>上传大小</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr
                    key={item.username}
                    style={{
                      borderBottom: index < items.length - 1 ? '1px solid var(--border)' : 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.background = 'var(--bg-hover)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontSize: '16px' }}>
                      {getRankEmoji(index + 1)}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'left' }}>
                      {item.username}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {item.total_count} 个
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 500, color: 'var(--accent-teal)' }}>
                      {formatSize(item.total_size)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </main>
    </div>
  )
}
