import { Sidebar } from './sidebar'
import { GuestSyncPrompt } from './guest-sync-prompt'

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main className="ml-64 p-8 min-h-screen" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        {children}
      </main>
      <GuestSyncPrompt />
    </>
  )
}
