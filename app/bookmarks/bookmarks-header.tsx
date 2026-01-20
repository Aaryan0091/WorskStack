'use client'

import { Button } from '@/components/ui/button'

export function BookmarksHeader() {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>Bookmarks</h1>
        <p className="mt-1" style={{ color: 'var(--text-secondary)' }}>Save and organize your links</p>
      </div>
      <Button onClick={() => (document as any).getElementById('add-bookmark-btn')?.click()}>+ Add Bookmark</Button>
    </div>
  )
}
