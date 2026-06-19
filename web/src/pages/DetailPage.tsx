import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, type MediaItem } from '../api'

export default function DetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [media, setMedia] = useState<MediaItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.getMedia(Number(id)).then(setMedia).finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div style={{
          width: '24px', height: '24px',
          border: '2px solid var(--border)',
          borderTopColor: 'var(--accent-amber)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }} />
      </div>
    )
  }

  if (!media) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="card p-8 text-center">
          <div style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '16px' }}>
            未找到该媒体
          </div>
          <button className="btn-primary" onClick={() => navigate('/')}>返回首页</button>
        </div>
      </div>
    )
  }

  const title = media.json_data?.original_name || media.file_name
  const posterUrl = media.tmdb_id ? `/api/tmdb/poster/${media.media_type}/${media.tmdb_id}` : null

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        position: 'sticky', top: 0, zIndex: 100,
      }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button className="btn-ghost" onClick={() => navigate('/')}
              style={{ fontSize: '13px', padding: '5px 12px' }}>
              ← 返回媒体库
            </button>
          </div>
          <span style={{
            fontFamily: "'Archivo Black', sans-serif", fontSize: '14px',
            color: 'var(--text-dim)', letterSpacing: '-0.02em',
          }}>
            媒体详情
          </span>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="card" style={{ animation: 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>
          <div style={{ display: 'flex', gap: '24px', padding: '24px', flexWrap: 'wrap' }}>
            {posterUrl && (
              <div style={{
                width: '160px', flexShrink: 0, borderRadius: 'var(--radius-sm)',
                overflow: 'hidden', background: 'var(--bg-elevated)',
                alignSelf: 'flex-start',
              }}>
                <img src={posterUrl} alt="" style={{ width: '100%', display: 'block', aspectRatio: '2/3', objectFit: 'cover' }}
                  onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
              </div>
            )}
            <div style={{ flex: 1, minWidth: '280px' }}>
              <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
                <span className={`media-type-badge ${media.media_type}`}>
                  {media.media_type === 'movie' ? '电影' : media.media_type === 'tv' ? '剧集' : media.media_type || '未知'}
                </span>
                {media.tmdb_id ? (
                  <a href={`https://www.themoviedb.org/${media.media_type}/${media.tmdb_id}`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ color: 'var(--accent-amber)', fontSize: '12px', textDecoration: 'none' }}>
                    TMDB {media.tmdb_id} ↗
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>未关联 TMDB</span>
                )}
              </div>

              <h1 style={{
                fontFamily: "'Archivo Black', sans-serif", fontSize: '22px',
                letterSpacing: '-0.02em', color: 'var(--text-primary)',
                marginBottom: '16px',
              }}>
                {title}
              </h1>

              {media.json_data?.tmdb_info?.overview && (
                <div style={{
                  fontSize: '13px', lineHeight: '1.7', color: 'var(--text-muted)',
                  marginBottom: '20px',
                }}>
                  {media.json_data.tmdb_info.overview}
                </div>
              )}

              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '12px', fontSize: '12px',
              }}>
                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '2px' }}>SHA256</div>
                  <code style={{ color: 'var(--text-muted)', fontSize: '11px', wordBreak: 'break-all' }}>{media.sha256}</code>
                </div>
                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '2px' }}>文件大小</div>
                  <div style={{ color: 'var(--text-muted)' }}>{(media.file_size / 1048576).toFixed(2)} MB</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '2px' }}>云存储</div>
                  <div style={{ color: 'var(--text-muted)' }}>{media.cloud_type || '—'}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '2px' }}>文件名</div>
                  <div style={{ color: 'var(--text-muted)', wordBreak: 'break-all' }}>{media.file_name}</div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-dim)', marginBottom: '2px' }}>创建时间</div>
                  <div style={{ color: 'var(--text-muted)' }}>{media.created_at?.slice(0, 19) || '—'}</div>
                </div>
              </div>
            </div>
          </div>

          {media.json_data && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="btn-ghost"
                style={{
                  width: '100%', textAlign: 'left', borderRadius: 0,
                  padding: '10px 24px', fontSize: '12px',
                  border: 'none', borderTop: '1px solid var(--border)',
                }}
              >
                {showRaw ? '▼ 收起原始数据' : '▶ 展开原始数据'}
              </button>
              {showRaw && (
                <pre style={{
                  padding: '16px 24px', fontSize: '11px', lineHeight: '1.6',
                  color: 'var(--text-dim)', overflow: 'auto',
                  maxHeight: '400px', background: 'var(--bg-elevated)',
                  fontFamily: "'DM Sans', monospace",
                }}>
                  {JSON.stringify(media.json_data, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
