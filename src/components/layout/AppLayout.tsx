import { Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout() {
  const collapsed = useMediaQuery('(max-width: 1200px)')
  return (
    <div className="flex h-screen bg-[#F8F9FC]">
      <Sidebar />
      <div className={cn('flex flex-col flex-1 min-h-screen transition-[margin]', collapsed ? 'ml-16' : 'ml-60')}>
        <Topbar />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1400px] mx-auto p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
