import { useState, useRef, useEffect } from 'react'

interface HelpTipProps {
  text: string
  className?: string
}

/**
 * Inline help indicator. Renders a small "?" superscript that shows a popover
 * with the provided text on hover/focus. Pure CSS + state, no library.
 */
export function HelpTip({ text, className = '' }: HelpTipProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <span
      ref={ref}
      className={`help-tip ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="help-tip__trigger"
        aria-label="Show help"
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <span className="help-tip__popover" role="tooltip">
          {text}
        </span>
      )}
    </span>
  )
}
