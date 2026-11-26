import { useRef, useState, type FormEvent } from 'react'
import { api, type MaterialSummary, type Space } from './api.js'
import { messageOf } from './Turns.js'

/** What the space learns from: every file, with what it holds, and the ways to add, replace and remove one. */

const KIND: Readonly<Record<string, string>> = {
  text: '文本',
  markdown: 'Markdown',
  pdf: 'PDF',
}

export const MATERIAL_ACCEPT = '.txt,.md,.markdown,.pdf'

function pastedTitle(): string {
  const time = new Date().toLocaleString('sv-SE', { dateStyle: 'short', timeStyle: 'short' })
  return `粘贴的文字 ${time}`
}

export function PasteMaterialForm({
  busy,
  onUpload,
  onCancel,
}: {
  busy: boolean
  onUpload: (file: File) => Promise<void>
  onCancel?: () => void
}) {
  const [title, setTitle] = useState(pastedTitle)
  const [text, setText] = useState('')
  const [problem, setProblem] = useState<string>()

  const submit = (event: FormEvent): void => {
    event.preventDefault()
    if (busy) return
    if (text.trim() === '') {
      setProblem('请先粘贴文字。')
      return
    }
    const name = title.replace(/[<>:"/\\|?*]|\p{Cc}/gu, '').trim() || '粘贴的文字'
    setProblem(undefined)
    onUpload(new File([text], `${name}.md`, { type: 'text/markdown' }))
      .then(() => {
        setTitle(pastedTitle())
        setText('')
      })
      .catch((error: unknown) => setProblem(messageOf(error)))
  }

  return (
    <form className="paste-material" onSubmit={submit}>
      <h3>粘贴文字</h3>
      <label>
        标题
        <input value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label>
        文字
        <textarea
          rows={5}
          value={text}
          disabled={busy}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {problem !== undefined && (
        <p className="hint" role="alert">
          {problem}
        </p>
      )}
      <div className="actions">
        <button type="submit" disabled={busy}>
          加入材料
        </button>
        {onCancel !== undefined && (
          <button type="button" className="secondary" onClick={onCancel}>
            取消
          </button>
        )}
      </div>
    </form>
  )
}

function sizeWords(material: MaterialSummary): string {
  const characters =
    material.characters >= 10_000
      ? `${(material.characters / 10_000).toFixed(1)} 万字`
      : `${material.characters} 字`
  return [
    KIND[material.kind] ?? material.kind,
    characters,
    `${material.chunks} 段`,
    ...(material.version > 1 ? [`第 ${material.version} 版`] : []),
    `${new Date(material.addedAt).toLocaleDateString('zh-CN', { dateStyle: 'long' })}加入`,
  ].join('，')
}

export function MaterialsPage(props: {
  space: Space
  materials: readonly MaterialSummary[]
  /** The material open in the side column, if any. */
  open: string | undefined
  guard: (work: () => Promise<unknown>) => void
  onChanged: () => Promise<void>
  onOpen: (material: MaterialSummary) => void
  onAsk: () => void
}) {
  const { space, materials, guard } = props
  const [uploading, setUploading] = useState(false)
  const [note, setNote] = useState<string>()
  const [addedFirst, setAddedFirst] = useState(false)
  const [armedDelete, setArmedDelete] = useState<string>()
  const replaceTarget = useRef<string | undefined>(undefined)
  const replaceInput = useRef<HTMLInputElement>(null)

  const upload = async (files: readonly File[]): Promise<void> => {
    setUploading(true)
    setNote(undefined)
    try {
      for (const file of files) {
        const { duplicate } = await api.upload(space.id, file)
        if (duplicate) setNote(`“${file.name}”的内容已经在这个空间里了。`)
        else if (materials.length === 0) setAddedFirst(true)
      }
    } finally {
      await props.onChanged().finally(() => setUploading(false))
    }
  }

  return (
    <div className="page materials">
      <h2 className="space-title">材料</h2>
      <p className="hint page-hint">
        回答只从这里的材料里找依据。支持 TXT、Markdown 和有文字层的 PDF，单个不超过 20 MB。
      </p>
      {materials.length === 0 ? (
        <p className="page-hint">这个空间还没有材料。先上传一份你要学的东西。</p>
      ) : (
        <ul className="material-list">
          {materials.map((material) => (
            <li key={material.id} data-open={props.open === material.id}>
              <button
                type="button"
                className="material-title"
                onClick={() => props.onOpen(material)}
              >
                {material.title}
              </button>
              <p className="hint">{sizeWords(material)}</p>
              {!space.archived && (
                <p className="quiet-actions">
                  <button
                    type="button"
                    className="link"
                    aria-label={`更新 ${material.title}`}
                    onClick={() => {
                      replaceTarget.current = material.id
                      replaceInput.current?.click()
                    }}
                  >
                    换成新版本
                  </button>
                  <button
                    type="button"
                    className="link link-danger"
                    aria-label={`删除 ${material.title}`}
                    onClick={() => {
                      if (armedDelete !== material.id) {
                        setArmedDelete(material.id)
                        return
                      }
                      setArmedDelete(undefined)
                      guard(async () => {
                        await api.deleteMaterial(material.id)
                        await props.onChanged()
                      })
                    }}
                  >
                    {armedDelete === material.id ? '再点一次确认删除' : '删除'}
                  </button>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {space.archived ? (
        <p className="hint">这个空间已归档，不能再加材料。</p>
      ) : (
        <label className="upload" aria-disabled={uploading}>
          {uploading ? '正在读取…' : '上传材料'}
          <input
            type="file"
            multiple
            accept={MATERIAL_ACCEPT}
            disabled={uploading}
            onChange={(event) => {
              const files = [...(event.target.files ?? [])]
              if (files.length > 0) guard(() => upload(files))
              event.target.value = ''
            }}
          />
        </label>
      )}
      {addedFirst && materials.length > 0 && !space.archived && (
        <button type="button" className="secondary" onClick={props.onAsk}>
          去提问
        </button>
      )}
      {note !== undefined && <p className="hint">{note}</p>}
      {!space.archived && (
        <PasteMaterialForm busy={uploading} onUpload={(file) => upload([file])} />
      )}
      {materials.length > 0 && (
        <p className="hint">删除一份材料后，旧回答引用过的片段仍会保留，方便你回头核对。</p>
      )}
      <input
        ref={replaceInput}
        className="hidden-input"
        type="file"
        aria-label="选择新版本文件"
        accept={MATERIAL_ACCEPT}
        onChange={(event) => {
          const file = event.target.files?.[0]
          const id = replaceTarget.current
          event.target.value = ''
          if (file === undefined || id === undefined) return
          guard(async () => {
            await api.replace(id, file)
            await props.onChanged()
          })
        }}
      />
    </div>
  )
}
