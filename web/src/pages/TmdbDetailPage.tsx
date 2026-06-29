import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api, type MediaItem } from '../api'

const API_PAGE_SIZE = 100
const EPISODE_PAGE_SIZE = 50

function episodeLabel(item: MediaItem): string {
  const s = item.json_data?.season
  const e = item.json_data?.episode
  if (s != null && e != null && s > 0 && e > 0) return `S${String(s).padStart(2, '0')}E${String(e).padStart(2, '0')}`
  return '其他'
}

function versionLabel(item: MediaItem): string {
  const tags = item.json_data?.quality_tags
  const group = item.json_data?.release_group
  if (tags && group) return `${tags} · ${group}`
  if (tags) return tags
  if (group) return group
  return item.json_data?.suggested_name || item.file_name
}

function formatSize(bytes: number): string {
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

export default function TmdbDetailPage() {
  const { tmdbId } = useParams()
  const navigate = useNavigate()
  const [items, setItems] = useState<MediaItem[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [currentApiPage, setCurrentApiPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [episodePage, setEpisodePage] = useState(0)
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null)
  const [sortField, setSortField] = useState<'file_size' | 'created_at'>('file_size')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const fetchPage = useCallback(async (page: number) => {
    const res = await api.listMedia({ tmdb_id: Number(tmdbId), page, page_size: API_PAGE_SIZE, group_by: '' })
    return res
  }, [tmdbId])

  useEffect(() => {
    if (!tmdbId || isNaN(Number(tmdbId))) return
    setLoading(true)
    setItems([])
    setCurrentApiPage(0)
    setTotalCount(0)
    setEpisodePage(0)
    setExpanded(new Set())
    setSelectedSeason(null)
    setSortField('file_size')
    setSortOrder('desc')
    setLoadingMore(false)
    fetchPage(1).then((res) => {
      setItems(res.items)
      setTotalCount(res.total)
      setCurrentApiPage(1)
    }).finally(() => setLoading(false))
  }, [tmdbId, fetchPage])

  const loadMore = async () => {
    setLoadingMore(true)
    const nextPage = currentApiPage + 1
    try {
      const res = await fetchPage(nextPage)
      setItems(prev => [...prev, ...res.items])
      setCurrentApiPage(nextPage)
    } finally {
      setLoadingMore(false)
    }
  }

  const hasMore = items.length < totalCount

  const first = items[0]
  const isMovie = first?.media_type === 'movie'

  function sortItems(list: MediaItem[]): MediaItem[] {
    return [...list].sort((a, b) => {
      let cmp = 0
      if (sortField === 'file_size') {
        cmp = a.file_size - b.file_size
      } else {
        cmp = (a.created_at || '').localeCompare(b.created_at || '')
      }
      return sortOrder === 'desc' ? -cmp : cmp
    })
  }

  const groups = items.reduce<Record<string, MediaItem[]>>((acc, m) => {
    const key = isMovie ? '__movie__' : episodeLabel(m)
    ;(acc[key] ??= []).push(m)
    return acc
  }, {})
  for (const key of Object.keys(groups)) {
    groups[key] = sortItems(groups[key])
  }

  const seasons = isMovie ? [] : [...new Set(items.map(m => m.json_data?.season).filter((s): s is number => s != null && s > 0))].sort((a, b) => a - b)

  let sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === '其他') return 1
    if (b === '其他') return -1
    return a.localeCompare(b)
  })
  if (selectedSeason != null) {
    const prefix = `S${String(selectedSeason).padStart(2, '0')}`
    sortedKeys = sortedKeys.filter(k => k.startsWith(prefix))
  }
  const totalEpisodePages = Math.max(1, Math.ceil(sortedKeys.length / EPISODE_PAGE_SIZE))
  const pageKeys = sortedKeys.slice(episodePage * EPISODE_PAGE_SIZE, (episodePage + 1) * EPISODE_PAGE_SIZE)

  const title = first?.json_data?.title || first?.json_data?.original_name || first?.file_name || `TMDB #${tmdbId}`
  const posterUrl = first?.tmdb_id ? `/api/tmdb/poster/${first.media_type}/${first.tmdb_id}` : null
  const overview = first?.json_data?.tmdb_info?.overview

  const toggleGroup = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

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
          <div className="flex items-center gap-3">
            <a href={`https://www.themoviedb.org/${first?.media_type}/${tmdbId}`}
              target="_blank" rel="noopener noreferrer"
              style={{ color: 'var(--accent-amber)', fontSize: '12px', textDecoration: 'none' }}>
              TMDB {tmdbId} ↗
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        {loading ? (
          <div className="card p-12 text-center">
            <div style={{
              display: 'inline-block', width: '24px', height: '24px',
              border: '2px solid var(--border)', borderTopColor: 'var(--accent-amber)',
              borderRadius: '50%', animation: 'spin 0.8s linear infinite',
            }} />
          </div>
        ) : items.length === 0 ? (
          <div className="card p-12 text-center">
            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>未找到相关文件</div>
          </div>
        ) : (
          <div style={{ animation: 'slideUp 0.4s cubic-bezier(0.16,1,0.3,1) both' }}>
            <div className="card mb-6">
              <div style={{ display: 'flex', gap: '24px', padding: '24px', flexWrap: 'wrap' }}>
                {posterUrl && (
                  <div style={{
                    width: '140px', flexShrink: 0, borderRadius: 'var(--radius-sm)',
                    overflow: 'hidden', background: 'var(--bg-elevated)',
                    alignSelf: 'flex-start',
                  }}>
                    <img src={posterUrl} alt="" style={{ width: '100%', display: 'block', aspectRatio: '2/3', objectFit: 'cover' }}
                      onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: '280px' }}>
                  <span className={`media-type-badge ${first?.media_type}`}>
                    {first?.media_type === 'movie' ? '电影' : first?.media_type === 'tv' ? '剧集' : first?.media_type || '未知'}
                  </span>
                  <h1 style={{
                    fontFamily: "'Archivo Black', sans-serif", fontSize: '22px',
                    letterSpacing: '-0.02em', color: 'var(--text-primary)',
                    margin: '8px 0 12px',
                  }}>
                    {title}
                  </h1>
                  {overview && (
                    <div style={{ fontSize: '13px', lineHeight: '1.7', color: 'var(--text-muted)', marginBottom: '12px' }}>
                      {overview}
                    </div>
                  )}
                  <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                    共 {items.length} 个文件{!isMovie && ` · ${sortedKeys.length} 集`}
                  </div>
                </div>
              </div>
            </div>

            {seasons.length > 0 && (
              <div className="card mb-6" style={{ padding: '12px 16px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn-ghost"
                  onClick={() => { setSelectedSeason(null); setEpisodePage(0); setExpanded(new Set()) }}
                  style={{
                    padding: '4px 14px', fontSize: '12px',
                    background: selectedSeason == null ? 'var(--accent-amber)' : 'transparent',
                    color: selectedSeason == null ? '#fff' : 'var(--text-muted)',
                    border: 'none', borderRadius: 'var(--radius-sm)',
                  }}>
                  全部
                </button>
                {seasons.map(s => (
                  <button key={s} className="btn-ghost"
                    onClick={() => { setSelectedSeason(s); setEpisodePage(0); setExpanded(new Set()) }}
                    style={{
                      padding: '4px 14px', fontSize: '12px',
                      background: selectedSeason === s ? 'var(--accent-amber)' : 'transparent',
                      color: selectedSeason === s ? '#fff' : 'var(--text-muted)',
                      border: 'none', borderRadius: 'var(--radius-sm)',
                    }}>
                    S{String(s).padStart(2, '0')}
                  </button>
                ))}
              </div>
            )}

            <div className="card">
              {isMovie ? (
                  <table style={{ width: '100%', fontSize: '12px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                      <th style={{ padding: '10px 16px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, width: '36%' }}>版本</th>
                      <th onClick={() => { if (sortField === 'file_size') setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); else { setSortField('file_size'); setSortOrder('desc') } }}
                        style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}>
                        大小{sortField === 'file_size' ? (sortOrder === 'desc' ? ' ↓' : ' ↑') : ''}
                      </th>
                      <th style={{ padding: '10px 16px', textAlign: 'center', color: 'var(--text-dim)', fontWeight: 500 }}>云端</th>
                      <th style={{ padding: '10px 16px', textAlign: 'center', color: 'var(--text-dim)', fontWeight: 500 }}>上传者</th>
                      <th onClick={() => { if (sortField === 'created_at') setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); else { setSortField('created_at'); setSortOrder('desc') } }}
                        style={{ padding: '10px 16px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}>
                        时间{sortField === 'created_at' ? (sortOrder === 'desc' ? ' ↓' : ' ↑') : ''}
                      </th>
                      <th style={{ padding: '10px 16px', textAlign: 'center', color: 'var(--text-dim)', fontWeight: 500 }}>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageKeys.map(key => groups[key]).flat().map((m) => (
                      <tr key={m.id}
                        onClick={() => navigate('/media/' + m.id)}
                        style={{
                          cursor: 'pointer', transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <td style={{ padding: '8px 16px', color: 'var(--text-primary)' }}>
                          {versionLabel(m)}
                        </td>
                        <td style={{ padding: '8px 16px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {formatSize(m.file_size)}
                        </td>
                        <td style={{ padding: '8px 16px', color: 'var(--text-muted)', textAlign: 'center' }}>
                          {m.cloud_type || '—'}
                        </td>
                        <td style={{ padding: '8px 16px', color: 'var(--text-muted)', textAlign: 'center' }}>
                          {m.username || '—'}
                        </td>
                        <td style={{ padding: '8px 16px', color: 'var(--text-dim)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {m.created_at?.slice(0, 10)}
                        </td>
                        <td style={{ padding: '8px 16px', textAlign: 'center' }}>
                          <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); navigate('/media/' + m.id + '?autoplay=1') }}
                            style={{ fontSize: '10px', padding: '2px 8px' }}>
                            ▶ 播放
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                pageKeys.map((key) => {
                  const episodeItems = groups[key]
                  const isOpen = expanded.has(key)
                  return (
                    <div key={key} style={{
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <div
                        onClick={() => toggleGroup(key)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '10px',
                          padding: '12px 16px', cursor: 'pointer',
                          background: isOpen ? 'var(--bg-elevated)' : 'transparent',
                          transition: 'background 0.15s', userSelect: 'none',
                          fontSize: '13px',
                        }}
                        onMouseEnter={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
                        onMouseLeave={(e) => { if (!isOpen) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                      >
                        <span style={{
                          fontSize: '11px', color: 'var(--text-dim)', transition: 'transform 0.2s',
                          transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                        }}>▶</span>
                        <span style={{
                          fontFamily: "'Archivo Black', sans-serif", fontSize: '13px',
                          color: 'var(--accent-amber)', letterSpacing: '-0.02em',
                        }}>
                          {key}
                        </span>
                        <span style={{ color: 'var(--text-dim)', fontSize: '12px' }}>
                          {episodeItems.length} 个版本
                        </span>
                        <span style={{ marginLeft: 'auto' }}>
                          <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); api.exportMedia({ ids: episodeItems.map(x => x.id) }) }}
                            style={{ fontSize: '11px', padding: '3px 10px' }}>
                            导出 JSON
                          </button>
                        </span>
                      </div>
                      {isOpen && (
                        <div style={{ overflow: 'hidden' }}>
                          <table style={{ width: '100%', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                                <th style={{ padding: '8px 14px', textAlign: 'left', color: 'var(--text-dim)', fontWeight: 500, width: '36%' }}>版本</th>
                                <th onClick={() => { if (sortField === 'file_size') setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); else { setSortField('file_size'); setSortOrder('desc') } }}
                                  style={{ padding: '8px 14px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}>
                                  大小{sortField === 'file_size' ? (sortOrder === 'desc' ? ' ↓' : ' ↑') : ''}
                                </th>
                                <th style={{ padding: '8px 14px', textAlign: 'center', color: 'var(--text-dim)', fontWeight: 500 }}>云端</th>
                                <th style={{ padding: '8px 14px', textAlign: 'center', color: 'var(--text-dim)', fontWeight: 500 }}>上传者</th>
                                <th onClick={() => { if (sortField === 'created_at') setSortOrder(o => o === 'desc' ? 'asc' : 'desc'); else { setSortField('created_at'); setSortOrder('desc') } }}
                                  style={{ padding: '8px 14px', textAlign: 'right', color: 'var(--text-dim)', fontWeight: 500, cursor: 'pointer', userSelect: 'none' }}>
                                  时间{sortField === 'created_at' ? (sortOrder === 'desc' ? ' ↓' : ' ↑') : ''}
                                </th>
                                <th style={{ padding: '8px 14px', textAlign: 'center', color: 'var(--text-dim)', fontWeight: 500 }}>操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              {episodeItems.map((m) => (
                                <tr key={m.id}
                                  onClick={() => navigate('/media/' + m.id)}
                                  style={{
                                    cursor: 'pointer', transition: 'background 0.15s',
                                  }}
                                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-elevated)' }}
                                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                                >
                                  <td style={{ padding: '8px 14px', color: 'var(--text-primary)' }}>
                                    {versionLabel(m)}
                                  </td>
                                  <td style={{ padding: '8px 14px', color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    {formatSize(m.file_size)}
                                  </td>
                                  <td style={{ padding: '8px 14px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                    {m.cloud_type || '—'}
                                  </td>
                                  <td style={{ padding: '8px 14px', color: 'var(--text-muted)', textAlign: 'center' }}>
                                    {m.username || '—'}
                                  </td>
                                  <td style={{ padding: '8px 14px', color: 'var(--text-dim)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                    {m.created_at?.slice(0, 10)}
                                  </td>
                                  <td style={{ padding: '8px 14px', textAlign: 'center' }}>
                                    <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); navigate('/media/' + m.id + '?autoplay=1') }}
                                      style={{ fontSize: '10px', padding: '2px 8px' }}>
                                      ▶ 播放
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {totalEpisodePages > 1 && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '8px', padding: '16px', fontSize: '12px',
              }}>
                <button className="btn-ghost" disabled={episodePage === 0}
                  onClick={() => setEpisodePage(p => Math.max(0, p - 1))}
                  style={{ padding: '5px 14px', opacity: episodePage === 0 ? 0.4 : 1 }}>
                  上一页
                </button>
                <span style={{ color: 'var(--text-dim)' }}>
                  {episodePage + 1} / {totalEpisodePages}
                </span>
                <button className="btn-ghost" disabled={episodePage >= totalEpisodePages - 1}
                  onClick={() => setEpisodePage(p => Math.min(totalEpisodePages - 1, p + 1))}
                  style={{ padding: '5px 14px', opacity: episodePage >= totalEpisodePages - 1 ? 0.4 : 1 }}>
                  下一页
                </button>
              </div>
            )}

            {hasMore && (
              <div style={{ textAlign: 'center', padding: '16px' }}>
                <button className="btn-ghost" onClick={loadMore} disabled={loadingMore}
                  style={{ padding: '8px 24px', fontSize: '13px', opacity: loadingMore ? 0.6 : 1 }}>
                  {loadingMore ? '加载中...' : `加载更多 (${items.length}/${totalCount})`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
