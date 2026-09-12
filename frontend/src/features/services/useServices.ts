import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listServices, createService, updateService, deleteService,
} from '@/api/services'
import type { ServiceCommand } from '@/api/types'

export const SERVICES_QUERY_KEY = ['services'] as const

export function useServices() {
  return useQuery({ queryKey: SERVICES_QUERY_KEY, queryFn: listServices })
}

export function useCreateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (command: ServiceCommand) => createService(command),
    onSuccess: () => qc.invalidateQueries({ queryKey: SERVICES_QUERY_KEY }),
  })
}

export function useUpdateService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, command }: { id: string; command: ServiceCommand }) =>
      updateService(id, command),
    onSuccess: () => qc.invalidateQueries({ queryKey: SERVICES_QUERY_KEY }),
  })
}

export function useDeleteService() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deleteService(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: SERVICES_QUERY_KEY }),
  })
}
