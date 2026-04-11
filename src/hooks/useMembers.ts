import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membersApi, healthApi } from '@/api/client'
import { useMembersStore } from '@/stores'

export function useHealthCheck() {
  return useQuery({
    queryKey: ['health'],
    queryFn: healthApi.check,
    retry: 1,
  })
}

export function useMembers() {
  const setMembers = useMembersStore((s) => s.setMembers)

  return useQuery({
    queryKey: ['members'],
    queryFn: async () => {
      const result = await membersApi.list()
      if (result.data) {
        setMembers(result.data)
      }
      return result
    },
  })
}

export function useCreateMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: membersApi.create,
    onSuccess: (result) => {
      if (result.data) {
        queryClient.invalidateQueries({ queryKey: ['members'] })
      }
    },
  })
}
