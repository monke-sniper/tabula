import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

const PICKER_ID = 'kbd-shortcut-file-picker'

function openFilePicker() {
  let el = document.getElementById(PICKER_ID) as HTMLInputElement | null
  if (!el) {
    el = document.createElement('input')
    el.id = PICKER_ID
    el.type = 'file'
    el.accept = '.csv,.json,.xlsx,.xls,.parquet'
    el.style.display = 'none'
    el.addEventListener('change', () => {
      if (el!.files && el!.files[0]) {
        window.dispatchEvent(new CustomEvent('tabula:file-shortcut', { detail: el!.files![0] }))
      }
      el!.value = ''
    })
    document.body.appendChild(el)
  }
  el.click()
}

export function KeyboardShortcuts() {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement | null
      const tag = tgt?.tagName?.toLowerCase()
      const inField = tag === 'input' || tag === 'textarea' || tag === 'select' || (tgt as HTMLElement | null)?.isContentEditable
      if (inField) return
      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'o') {
          e.preventDefault()
          openFilePicker()
        }
        return
      }
      if (e.key === 'F1') { e.preventDefault(); navigate('/') }
      else if (e.key === 'F2') { e.preventDefault(); navigate('/finetune') }
      else if (e.key === 'F3') { e.preventDefault(); navigate('/models') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return null
}
