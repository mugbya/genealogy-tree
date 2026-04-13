import { create } from 'zustand'
import type { Member, User } from '@/api/client'

interface MembersState {
  members: Member[]
  selectedMember: Member | null
  setMembers: (members: Member[]) => void
  addMember: (member: Member) => void
  setSelectedMember: (member: Member | null) => void
}

export const useMembersStore = create<MembersState>((set) => ({
  members: [],
  selectedMember: null,
  setMembers: (members) => set({ members }),
  addMember: (member) => set((state) => ({ members: [...state.members, member] })),
  setSelectedMember: (member) => set({ selectedMember: member }),
}))

interface AppState {
  isLoading: boolean
  setLoading: (loading: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),
}))

interface AuthState {
  user: User | null
  token: string | null
  isAdmin: boolean
  setAuth: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  isAdmin: false,
  setAuth: (user, token) => {
    localStorage.setItem('token', token)
    set({ user, token, isAdmin: user.role === 'admin' })
  },
  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('genealogy_remember')
    localStorage.removeItem('wechat_nickname')
    set({ user: null, token: null, isAdmin: false })
  },
}))
