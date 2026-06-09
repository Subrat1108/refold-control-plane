import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout() {
  return (
    <div className="flex h-screen bg-[#F8F9FC]">
      <Sidebar />
      <div className="flex flex-col flex-1 ml-60 min-h-screen">
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
