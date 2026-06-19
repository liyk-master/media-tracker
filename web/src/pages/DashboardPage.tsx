import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../context'
import { useNavigate } from 'react-router-dom'
import { api, connectWS, type MediaItem } from '../api'
import UploadForm from '../components/UploadForm'

interface FailedItem {
  sha256: string
  file_name: string
  file_size: number
  cloud: string
  error: string
}

interface BatchProgress {
  batch_id: string
  total: number
  done: number
  success: number
  failed: number
  duplicates: number
  completed?: boolean
  failedItems: FailedItem[]
  expanded?: boolean
}

export default function DashboardPage() {
  const { logout, role } = useAuth()
  const navigate = useNavigate()
  const [mediaList, setMediaList] = useState<MediaItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [notifications, setNotifications] = useState<string[]>([])
  const [batches, setBatches] = useState<BatchProgress[]>([])
  const [searchQ, setSearchQ] = useState('')
  const [searchMediaType, setSearchMediaType] = useState('')
  const [searchYear, setSearchYear] = useState('')
  const [activeQ, setActiveQ] = useState('')
  const [activeMediaType, setActiveMediaType] = useState('')
  const [activeYear, setActiveYear] = useState('')
  const pageSize = 20
  const [selectedTmdbIds, setSelectedTmdbIds] = useState<Set<number>>(new Set())
  const [editingTMDB, setEditingTMDB] = useState<number | null>(null)
  const [editTMDBValue, setEditTMDBValue] = useState('')
  const [editTMDBLoading, setEditTMDBLoading] = useState(false)
  const [editMediaType, setEditMediaType] = useState('')

  const loadMedia = useCallback(async (p: number) => {
    setLoading(true)
    try {
      const tmdbIdFromQ = activeQ && /^\d+$/.test(activeQ) ? Number(activeQ) : undefined
      const res = await api.listMedia({
        page: p, page_size: pageSize,
        q: activeQ || undefined,
        media_type: activeMediaType || undefined,
        year: activeYear ? Number(activeYear) : undefined,
        tmdb_id: tmdbIdFromQ,
        group_by: 'tmdb',
      })
      setMediaList(res.items)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }, [activeQ, activeMediaType, activeYear])

  useEffect(() => {
    loadMedia(page)
  }, [page, loadMedia])

  useEffect(() => {
    const ws = connectWS((msg) => {
      const u = msg.payload?.username || '用户'
      switch (msg.type) {
        case 'new_media': {
          const title = msg.payload?.title
          const showName = msg.payload?.show_name || title
          setNotifications((prev) => [showName ? `${u} 上传「${showName}」` : `${u} 上传成功`, ...prev].slice(0, 5))
          const tmdbId = msg.payload?.tmdb_id
          if (tmdbId) {
            const year = msg.payload?.year
            const count = msg.payload?.count ?? 1
            setMediaList((prev) => {
              const idx = prev.findIndex((m) => m.tmdb_id === tmdbId)
              if (idx >= 0) {
                const updated = { ...prev[idx], count, json_data: { ...prev[idx].json_data, year } }
                return [updated, ...prev.filter((_, i) => i !== idx)]
              }
              const newItem: MediaItem = {
                id: msg.payload.id,
                sha256: msg.payload.sha256 || '',
                file_name: msg.payload.file_name || '',
                file_size: msg.payload.file_size || 0,
                cloud_type: '',
                user_id: 0,
                tmdb_id: tmdbId,
                media_type: msg.payload.media_type || '',
                json_data: { title: showName, year },
                created_at: new Date().toISOString(),
                count,
              }
              setTotal((prev) => prev + 1)
              return [newItem, ...prev]
            })
          }
          break
        }
        case 'upload_progress':
          setBatches((prev) => {
            const idx = prev.findIndex((b) => b.batch_id === msg.payload.batch_id)
            const p = msg.payload
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = { ...next[idx], ...p, failedItems: next[idx].failedItems }
              return next
            }
            return [...prev, { ...p, failedItems: [] }]
          })
          break
        case 'upload_batch_done':
          setNotifications((prev) => [
            `${u} 批量处理完成 (${msg.payload.success} 成功, ${msg.payload.failed} 失败)`,
            ...prev,
          ].slice(0, 5))
          setBatches((prev) => {
            const idx = prev.findIndex((b) => b.batch_id === msg.payload.batch_id)
            if (idx < 0) return prev
            const next = [...prev]
            next[idx] = { ...next[idx], completed: true, done: next[idx].total }
            return next
          })
          break
        case 'upload_error':
          setBatches((prev) => {
            const idx = prev.findIndex((b) => b.batch_id === msg.payload.batch_id)
            if (idx < 0) return prev
            const next = [...prev]
            next[idx] = {
              ...next[idx],
              failedItems: [...next[idx].failedItems, {
                sha256: msg.payload.sha256,
                file_name: msg.payload.file_name || '',
                file_size: msg.payload.file_size || 0,
                cloud: msg.payload.cloud || '',
                error: msg.payload.error || '未知错误',
              }],
            }
            return next
          })
          setNotifications((prev) => [
            `${u} 上传失败: ${msg.payload?.file_name || msg.payload?.sha256?.slice(0, 12) || '未知文件'}`,
            ...prev,
          ].slice(0, 5))
          break
      }
    })
    return () => ws.close()
  }, [])

  function handleSearch() {
    setActiveQ(searchQ)
    setActiveMediaType(searchMediaType)
    setActiveYear(searchYear)
    setPage(1)
  }

  function handleReset() {
    setSearchQ('')
    setSearchMediaType('')
    setSearchYear('')
    setActiveQ('')
    setActiveMediaType('')
    setActiveYear('')
    setPage(1)
  }

  function handleUpload(jsonData: Record<string, any>) {
    api.upload(jsonData).catch((err) => {
      setNotifications((prev) => [`上传失败: ${err.message}`, ...prev].slice(0, 5))
    })
  }

  function handleBatchUpload(items: Record<string, any>[]) {
    api.uploadBatch(items).then((res) => {
      if (res.skipped > 0) {
        setNotifications((prev) => [`已跳过 ${res.skipped} 个非视频文件或无效哈希`, ...prev].slice(0, 5))
      }
    })
  }

  function handleRetry(item: FailedItem) {
    api.upload({
      sha256: item.sha256,
      size: item.file_size,
      name: item.file_name,
      cloud: item.cloud,
    })
  }

  function handleRetryAll(failedItems: FailedItem[]) {
    if (failedItems.length === 1) {
      handleRetry(failedItems[0])
      return
    }
    api.uploadBatch(failedItems.map((f) => ({
      sha256: f.sha256,
      size: f.file_size,
      name: f.file_name,
      cloud: f.cloud,
    })))
  }

  function dismissBatch(batchId: string) {
    setBatches((prev) => prev.filter((b) => b.batch_id !== batchId))
  }

  function toggleExpand(batchId: string) {
    setBatches((prev) => prev.map((b) =>
      b.batch_id === batchId ? { ...b, expanded: !b.expanded } : b
    ))
  }

  const totalPages = Math.ceil(total / pageSize)

  function dismissNotification(i: number) {
    setNotifications((prev) => prev.filter((_, idx) => idx !== i))
  }

  function handleEditTMDB(media: MediaItem) {
    setEditingTMDB(media.id)
    setEditTMDBValue(String(media.tmdb_id || ''))
    setEditMediaType(media.media_type || 'tv')
  }

  async function handleSaveTMDB() {
    if (editingTMDB == null) return
    const tmdbId = parseInt(editTMDBValue)
    if (isNaN(tmdbId)) return
    setEditTMDBLoading(true)
    try {
      await api.updateMediaTMDB(editingTMDB, tmdbId, editMediaType)
      setEditingTMDB(null)
      loadMedia(page)
    } finally {
      setEditTMDBLoading(false)
    }
  }

  function handleCancelTMDB() {
    setEditingTMDB(null)
  }

  function formatBytes(bytes: number): string {
    if (!bytes) return ''
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let i = 0
    let size = bytes
    while (size >= 1024 && i < units.length - 1) {
      size /= 1024
      i++
    }
    return size.toFixed(i > 0 ? 1 : 0) + ' ' + units[i]
  }

  function truncateText(s: string, max: number): string {
    if (s.length <= max) return s
    return s.slice(0, max) + '…'
  }

  function hasPoster(m: MediaItem): boolean {
    return !!m.tmdb_id
  }

  function toggleSelect(tmdbId: number) {
    setSelectedTmdbIds((prev) => {
      const next = new Set(prev)
      if (next.has(tmdbId)) next.delete(tmdbId)
      else next.add(tmdbId)
      return next
    })
  }

  function handleExportSelected() {
    const ids = [...selectedTmdbIds]
    if (ids.length === 0) return
    api.exportMedia({ tmdb_ids: ids })
  }

  function clearSelection() {
    setSelectedTmdbIds(new Set())
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <header style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-surface)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span style={{
              fontFamily: "'Archivo Black', sans-serif",
              fontSize: '18px',
              letterSpacing: '-0.02em',
              color: 'var(--accent-amber)',
            }}>
              MEDIA TRACKER
            </span>
            <span style={{
              fontSize: '11px',
              color: 'var(--text-dim)',
              padding: '2px 8px',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              v1
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/profile')}
              className="btn-ghost"
              style={{ fontSize: '13px', padding: '5px 12px' }}
            >
              个人中心
            </button>
            {role === 'admin' && (
              <button
                onClick={() => navigate('/admin')}
                className="btn-ghost"
                style={{ fontSize: '13px', padding: '5px 12px' }}
              >
                管理
              </button>
            )}
            <button
              onClick={logout}
              className="btn-ghost"
            >
              退出登录
            </button>
          </div>
        </div>
      </header>

      {notifications.length > 0 && (
        <div className="fixed top-20 right-6 space-y-2 z-50" style={{ maxWidth: '320px' }}>
          {notifications.map((n, i) => (
            <div
              key={i}
              className="toast flex items-center gap-3 px-4 py-3 rounded-lg"
              style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--accent-teal-dim)',
                fontSize: '13px',
                color: 'var(--accent-teal)',
                cursor: 'pointer',
              }}
              onClick={() => dismissNotification(i)}
            >
              <span style={{ fontSize: '16px', lineHeight: 1 }}>✦</span>
              <span style={{ flex: 1 }}>{n}</span>
            </div>
          ))}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-10" style={{ animation: 'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
          <UploadForm onUpload={handleUpload} onBatchUpload={handleBatchUpload} />
        </div>

        {batches.length > 0 && (
          <div className="mb-6 space-y-2" style={{ animation: 'slideUp 0.35s ease both' }}>
            {batches.map((b) => {
              const pct = (b.done / b.total) * 100
              const hasErrors = b.failedItems.length > 0
              return (
                <div key={b.batch_id} className="card px-5 py-3">
                  <div className="flex items-center gap-4">
                    <div style={{ flex: 1 }}>
                      <div className="flex items-center justify-between mb-1">
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontFamily: "'DM Sans', monospace" }}>
                          batch: {b.batch_id.slice(0, 8)}
                          {b.completed && (
                            <span style={{ color: 'var(--accent-teal)', marginLeft: '8px' }}>✓ 完成</span>
                          )}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                          {b.success} 成功 / {b.failed} 失败 / {b.duplicates} 重复
                        </span>
                      </div>
                      <div style={{
                        height: '4px',
                        background: 'var(--bg-card)',
                        borderRadius: '2px',
                        overflow: 'hidden',
                      }}>
                        <div style={{
                          width: `${b.completed ? 100 : pct}%`,
                          height: '100%',
                          background: b.completed && hasErrors
                            ? 'var(--error)'
                            : b.completed
                              ? 'var(--accent-teal)'
                              : 'var(--accent-teal)',
                          borderRadius: '2px',
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px', textAlign: 'right' }}>
                        {b.done} / {b.total}
                      </div>
                    </div>
                    {b.completed && (
                      <button onClick={() => dismissBatch(b.batch_id)} className="btn-ghost" style={{ fontSize: '18px', padding: '2px 8px', lineHeight: 1 }}>
                        ×
                      </button>
                    )}
                  </div>

                  {hasErrors && (
                    <div style={{ marginTop: '8px' }}>
                      <button
                        onClick={() => toggleExpand(b.batch_id)}
                        className="btn-ghost"
                        style={{ fontSize: '12px', padding: '2px 8px', color: 'var(--error)' }}
                      >
                        {b.expanded ? '收起失败详情 ▲' : `展开失败详情 (${b.failedItems.length} 项) ▼`}
                      </button>

                      {b.expanded && (
                        <div style={{ marginTop: '6px' }}>
                          <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                            <button
                              onClick={() => handleRetryAll(b.failedItems)}
                              className="btn-primary"
                              style={{ fontSize: '12px', padding: '4px 12px' }}
                            >
                              全部重试
                            </button>
                          </div>
                          <div className="table-wrap" style={{ border: '1px solid rgba(229, 72, 77, 0.2)', borderRadius: '6px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', fontSize: '12px' }}>
                              <tbody>
                                {b.failedItems.map((f, i) => (
                                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '6px 10px', color: 'var(--text-primary)', fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {f.file_name || '-'}
                                    </td>
                                    <td style={{ padding: '6px 10px', color: 'var(--error)', fontSize: '12px' }}>
                                      {f.error}
                                    </td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                      <button
                                        onClick={() => handleRetry(f)}
                                        className="btn-ghost"
                                        style={{ fontSize: '11px', padding: '2px 10px', color: 'var(--accent-amber)' }}
                                      >
                                        重试
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div style={{ animation: 'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) 0.15s both' }}>
          <div className="flex items-end justify-between mb-4">
            <div>
              <h2 style={{
                fontFamily: "'Archivo Black', sans-serif",
                fontSize: '20px',
                letterSpacing: '-0.02em',
                color: 'var(--text-primary)',
              }}>
                媒体库
              </h2>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                 已归档 {total} 部作品
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex items-center gap-2 flex-1">
              <div
                onClick={() => {
                  const allSelected = mediaList.every((m) => selectedTmdbIds.has(m.tmdb_id))
                  setSelectedTmdbIds((prev) => {
                    const next = new Set(prev)
                    for (const m of mediaList) {
                      if (allSelected) next.delete(m.tmdb_id)
                      else next.add(m.tmdb_id)
                    }
                    return next
                  })
                }}
                style={{
                  width: '20px', height: '20px', borderRadius: '4px', cursor: 'pointer',
                  background: mediaList.length > 0 && mediaList.every((m) => selectedTmdbIds.has(m.tmdb_id)) ? 'var(--accent-amber)' : 'rgba(255,255,255,0.1)',
                  border: mediaList.length > 0 && mediaList.every((m) => selectedTmdbIds.has(m.tmdb_id)) ? '2px solid var(--accent-amber)' : '2px solid rgba(255,255,255,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  transition: 'all 0.15s ease',
                }}
                title={mediaList.every((m) => selectedTmdbIds.has(m.tmdb_id)) ? '取消全选' : '全选当前页'}
              >
                {mediaList.length > 0 && mediaList.every((m) => selectedTmdbIds.has(m.tmdb_id)) && (
                  <span style={{ color: '#0B0B0F', fontSize: '12px', fontWeight: 'bold' }}>✓</span>
                )}
              </div>
              <input
                className="input-base"
                placeholder="搜索文件名..."
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                style={{ maxWidth: '260px', fontSize: '13px', padding: '7px 12px' }}
              />
              <select
                className="input-base"
                value={searchMediaType}
                onChange={(e) => setSearchMediaType(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                style={{ maxWidth: '120px', fontSize: '13px', padding: '7px 12px' }}
              >
                <option value="">全部类型</option>
                <option value="movie">电影</option>
                <option value="tv">剧集</option>
              </select>
              <select
                className="input-base"
                value={searchYear}
                onChange={(e) => setSearchYear(e.target.value)}
                style={{ maxWidth: '120px', fontSize: '13px', padding: '7px 12px' }}
              >
                <option value="">全部年份</option>
                {(() => {
                  const years: number[] = []
                  for (let y = 2026; y >= 1970; y--) years.push(y)
                  return years
                })().map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button className="btn-primary" onClick={handleSearch} style={{ fontSize: '13px', padding: '7px 16px' }}>
                搜索
              </button>
              <button
                className="btn-ghost"
                onClick={handleReset}
                style={{ fontSize: '12px', padding: '7px 12px' }}
              >
                重置
              </button>
            </div>
            {selectedTmdbIds.size > 0 && (
              <>
                <button
                  className="btn-primary"
                  onClick={handleExportSelected}
                  style={{ fontSize: '12px', padding: '7px 14px' }}
                >
                  导出选中 ({selectedTmdbIds.size})
                </button>
                <button
                  className="btn-ghost"
                  onClick={clearSelection}
                  style={{ fontSize: '12px', padding: '7px 10px', color: 'var(--text-dim)' }}
                >
                  清除
                </button>
              </>
            )}
            <button
              className="btn-ghost"
              onClick={() => api.exportMedia({ q: searchQ || undefined, media_type: searchMediaType || undefined })}
              style={{ fontSize: '12px', padding: '7px 14px' }}
            >
              导出 JSON
            </button>
          </div>

          {loading ? (
            <div className="card p-12 text-center">
              <div style={{
                display: 'inline-block',
                width: '24px', height: '24px',
                border: '2px solid var(--border)',
                borderTopColor: 'var(--accent-amber)',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }} />
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '12px' }}>
                加载中...
              </div>
            </div>
          ) : mediaList.length === 0 ? (
            <div className="card p-12 text-center">
              <div style={{
                fontSize: '32px',
                marginBottom: '8px',
                color: 'var(--text-dim)',
                fontFamily: "'Archivo Black', sans-serif",
                letterSpacing: '-0.03em',
              }}>
                ∅
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                暂无媒体记录，请提交哈希文件开始追踪。
              </div>
            </div>
          ) : (
            <>
              <div className="media-grid">
                {mediaList.map((m, idx) => (
                  <div
                    key={m.tmdb_id}
                    className="media-card"
                    onClick={() => navigate('/tmdb/' + m.tmdb_id)}
                    style={{
                      cursor: 'pointer',
                      animation: `slideUp 0.4s cubic-bezier(0.16,1,0.3,1) ${0.04 * idx}s both`,
                    }}
                  >
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleSelect(m.tmdb_id) }}
                      style={{
                        position: 'absolute', top: '6px', left: '6px', zIndex: 10,
                        width: '20px', height: '20px',
                        borderRadius: '4px',
                        background: selectedTmdbIds.has(m.tmdb_id) ? 'var(--accent-amber)' : 'rgba(0,0,0,0.5)',
                        border: selectedTmdbIds.has(m.tmdb_id) ? '2px solid var(--accent-amber)' : '2px solid rgba(255,255,255,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', transition: 'all 0.15s ease',
                      }}
                    >
                      {selectedTmdbIds.has(m.tmdb_id) && (
                        <span style={{ color: '#0B0B0F', fontSize: '12px', fontWeight: 'bold', lineHeight: 1 }}>✓</span>
                      )}
                    </div>
                    <div className="media-card-poster">
                      <img
                        src={`/api/tmdb/poster/${m.media_type}/${m.tmdb_id}`}
                        alt=""
                        loading="lazy"
                        style={{ display: hasPoster(m) ? 'block' : 'none' }}
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none'
                          const fb = e.currentTarget.parentElement?.querySelector('.media-card-poster-fallback') as HTMLElement
                          if (fb) fb.style.display = 'flex'
                        }}
                      />
                      <div className={`media-card-poster-fallback ${m.media_type || 'unknown'}`} style={{ display: hasPoster(m) ? 'none' : 'flex' }}>
                        {m.media_type === 'movie' ? '🎬' : m.media_type === 'tv' ? '📺' : '🎞'}
                      </div>
                    </div>
                    <div className="media-card-body">
                      <div className="media-card-top">
                        <span className={`media-type-badge ${m.media_type}`}>
                          {m.media_type === 'movie' ? '电影' : m.media_type === 'tv' ? '剧集' : m.media_type || '未知'}
                        </span>
                        <span className="media-tmdb-edit" onClick={(e) => { e.stopPropagation(); handleEditTMDB(m) }}>
                          {m.tmdb_id ? (
                            <>
                              <a
                                href={`https://www.themoviedb.org/${m.media_type}/${m.tmdb_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="media-tmdb-link"
                                onClick={(e) => e.stopPropagation()}
                              >
                                TMDB {m.tmdb_id}
                              </a>
                              <span className="media-edit-icon">✎</span>
                            </>
                          ) : (
                            <span className="media-tmdb-none">
                              — <span className="media-edit-icon">✎</span>
                            </span>
                          )}
                        </span>
                      </div>

                      <div className="media-card-title" title={m.json_data?.title || m.json_data?.original_name || m.file_name}>
                        {truncateText(m.json_data?.title || m.json_data?.original_name || m.file_name, 65)}
                      </div>

                      {m.json_data?.year && (
                        <div style={{
                          fontSize: '12px', color: 'var(--text-dim)', marginTop: '4px',
                        }}>
                          {m.json_data.year}
                        </div>
                      )}

                      {m.count != null && m.count > 1 && (
                        <div style={{
                          fontSize: '11px', color: 'var(--text-dim)', marginTop: '6px',
                          display: 'flex', alignItems: 'center', gap: '4px',
                        }}>
                          <span style={{ opacity: 0.5 }}>⊞</span>
                          {m.count} 个文件
                          {m.total_size ? <><span style={{ opacity: 0.3 }}>·</span> {formatBytes(m.total_size)}</> : null}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                     共 {total} 部
                  </div>
                  <div className="flex items-center gap-3">
                    <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                      ← 上一页
                    </button>
                    <span style={{
                      fontSize: '13px', color: 'var(--text-muted)',
                      fontFamily: "'DM Sans', sans-serif", fontWeight: '500',
                      minWidth: '60px', textAlign: 'center',
                    }}>
                      {page} / {totalPages}
                    </span>
                    <button className="btn-ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      下一页 →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {editingTMDB !== null && (
        <div
          onClick={handleCancelTMDB}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{
              padding: '24px', width: '320px',
              animation: 'slideUp 0.25s cubic-bezier(0.16,1,0.3,1) both',
            }}
          >
            <div style={{ fontFamily: "'Archivo Black', sans-serif", fontSize: '14px', color: 'var(--text-primary)', marginBottom: '16px' }}>
              编辑 TMDB ID
            </div>
            <input
              className="input-base"
              value={editTMDBValue}
              onChange={(e) => setEditTMDBValue(e.target.value)}
              placeholder="输入 TMDB ID"
              autoFocus
              style={{ width: '100%', fontSize: '13px', padding: '8px 12px', marginBottom: '12px' }}
              onKeyDown={(e) => e.key === 'Enter' && !editTMDBLoading && handleSaveTMDB()}
            />
            <select
              className="input-base"
              value={editMediaType}
              onChange={(e) => setEditMediaType(e.target.value)}
              style={{ width: '100%', fontSize: '13px', padding: '8px 12px', marginBottom: '16px' }}
            >
              <option value="tv">剧集</option>
              <option value="movie">电影</option>
            </select>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button
                className="btn-ghost"
                onClick={handleCancelTMDB}
                style={{ fontSize: '13px', padding: '7px 16px' }}
              >
                取消
              </button>
              <button
                className="btn-primary"
                onClick={handleSaveTMDB}
                disabled={editTMDBLoading}
                style={{ fontSize: '13px', padding: '7px 16px' }}
              >
                {editTMDBLoading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
