'use client'

import { useState, useEffect } from 'react'
import { Modal } from '@/components/ui/modal'
import { sendExtensionMessage } from '@/lib/extension-detect'

interface OpenTab {
  tabId: number
  url: string
  title: string
  favicon?: string
}

interface OpenTabsModalProps {
  isOpen: boolean
  onClose: () => void
  onAddBookmarks: (tabs: { url: string; title: string }[]) => void
}

export function OpenTabsModal({ isOpen, onClose, onAddBookmarks }: OpenTabsModalProps) {
  const [tabs, setTabs] = useState<OpenTab[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTabIds, setSelectedTabIds] = useState<Set<number>>(new Set())
  const [extensionAvailable, setExtensionAvailable] = useState(true)

  useEffect(() => {
    if (isOpen) {
      fetchOpenTabs()
    } else {
      // Reset state when closing
      setTabs([])
      setSelectedTabIds(new Set())
    }
  }, [isOpen])

  const fetchOpenTabs = async () => {
    setLoading(true)
    try {
      const response = await sendExtensionMessage({ action: 'getOpenTabs' })
      if (response?.tabs && Array.isArray(response.tabs)) {
        setTabs(response.tabs)
        setExtensionAvailable(true)
      } else {
        setExtensionAvailable(false)
      }
    } catch (error) {
      console.error('Failed to fetch open tabs:', error)
      setExtensionAvailable(false)
    } finally {
      setLoading(false)
    }
  }

  const toggleTabSelection = (tabId: number) => {
    const newSelected = new Set(selectedTabIds)
    if (newSelected.has(tabId)) {
      newSelected.delete(tabId)
    } else {
      newSelected.add(tabId)
    }
    setSelectedTabIds(newSelected)
  }

  const selectAll = () => {
    setSelectedTabIds(new Set(tabs.map(t => t.tabId)))
  }

  const deselectAll = () => {
    setSelectedTabIds(new Set())
  }

  const handleAddBookmarks = () => {
    const selectedTabs = tabs.filter(t => selectedTabIds.has(t.tabId))
    if (selectedTabs.length > 0) {
      onAddBookmarks(selectedTabs.map(t => ({ url: t.url, title: t.title })))
      setSelectedTabIds(new Set())
      onClose()
    }
  }

  const getDomain = (url: string) => {
    try { return new URL(url).hostname }
    catch { return url }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Open Tabs">
      <div className="space-y-4">
        {/* Extension not available message */}
        {!extensionAvailable && !loading && (
          <div className="p-4 rounded-lg text-sm" style={{ backgroundColor: 'rgba(251, 146, 60, 0.1)', border: '1px solid rgba(251, 146, 60, 0.3)' }}>
            <p style={{ color: '#ea580c' }}>
              ⚠️ Extension not detected. Please install the WorkStack extension to import open tabs.
            </p>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Tabs list */}
        {!loading && extensionAvailable && tabs.length === 0 && (
          <div className="text-center py-8" style={{ color: 'var(--text-secondary)' }}>
            No open tabs found.
          </div>
        )}

        {!loading && extensionAvailable && tabs.length > 0 && (
          <>
            {/* Actions */}
            <div className="flex items-center justify-between">
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {selectedTabIds.size} of {tabs.length} selected
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={deselectAll}
                  className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                  style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* Tabs list */}
            <div className="max-h-80 overflow-y-auto space-y-2">
              {tabs.map((tab) => (
                <div
                  key={tab.tabId}
                  onClick={() => toggleTabSelection(tab.tabId)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedTabIds.has(tab.tabId) ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                  }`}
                  style={{
                    border: selectedTabIds.has(tab.tabId) ? '1px solid #3b82f6' : '1px solid var(--border-color)',
                    backgroundColor: selectedTabIds.has(tab.tabId) ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-secondary)'
                  }}
                >
                  {/* Checkbox */}
                  <div className="flex-shrink-0">
                    <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      selectedTabIds.has(tab.tabId) ? 'bg-blue-600 border-blue-600' : 'border-gray-300 dark:border-gray-600'
                    }`}>
                      {selectedTabIds.has(tab.tabId) && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Favicon */}
                  <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--bg-primary)' }}>
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${getDomain(tab.url)}&sz=32`}
                      className="w-5 h-5"
                      alt=""
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  </div>

                  {/* Tab info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                      {tab.title || 'Untitled'}
                    </p>
                    <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                      {tab.url}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add button */}
            <div className="flex gap-2 pt-4 border-t" style={{ borderColor: 'var(--border-color)' }}>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 px-4 py-2 rounded-lg transition-colors"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAddBookmarks}
                disabled={selectedTabIds.size === 0}
                className="flex-1 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  backgroundColor: selectedTabIds.size > 0 ? '#3b82f6' : 'var(--bg-secondary)',
                  color: 'white',
                  cursor: selectedTabIds.size > 0 ? 'pointer' : 'not-allowed'
                }}
              >
                Add {selectedTabIds.size} Bookmark{selectedTabIds.size !== 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
