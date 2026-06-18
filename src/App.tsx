import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import FineTune from './pages/FineTune'
import Models from './pages/Models'
import { Toaster } from './components/Toaster'
import { KeyboardShortcuts } from './components/KeyboardShortcuts'

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-[var(--bg-primary)]">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/finetune" element={<FineTune />} />
            <Route path="/models" element={<Models />} />
          </Routes>
        </main>
        <Toaster />
        <KeyboardShortcuts />
      </div>
    </BrowserRouter>
  )
}
