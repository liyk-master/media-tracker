import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { api, type MediaItem } from '../api'
import Artplayer from 'artplayer'

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB'
  return (bytes / 1048576).toFixed(2) + ' MB'
}

export default function DetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [media, setMedia] = useState<MediaItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [showRaw, setShowRaw] = useState(false)
  const [showPlayer, setShowPlayer] = useState(false)
  const [playUrl, setPlayUrl] = useState('')
  const playerRef = useRef<Artplayer | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    api.getMedia(Number(id)).then(setMedia).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (showPlayer && containerRef.current && !playerRef.current && playUrl) {
      console.log('=== 播放器初始化 ===')
      console.log('容器:', containerRef.current)
      console.log('播放 URL:', playUrl)
      console.log('时间:', new Date().toISOString())
      
      const art = new Artplayer({
        container: containerRef.current,
        url: playUrl,
        volume: 0.5,
        autoplay: true,
        pip: true,
        autoSize: true,
        autoMini: true,
        screenshot: true,
        setting: true,
        loop: true,
        flip: true,
        playbackRate: true,
        aspectRatio: true,
        fullscreen: true,
        fullscreenWeb: true,
        subtitleOffset: true,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        autoPlayback: true,
        airplay: true,
        theme: '#23ade5',
        lang: navigator.language.toLowerCase(),
        moreVideoAttr: {},
      })

      art.on('ready', () => {
        console.log('=== 播放器就绪 ===')
      })

      art.on('video:loadedmetadata', () => {
        console.log('=== 视频元数据加载完成 ===')
        console.log('视频元素:', art.video)
        console.log('视频 src:', art.video?.src)
        console.log('视频 currentSrc:', art.video?.currentSrc)
        console.log('视频 readyState:', art.video?.readyState)
        console.log('视频 networkState:', art.video?.networkState)
      })

      art.on('video:canplay', () => {
        console.log('=== 视频可以播放 ===')
        console.log('视频时长:', art.duration)
        console.log('视频宽度:', art.video?.videoWidth)
        console.log('视频高度:', art.video?.videoHeight)
      })

      art.on('error', (error: any) => {
        console.error('=== 播放器错误 ===')
        console.error('错误对象:', error)
        console.log('播放器实例:', art)
      })

      art.on('video:error', (error: any) => {
        console.error('=== 视频加载错误 ===')
        console.error('错误对象:', error)
        console.log('视频元素:', art.video)
        console.log('视频 src:', art.video?.src)
        console.log('视频 currentSrc:', art.video?.currentSrc)
        console.log('视频 readyState:', art.video?.readyState)
        console.log('视频 networkState:', art.video?.networkState)
        console.log('视频 error:', art.video?.error)
        
        if (art.video?.src) {
          console.log('尝试手动 fetch:', art.video.src)
          fetch(art.video.src, { method: 'HEAD' })
            .then(r => {
              console.log('Fetch 响应:', {
                status: r.status,
                statusText: r.statusText,
                url: r.url,
                headers: Object.fromEntries(r.headers.entries())
              })
            })
            .catch(e => console.error('Fetch 错误:', e))
        }
      })

      playerRef.current = art
    }

    return () => {
      if (!showPlayer && playerRef.current) {
        console.log('销毁播放器')
        playerRef.current.destroy()
        playerRef.current = null
      }
    }
  }, [showPlayer, playUrl])

  // 自动播放
  const autoPlayedRef = useRef(false)
  useEffect(() => {
    if (media && searchParams.get('autoplay') === '1' && !autoPlayedRef.current) {
      autoPlayedRef.current = true
      handlePlay()
    }
  }, [media, searchParams])

  function handlePlay() {
    const token = localStorage.getItem('player_auth_token') || ''
    if (!token) {
      alert('请先在个人中心设置 Yun139 Auth Token')
      return
    }

    if (!media) return

    const parentId = localStorage.getItem('player_parent_id') || '/'
    
    // 开发环境直接连接后端，生产环境使用当前域名
    const apiBaseUrl = import.meta.env.DEV 
      ? 'http://localhost:8082'
      : window.location.origin
    
    const url = `${apiBaseUrl}/api/media/${media.id}/play?auth_token=${encodeURIComponent(token)}&parent_id=${encodeURIComponent(parentId)}`

    console.log('=== 播放请求 ===')
    console.log('播放 URL:', url)
    console.log('API Base URL:', apiBaseUrl)

    setPlayUrl(url)
    setShowPlayer(true)
  }

  function handleClosePlayer() {
    if (playerRef.current) {
      playerRef.current.destroy()
      playerRef.current = null
    }
    setShowPlayer(false)
  }

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
                  <div style={{ color: 'var(--text-muted)' }}>{formatSize(media.file_size)}</div>
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

              <button
                onClick={handlePlay}
                className="btn-primary"
                style={{ marginTop: '16px', padding: '8px 16px', fontSize: '13px' }}
              >
                ▶ 播放
              </button>
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

      {showPlayer && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            width: '90%',
            maxWidth: '1200px',
            background: 'var(--bg-primary)',
            borderRadius: '8px',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '8px',
              background: 'var(--bg-surface)',
            }}>
              <button
                onClick={handleClosePlayer}
                className="btn-ghost"
                style={{ fontSize: '13px', padding: '5px 12px' }}
              >
                关闭
              </button>
            </div>
            <div
              ref={containerRef}
              className="artplayer-app"
              style={{
                width: '100%',
                height: '500px',
                position: 'relative',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
