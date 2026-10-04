import { NavLink } from 'react-router-dom'
import { useApp } from '../lib/context'
import { HelpTip } from './HelpTip'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', shortcut: 'F1', tip: 'Upload data, explore it, run forecasts' },
  { to: '/finetune', label: 'Fine-Tune', shortcut: 'F2', tip: 'Train a custom LSTM forecaster on your data' },
  { to: '/models', label: 'Models', shortcut: 'F3', tip: 'Activate or delete fine-tuned models' },
]

export default function Sidebar() {
  const { activeModel, uploadData, health, models } = useApp()
  const healthy = health?.status === 'healthy'
  return (
    <aside className="w-[188px] bg-[var(--bg-secondary)] border-r border-[var(--border)] flex flex-col shrink-0 select-none">
      <div className="h-[30px] flex items-center gap-2 px-3 bg-[var(--amber)]">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <path d="M3 3v18h18" />
          <path d="M7 16l4-4 4 4 5-5" />
        </svg>
        <span className="text-[12px] font-bold tracking-[0.14em] uppercase text-black">Tabula</span>
      </div>

      <nav className="flex-1 py-1.5" aria-label="Main">
        {NAV_ITEMS.map(({ to, label, shortcut, tip }) => (
          <NavLink
            key={to}
            to={to}
            end
            title={tip}
            className={({ isActive }) =>
              `flex items-center justify-between px-3 py-1.5 text-[11px] font-medium transition-colors border-l-2 ${
                isActive
                  ? 'bg-[var(--amber-dim)] text-[var(--amber)] border-l-[var(--amber)]'
                  : 'text-[var(--grey-bright)] hover:text-[var(--white)] hover:bg-[var(--bg-tertiary)] border-l-transparent'
              }`
            }
          >
            <span>{label}</span>
            <kbd className="font-mono text-[9px] text-[var(--grey)]">{shortcut}</kbd>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] px-3 py-2 space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="blz-label">Model<HelpTip text="The active forecaster. Change it on the Models page or in the Forecast Engine MODEL dropdown." /></span>
          <span className="font-mono text-[9px] text-[var(--grey)]">{models.length} custom</span>
        </div>
        <div className="font-mono text-[10px] text-[var(--amber)] truncate bg-[var(--bg-primary)] px-2 py-1 border border-[var(--border)]" title={activeModel}>
          {activeModel}
        </div>
        {uploadData && (
          <div className="font-mono text-[9px] text-[var(--grey-bright)] truncate" title={uploadData.filename}>
            <span className="text-[var(--green)]">●</span> {uploadData.filename}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] px-3 py-1.5 flex items-center justify-between">
        <span className="blz-label">Backend<HelpTip text="Polled every 10s. If offline, start it with `npm run backend` (or `npm start`)." /></span>
        <span className={`flex items-center gap-1.5 text-[9px] font-mono ${healthy ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${healthy ? 'bg-[var(--green)]' : 'bg-[var(--red)]'}`} />
          {healthy ? 'ONLINE' : 'OFFLINE'}
        </span>
      </div>
    </aside>
  )
}
