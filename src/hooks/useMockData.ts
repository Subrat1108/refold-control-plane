import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import * as api from '@/data/mockData'
import type { FlagScope } from '@/types'

export function useOverviewStats() {
  return useQuery({ queryKey: ['overviewStats'], queryFn: api.fetchOverviewStats })
}

export function useCloudOrgs() {
  return useQuery({ queryKey: ['cloudOrgs'], queryFn: api.fetchCloudOrgs })
}

export function useCloudOrg(id: string) {
  return useQuery({ queryKey: ['cloudOrg', id], queryFn: () => api.fetchCloudOrg(id), enabled: !!id })
}

export function useCloudOrgMetrics(id: string) {
  return useQuery({ queryKey: ['cloudOrgMetrics', id], queryFn: () => api.fetchCloudOrgMetrics(id), enabled: !!id })
}

export function useOnPremOrgs() {
  return useQuery({ queryKey: ['onPremOrgs'], queryFn: api.fetchOnPremOrgs })
}

export function useOnPremOrg(id: string) {
  return useQuery({ queryKey: ['onPremOrg', id], queryFn: () => api.fetchOnPremOrg(id), enabled: !!id })
}

// Normalized chart series for the shared detail sections (DetailCharts),
// selected from the full cloud-org detail so no second fetch is needed.
export function useCloudDetailCharts(id: string) {
  return useQuery({
    queryKey: ['cloudOrg', id],
    queryFn: () => api.fetchCloudOrg(id),
    enabled: !!id,
    select: (d) => ({
      executionsTrend: d.workflowExecutionsTrend,
      apiCallsTrend: d.apiCallsTrend,
      errorBreakdown: d.errorBreakdown,
    }),
  })
}

// R2 (D-051): metrics + charts are scoped by the org WITHIN a namespace.
export function useNamespaceOrgs(nsId: string) {
  return useQuery({ queryKey: ['namespaceOrgs', nsId], queryFn: () => api.fetchNamespaceOrgs(nsId), enabled: !!nsId })
}

export function useNamespaceOrg(nsOrgId: string) {
  return useQuery({ queryKey: ['namespaceOrg', nsOrgId], queryFn: () => api.fetchNamespaceOrg(nsOrgId), enabled: !!nsOrgId })
}

export function useNamespaceOrgMetrics(nsOrgId: string) {
  return useQuery({ queryKey: ['namespaceOrgMetrics', nsOrgId], queryFn: () => api.fetchNamespaceOrgMetrics(nsOrgId), enabled: !!nsOrgId })
}

export function useNamespaceOrgCharts(nsOrgId: string) {
  return useQuery({
    queryKey: ['namespaceOrg', nsOrgId],
    queryFn: () => api.fetchNamespaceOrg(nsOrgId),
    enabled: !!nsOrgId,
    select: (d) => ({
      executionsTrend: d.executionsTrend,
      apiCallsTrend: d.apiCallsTrend,
      errorBreakdown: d.errorBreakdown,
    }),
  })
}

export function useOnPremOrgDetail(id: string) {
  return useQuery({ queryKey: ['onPremOrgDetail', id], queryFn: () => api.fetchOnPremOrgDetail(id), enabled: !!id })
}

export function useNamespaceDetail(nsId: string) {
  return useQuery({ queryKey: ['namespaceDetail', nsId], queryFn: () => api.fetchNamespaceDetail(nsId), enabled: !!nsId })
}

export function useFeatureFlags(scope: FlagScope = 'global', entityId?: string) {
  return useQuery({
    queryKey: ['featureFlags', scope, entityId ?? '-'],
    queryFn: () => api.fetchFeatureFlags(scope, entityId),
  })
}

export function useCloudDashboard(orgId: string) {
  return useQuery({ queryKey: ['cloudDashboard', orgId], queryFn: () => api.fetchCloudDashboard(orgId), enabled: !!orgId })
}

export function useOnPremDashboard(orgId: string) {
  return useQuery({ queryKey: ['onPremDashboard', orgId], queryFn: () => api.fetchOnPremDashboard(orgId), enabled: !!orgId })
}

export function useAiCredits(orgId: string) {
  return useQuery({ queryKey: ['aiCredits', orgId], queryFn: () => api.fetchAiCredits(orgId), enabled: !!orgId })
}

export function useSearch(query: string) {
  return useQuery({
    queryKey: ['search', query],
    queryFn: () => api.searchAll(query),
    enabled: query.trim().length >= 1,
    staleTime: 0,
  })
}

export function useUpdateFeatureFlag() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      api.updateFeatureFlag(id, enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['featureFlags'] })
      qc.invalidateQueries({ queryKey: ['cloudOrg'] })
      qc.invalidateQueries({ queryKey: ['onPremOrg'] })
      qc.invalidateQueries({ queryKey: ['namespaceDetail'] })
    },
  })
}
