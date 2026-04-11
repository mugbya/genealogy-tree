import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi, authApi } from '@/api/client'
import { useAuthStore } from '@/stores'

export function useCurrentUser() {
  const setAuth = useAuthStore((s) => s.setAuth)

  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const result = await authApi.getCurrentUser()
      if (result.data && result.data) {
        const token = localStorage.getItem('token')
        if (token) {
          setAuth(result.data, token)
        }
      }
      return result
    },
    retry: false,
  })
}

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: usersApi.list,
  })
}

export function useCreateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: usersApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useUpdateUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof usersApi.update>[1] }) =>
      usersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}

export function useDeleteUser() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: usersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] })
    },
  })
}
