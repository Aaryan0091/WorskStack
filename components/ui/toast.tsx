'use client'

import { useEffect, useState } from 'react'

interface ToastProps {
  message: string
  type?: 'success' | 'error' | 'info'
  duration?: number
  onClose: () => void
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true))
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(onClose, 300)
    }, duration)

    return () => clearTimeout(timer)
  }, [duration, onClose])

  const bgColor = {
    success: 'bg-green-600',
    error: 'bg-red-600',
    info: 'bg-gray-800'
  }[type]

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg text-white text-sm font-medium z-50 transition-all duration-300 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
      style={{ backgroundColor: type === 'error' ? '#dc2626' : type === 'success' ? '#16a34a' : '#1f2937' }}
    >
      {message}
    </div>
  )
}

interface UndoToastProps {
  message: string
  duration?: number
  onClose: () => void
  onUndo: () => void
  onExpired?: () => void
  variant?: 'default' | 'danger'
}

export function UndoToast({ message, duration = 5000, onClose, onUndo, onExpired, variant = 'default' }: UndoToastProps) {
  const [isVisible, setIsVisible] = useState(false)
  const [timeLeft, setTimeLeft] = useState(duration / 1000)

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true))
    const timer = setTimeout(() => {
      setIsVisible(false)
      setTimeout(() => {
        onClose()
        onExpired?.()
      }, 300)
    }, duration)

    // Countdown timer
    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1))
    }, 1000)

    return () => {
      clearTimeout(timer)
      clearInterval(interval)
    }
  }, [duration, onClose, onExpired])

  const handleUndo = () => {
    setIsVisible(false)
    setTimeout(() => {
      onUndo()
      onClose()
    }, 200)
  }

  const isDanger = variant === 'danger'

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 px-6 py-4 rounded-xl shadow-2xl z-50 transition-all duration-300 flex items-center gap-4 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
      }`}
      style={{
        backgroundColor: isDanger ? '#dc2626' : 'var(--bg-primary)',
        border: isDanger ? '1px solid #b91c1c' : '1px solid var(--border-color)'
      }}
    >
      <div className="flex items-center gap-3">
        {isDanger ? (
          <svg className="w-5 h-5" style={{ color: 'white' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        ) : (
          <svg className="w-5 h-5" style={{ color: '#16a34a' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
        <span className="text-sm font-medium" style={{ color: isDanger ? 'white' : 'var(--text-primary)' }}>{message}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: isDanger ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)' }}>({timeLeft}s)</span>
        <button
          onClick={handleUndo}
          className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all active:scale-95"
          style={{
            backgroundColor: isDanger ? 'white' : '#8b5cf6',
            color: isDanger ? '#dc2626' : 'white',
            cursor: 'pointer'
          }}
        >
          Undo
        </button>
      </div>
    </div>
  )
}

interface ConfirmDialogProps {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true))
  }, [])

  const handleConfirm = () => {
    setIsVisible(false)
    setTimeout(onConfirm, 200)
  }

  const handleCancel = () => {
    setIsVisible(false)
    setTimeout(onCancel, 200)
  }

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-50 transition-opacity duration-200 ${
          isVisible ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={handleCancel}
      />
      <div
        className={`fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 p-6 rounded-xl shadow-2xl z-50 transition-all duration-200 min-w-80 ${
          isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        style={{ backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)' }}
      >
        <p className="text-sm mb-6" style={{ color: 'var(--text-primary)' }}>{message}</p>
        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: '#3b82f6', cursor: 'pointer' }}
          >
            Confirm
          </button>
        </div>
      </div>
    </>
  )
}
