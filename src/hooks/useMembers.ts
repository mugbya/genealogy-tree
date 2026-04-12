import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { membersApi, healthApi, memberRelationsApi } from '@/api/client'
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

export function useUpdateMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof membersApi.update>[1] }) =>
      membersApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

export function useDeleteMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: membersApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['members'] })
    },
  })
}

export function useMemberRelations() {
  return useQuery({
    queryKey: ['member-relations'],
    queryFn: memberRelationsApi.list,
  })
}

export function useCreateMemberRelation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: memberRelationsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-relations'] })
    },
  })
}

export function useDeleteMemberRelation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: memberRelationsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['member-relations'] })
    },
  })
}
