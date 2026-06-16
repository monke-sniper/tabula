import { NavLink } from 'react-router-dom'
import { useApp } from '../lib/context'

export default function Sidebar() {
  const { activeModel, sessionId } = useApp()

  return (
    <aside className="w-[220px] bg-[var(--bg-secondary)] border-r border-[var(--border-subtle)] flex flex-col shrink-0 select-none">
      {/* Brand */}
      <div className="h-[52px] flex items-center gap-2.5 px-4 border-b border-[var(--border-subtle)]">
        <div className="w-6 h-6 rounded bg-[var(--accent-cyan)] flex items-center justify-center">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--bg-primary)" strokeWidth="2.5" strokeLinecap="round">
            <path d="M3 3v18h18" />
            <path d="M7 16l4-4 4 4 5-5" />
          </svg>
        </div>
        <span className="text-[13px] font-bold tracking-[0.08em] uppercase text-[var(--text-primary)]">Tabula</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 px-2 space-y-0.5">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded text-[12px] font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-[var(--accent-cyan-dim)] text-[var(--accent-cyan)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`
            }
          >
            <Icon className="w-3.5 h-3.5 opacity-70" />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Status bar */}
      <div className="px-3 py-3 border-t border-[var(--border-subtle)] space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] font-semibold tracking-[0.08em] uppercase text-[var(--text-muted)]">Active Model</span>
          {sessionId && <div className="live-dot" />}
        </div>
        <div className="font-mono text-[10px] text-[var(--accent-cyan)] truncate bg-[var(--bg-primary)] rounded px-2 py-1.5 border border-[var(--border-subtle)]">
          {activeModel}
        </div>
        <div className="flex items-center gap-2 text-[9px] text-[var(--text-muted)]">
          <span className="font-mono">v1.0.0</span>
          <span className="opacity-30">·</span>
          <span>Model-Agnostic</span>
        </div>
      </div>
    </aside>
  )
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v18h18M7 16l4-4 4 4 5-5" />
    </svg>
  )
}

function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  )
}

function DatabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
    </svg>
  )
}

const navItems = [
  { to: '/', label: 'Dashboard', icon: ChartIcon },
  { to: '/finetune', label: 'Fine-Tune', icon: GearIcon },
  { to: '/models', label: 'Models', icon: DatabaseIcon },
]
