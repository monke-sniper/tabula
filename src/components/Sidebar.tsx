import { NavLink } from 'react-router-dom'
import { useApp } from '../lib/context'

export default function Sidebar() {
  const { activeModel, sessionId } = useApp()

  return (
    <aside className="w-[180px] bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col shrink-0 select-none">
      {/* Brand */}
      <div className="h-[32px] flex items-center gap-2 px-3 border-b border-[var(--border)] bg-[var(--amber)]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round">
          <path d="M3 3v18h18" />
          <path d="M7 16l4-4 4 4 5-5" />
        </svg>
        <span className="text-[11px] font-bold tracking-[0.12em] uppercase text-black">Tabula</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-1">
        {navItems.map(({ to, label, shortcut }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-1.5 text-[10px] font-medium transition-all ${
                isActive
                  ? 'bg-[var(--amber-dim)] text-[var(--amber)] border-l-2 border-l-[var(--amber)]'
                  : 'text-[var(--grey-bright)] hover:text-[var(--white)] hover:bg-[var(--bg-tertiary)] border-l-2 border-l-transparent'
              }`
            }
          >
            <span>{label}</span>
            <span className="font-mono text-[8px] text-[var(--grey-dim)]">{shortcut}</span>
          </NavLink>
        ))}
      </nav>

      {/* Separator */}
      <div className="border-t border-[var(--border)]" />

      {/* Status */}
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[8px] font-bold tracking-[0.1em] uppercase text-[var(--grey)]">Model</span>
          {sessionId && <div className="w-1.5 h-1.5 rounded-full bg-[var(--green)] blink" />}
        </div>
        <div className="font-mono text-[9px] text-[var(--amber)] truncate bg-[var(--bg-primary)] px-2 py-1 border border-[var(--border)]">
          {activeModel}
        </div>
        <div className="flex items-center gap-1.5 text-[8px] text-[var(--grey-dim)]">
          <span className="font-mono">v1.0</span>
          <span>·</span>
          <span>AGNOSTIC</span>
        </div>
      </div>

      {/* Bottom status bar */}
      <div className="border-t border-[var(--border)] px-3 py-1.5 flex items-center justify-between">
        <span className="text-[8px] text-[var(--grey-dim)] font-mono">SYS</span>
        <div className="flex items-center gap-1.5">
          <div className="w-1 h-1 rounded-full bg-[var(--green)]" />
          <span className="text-[8px] text-[var(--green)] font-mono">ONLINE</span>
        </div>
      </div>
    </aside>
  )
}

const navItems = [
  { to: '/', label: 'Dashboard', shortcut: 'F1' },
  { to: '/finetune', label: 'Fine-Tune', shortcut: 'F2' },
  { to: '/models', label: 'Models', shortcut: 'F3' },
]
