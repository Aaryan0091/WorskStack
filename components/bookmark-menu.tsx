'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

interface BookmarkMenuProps {
  bookmarkId: string
  isFavorite: boolean
  isRead: boolean
  onToggleFavorite: () => void
  onToggleReadingList: () => void
  onEdit: () => void
  onDelete: () => void
}

export function BookmarkMenu({
  bookmarkId,
  isFavorite,
  isRead,
  onToggleFavorite,
  onToggleReadingList,
  onEdit,
  onDelete,
}: BookmarkMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + 4,
        left: rect.right - 192, // Align menu to the right (192px is menu width)
      })
    }
    setIsOpen(true)
  }

  const closeMenu = () => setIsOpen(false)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        closeMenu()
      }
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        closeMenu()
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenu()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleEscape)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleAction = (action: () => void) => {
    action()
    closeMenu()
  }

  return (
    <>
      <button
        ref={buttonRef}
        onClick={openMenu}
        onMouseDown={(e) => {
          e.stopPropagation()
          e.preventDefault()
        }}
        className="p-1.5 text-gray-400 hover:text-gray-600 rounded transition-all duration-75 z-10 relative"
        style={{ cursor: 'pointer' }}
        title="More options"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed rounded-lg shadow-2xl border py-1 w-48"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
            backgroundColor: 'var(--bg-primary)',
            borderColor: 'var(--border-color)',
            zIndex: 99999,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            onClick={(e) => {
              e.stopPropagation()
              onToggleFavorite()
              closeMenu()
            }}
            className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors rounded cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <span className="text-lg">{isFavorite ? '☆' : '★'}</span>
            <span>{isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}</span>
          </div>

          <div
            onClick={(e) => {
              e.stopPropagation()
              onToggleReadingList()
              closeMenu()
            }}
            className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors rounded cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <span className="text-lg">{isRead ? '➕' : '📚'}</span>
            <span>{isRead ? 'Add to Reading List' : 'Remove from Reading List'}</span>
          </div>

          <div
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
              closeMenu()
            }}
            className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors rounded cursor-pointer"
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <span className="text-lg">✏️</span>
            <span>Edit</span>
          </div>

          <div className="border-t my-1" style={{ borderColor: 'var(--border-color)' }} />

          <div
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
              closeMenu()
            }}
            className="w-full px-4 py-2 text-left text-sm flex items-center gap-3 transition-colors rounded cursor-pointer text-red-600"
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
          >
            <span className="text-lg">🗑️</span>
            <span>Remove</span>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
