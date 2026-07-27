import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/contexts/AuthContext'
import { AuthGateProvider } from '@/contexts/AuthGateContext'
import { router } from '@/router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthGateProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </AuthGateProvider>
    </QueryClientProvider>
  )
}
