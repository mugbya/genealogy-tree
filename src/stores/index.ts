import { create } from 'zustand'
import type { Member, User } from '@/api/client'
import { authApi } from '@/api/client'

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
  checkAuth: () => Promise<boolean>
  restoreUser: () => void
}

export const useAuthStore = create<AuthState>((set, get) => {
  // 从 localStorage 恢复初始状态（同步读取，避免闪烁）
  const savedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  const savedUserInfo = typeof window !== 'undefined' ? localStorage.getItem('userInfo') : null
  const savedIsAdmin = typeof window !== 'undefined' && localStorage.getItem('isAdmin') === 'true'

  let initialUser: User | null = null
  if (savedUserInfo && savedToken) {
    try {
      initialUser = JSON.parse(savedUserInfo)
    } catch {
      // ignore parse error
    }
  }

  return {
    user: initialUser,
    token: savedToken,
    isAdmin: savedIsAdmin,
    setAuth: (user, token) => {
      localStorage.setItem('token', token)
      localStorage.setItem('isAdmin', user.role === 'admin' ? 'true' : 'false')
      localStorage.setItem('userInfo', JSON.stringify({ id: user.id, username: user.username, role: user.role }))
      set({ user, token, isAdmin: user.role === 'admin' })
    },
    logout: () => {
      localStorage.removeItem('token')
      localStorage.removeItem('genealogy_remember')
      localStorage.removeItem('wechat_nickname')
      localStorage.removeItem('isAdmin')
      localStorage.removeItem('userInfo')
      set({ user: null, token: null, isAdmin: false })
    },
    // 检查 token 是否有效
    checkAuth: async () => {
      const token = get().token
      if (!token) return false

      // 浏览器环境下验证 token
      if (typeof window !== 'undefined') {
        try {
          const result = await authApi.getCurrentUser()
          if (result.data) {
            set({ user: result.data, isAdmin: result.data.role === 'admin' })
            return true
          }
        } catch {
          // token 无效，清除
          localStorage.removeItem('token')
          set({ user: null, token: null, isAdmin: false })
        }
      }
      return false
    },
    // 从 localStorage 恢复用户信息（同步调用，用于初始化）
    restoreUser: () => {
      if (typeof window === 'undefined') return
      const userInfo = localStorage.getItem('userInfo')
      const token = localStorage.getItem('token')
      const isAdmin = localStorage.getItem('isAdmin') === 'true'
      if (userInfo && token) {
        try {
          const user = JSON.parse(userInfo)
          set({ user, token, isAdmin })
        } catch {
          // ignore parse error
        }
      }
    },
  }
})
