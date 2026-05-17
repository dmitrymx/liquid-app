import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AppState {
  theme: 'dark' | 'light'
  language: 'ru' | 'en'
  sensorInterval: number
  autostart: boolean
  autoClean: boolean
  setTheme: (theme: 'dark' | 'light') => void
  setLanguage: (lang: 'ru' | 'en') => void
  setSensorInterval: (ms: number) => void
  setAutostart: (v: boolean) => void
  setAutoClean: (v: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      theme: 'dark',
      language: 'ru',
      sensorInterval: 2000,
      autostart: false,
      autoClean: false,
      setTheme: (theme) => {
        document.documentElement.setAttribute('data-theme', theme)
        set({ theme })
      },
      setLanguage: (language) => set({ language }),
      setSensorInterval: (sensorInterval) => set({ sensorInterval }),
      setAutostart: (autostart) => set({ autostart }),
      setAutoClean: (autoClean) => set({ autoClean })
    }),
    {
      name: 'liquid-app-settings',
      /* On rehydrate, apply persisted theme and language */
      onRehydrateStorage: () => (state) => {
        if (state) {
          document.documentElement.setAttribute('data-theme', state.theme)
          /* Language will be synced by Settings component via i18n */
        }
      }
    }
  )
)
