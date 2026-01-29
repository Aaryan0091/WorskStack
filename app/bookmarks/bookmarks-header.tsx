'use client'

interface BookmarksHeaderProps {
  isGuest?: boolean
}

export function BookmarksHeader({ isGuest = false }: BookmarksHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Bookmarks</h1>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>
          Save and organize your links
          {isGuest && (
            <span className="ml-2 text-xs px-2 py-1 rounded-full" style={{ backgroundColor: 'rgba(251, 146, 60, 0.2)', color: '#ea580c' }}>
              Guest Mode
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
