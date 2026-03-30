import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ChatUIState {
  autoScroll: boolean
  setAutoScroll: (value: boolean) => void
  toggleAutoScroll: () => void
}

export const useChatUIStore = create<ChatUIState>()(
  persist(
    (set) => ({
      autoScroll: true,
      setAutoScroll: (value) => set({ autoScroll: value }),
      toggleAutoScroll: () => set((s) => ({ autoScroll: !s.autoScroll })),
    }),
    { name: 'chat-ui' },
  ),
)
