import { useToasts } from '../lib/toast'

const KIND_TAG: Record<string, string> = {
  info: 'blz-tag blz-tag-cyan',
  success: 'blz-tag blz-tag-green',
  error: 'blz-tag blz-tag-red',
  warn: 'blz-tag blz-tag-amber',
}

const KIND_TITLE: Record<string, string> = {
  info: 'INFO',
  success: 'OK',
  error: 'ERR',
  warn: 'WARN',
}

export function Toaster() {
  const { toasts, dismiss } = useToasts()
  if (!toasts.length) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`blz-toast blz-toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          <div className="blz-toast-header">
            <span className={KIND_TAG[t.kind] || 'blz-tag'}>{KIND_TITLE[t.kind] || t.kind.toUpperCase()}</span>
            <span className="blz-toast-title">{t.title}</span>
            <span className="blz-toast-x" aria-hidden>{'\u00d7'}</span>
          </div>
          {t.body && <div className="blz-toast-body">{t.body}</div>}
          <div className="blz-toast-progress" style={{ animationDuration: `${t.ttl}ms` }} />
        </div>
      ))}
    </div>
  )
}
