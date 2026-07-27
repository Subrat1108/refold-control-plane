import { useContext } from 'react'
import { AuthGateContext } from '@/contexts/AuthGateContext'

export function useAuthGate() {
  const ctx = useContext(AuthGateContext)
  if (!ctx) throw new Error('useAuthGate must be used within AuthGateProvider')
  return ctx
}
