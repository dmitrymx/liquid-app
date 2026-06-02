import React, { useEffect } from 'react'
import { HashRouter, Routes, Route, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import HardwareMonitor from './pages/HardwareMonitor'
import FanControl from './pages/FanControl'
import SmartCleaner from './pages/SmartCleaner'
import PerformanceOptimizer from './pages/PerformanceOptimizer'
import SystemBenchmarks from './pages/SystemBenchmarks'
import PrivacySecurity from './pages/PrivacySecurity'
import Tools from './pages/Tools'
import NetworkTools from './pages/NetworkTools'
import SystemMaintenance from './pages/SystemMaintenance'
import SystemTweaks from './pages/SystemTweaks'
import Settings from './pages/Settings'
import About from './pages/About'
import { useHardwareStore } from './store/useHardwareStore'
import { useAppStore } from './store/useAppStore'
import { ipc } from './lib/ipc'

/** Inner component that can use useNavigate (requires Router context) */
const AppInner: React.FC = () => {
  const { setData, addToHistory, setPolling } = useHardwareStore()
  const { sensorInterval, language } = useAppStore()
  const { i18n } = useTranslation()
  const navigate = useNavigate()

  useEffect(() => {
    /* Sync persisted language with i18n */
    if (i18n.language !== language) {
      i18n.changeLanguage(language)
    }
  }, [])

  useEffect(() => {
    /* Start hardware polling */
    const cleanup = ipc.onHardwareUpdate((data: any) => {
      if (data && !data.error) {
        setData(data)
        addToHistory(data)
      }
    })

    ipc.startHardwarePolling(sensorInterval)
    setPolling(true)

    return () => {
      cleanup()
      ipc.stopHardwarePolling()
      setPolling(false)
    }
  }, [sensorInterval])

  /* Listen for quick-optimize event from tray */
  useEffect(() => {
    const api = window.electronAPI
    if (api?.onQuickOptimize) {
      const cleanup = api.onQuickOptimize(() => {
        navigate('/cleaner')
      })
      return cleanup
    }
  }, [navigate])

  return (
    <>
      <TitleBar />
      <div className="app-layout">
        <Sidebar />
        <main className="app-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/hardware" element={<HardwareMonitor />} />
            <Route path="/fan-control" element={<FanControl />} />
            <Route path="/cleaner" element={<SmartCleaner />} />
            <Route path="/performance" element={<PerformanceOptimizer />} />
            <Route path="/benchmarks" element={<SystemBenchmarks />} />
            <Route path="/privacy" element={<PrivacySecurity />} />
            <Route path="/network" element={<NetworkTools />} />
            <Route path="/maintenance" element={<SystemMaintenance />} />
            <Route path="/tweaks" element={<SystemTweaks />} />
            <Route path="/tools" element={<Tools />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
      </div>
    </>
  )
}

const App: React.FC = () => {
  return (
    <HashRouter>
      <AppInner />
    </HashRouter>
  )
}

export default App
