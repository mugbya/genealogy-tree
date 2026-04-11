import { create } from 'zustand'
import type { Member } from '@/api/client'

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
