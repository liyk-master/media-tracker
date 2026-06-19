import { useState, useRef, type FormEvent } from 'react'

interface Props {
  onUpload: (data: Record<string, any>) => void
  onBatchUpload: (items: Record<string, any>[]) => void
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('文件读取失败'))
    reader.readAsText(file)
  })
}

export default function UploadForm({ onUpload, onBatchUpload }: Props) {
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function resetFile() {
    setFileName('')
    if (fileRef.current) fileRef.current.value = ''
  }

  async function processFiles(files: FileList) {
    setError('')
    const items: Record<string, any>[] = []
    for (const file of Array.from(files)) {
      if (!file.name.endsWith('.json')) continue
      try {
        const text = await readFile(file)
        const data = JSON.parse(text)
        if (Array.isArray(data)) {
          items.push(...data)
        } else {
          items.push(data)
        }
      } catch {
        setError(`文件 ${file.name} 解析失败`)
        resetFile()
        return
      }
    }
    if (items.length === 0) {
      setError('未找到有效的 JSON 文件')
      resetFile()
      return
    }
    setFileName(files.length === 1 ? files[0].name : `${files.length} 个文件`)
    setJsonText(JSON.stringify(items, null, 2))
  }

  async function handleFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length) return
    await processFiles(e.target.files)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const data = JSON.parse(jsonText)
      if (Array.isArray(data)) {
        onBatchUpload(data)
      } else if (data && typeof data === 'object' && 'items' in data && Array.isArray(data.items)) {
        onBatchUpload(data.items)
      } else {
        onUpload(data)
      }
      setJsonText('')
      resetFile()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="card">
      <div className="px-6 py-4" style={{
        borderBottom: '1px solid var(--border)',
      }}>
        <h3 style={{
          fontFamily: "'Archivo Black', sans-serif",
          fontSize: '15px',
          letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
        }}>
          提交哈希
        </h3>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '1px' }}>
          粘贴 JSON 或选择 .json 文件，自动合并为批量
        </div>
      </div>

      <div className="p-6">
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span style={{
                fontSize: '11px',
                fontFamily: "'Archivo Black', sans-serif",
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}>
                JSON 数据
              </span>

              <label
                className="btn-ghost"
                style={{
                  fontSize: '12px',
                  padding: '5px 14px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <input
                  ref={fileRef}
                  type="file"
                  accept=".json"
                  multiple
                  onChange={handleFilePick}
                  style={{ display: 'none' }}
                />
                <span style={{ fontSize: '14px', lineHeight: 1 }}>📂</span>
                选择文件
              </label>
            </div>

            {fileName && (
              <div style={{
                fontSize: '11px',
                color: 'var(--text-dim)',
                marginBottom: '6px',
                padding: '4px 8px',
                background: 'var(--bg-card)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                display: 'inline-block',
              }}>
                已加载 {fileName}
              </div>
            )}

            <textarea
              className="input-base"
              rows={5}
              placeholder='单条: {"sha256":"abc...","file_size":12345,"name":"movie.mkv","cloud":"baidu"}
批量: [{"sha256":"abc..."}, {"sha256":"def..."}]'
              value={jsonText}
              onChange={(e) => { setJsonText(e.target.value); setFileName('') }}
              style={{ resize: 'vertical', minHeight: '120px', fontFamily: "'DM Sans', 'Noto Sans SC', monospace" }}
            />
          </div>

          {error && <div className="mb-4" style={{
            padding: '10px 14px',
            background: 'rgba(229, 72, 77, 0.1)',
            border: '1px solid rgba(229, 72, 77, 0.3)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--error)',
            fontSize: '13px',
          }}>
            {error}
          </div>}

          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={!jsonText.trim()}>
              提交
            </button>
            {jsonText.trim() && (
              <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                自动识别为 {jsonText.trim().startsWith('[') || jsonText.includes('"items"') ? '批量' : '单条'}
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
