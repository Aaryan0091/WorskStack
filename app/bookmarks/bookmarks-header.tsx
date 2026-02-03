'use client'

import { useRef } from 'react'

interface BookmarksHeaderProps {
  isGuest?: boolean
  bookmarks?: Array<{ url: string; title: string; description?: string | null; notes?: string | null; is_favorite: boolean; is_read: boolean; created_at: string }>
  onImport?: (data: { bookmarks: Array<{ url: string; title?: string; description?: string; notes?: string; is_favorite?: boolean; is_read?: boolean }> }) => void
  importing?: boolean
  onError?: (message: string) => void
}

export function BookmarksHeader({ isGuest = false, bookmarks = [], onImport, importing = false, onError }: BookmarksHeaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const exportBookmarks = () => {
    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      bookmarks: bookmarks.map(b => ({
        url: b.url,
        title: b.title,
        description: b.description,
        notes: b.notes,
        is_favorite: b.is_favorite,
        is_read: b.is_read,
        created_at: b.created_at
      }))
    }

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bookmarks-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string)
        if (data.bookmarks && Array.isArray(data.bookmarks)) {
          onImport?.(data)
        } else {
          onError?.('Invalid file format. Please export from WorkStack and try again.')
        }
      } catch {
        onError?.('Error reading file. Please try again.')
      }
    }
    reader.readAsText(file)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

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

      {!isGuest && (
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <button
            onClick={() => !importing && fileInputRef.current?.click()}
            disabled={importing}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              cursor: importing ? 'not-allowed' : 'pointer',
              opacity: importing ? 0.6 : 1
            }}
          >
            {importing ? (
              <>
                <div className="w-4 h-4 border-2 border-gray-400 border-t-purple-600 rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              <>📥 Import</>
            )}
          </button>
          <button
            onClick={exportBookmarks}
            disabled={bookmarks.length === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95"
            style={{
              backgroundColor: bookmarks.length > 0 ? '#8b5cf6' : 'var(--bg-secondary)',
              color: bookmarks.length > 0 ? 'white' : 'var(--text-secondary)',
              cursor: bookmarks.length > 0 ? 'pointer' : 'not-allowed',
              opacity: bookmarks.length === 0 ? 0.6 : 1
            }}
          >
            📤 Export
          </button>
        </div>
      )}
    </div>
  )
}
