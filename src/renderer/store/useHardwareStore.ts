import { create } from 'zustand'

interface HardwareState {
  data: any | null
  history: any[]
  isPolling: boolean
  error: string | null
  setData: (data: any) => void
  addToHistory: (data: any) => void
  setPolling: (v: boolean) => void
  setError: (err: string | null) => void
}

const MAX_HISTORY = 60

export const useHardwareStore = create<HardwareState>((set, get) => ({
  data: null,
  history: [],
  isPolling: false,
  error: null,
  setData: (data) => set({ data, error: null }),
  addToHistory: (data) => {
    const prev = get().history
    /* PERF: Avoid spread-copy — push + shift is O(1) vs O(n) */
    prev.push(data)
    if (prev.length > MAX_HISTORY) prev.shift()
    set({ history: prev.slice() }) /* shallow clone to trigger React update */
  },
  setPolling: (isPolling) => set({ isPolling }),
  setError: (error) => set({ error })
}))
