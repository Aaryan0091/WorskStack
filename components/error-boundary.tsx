'use client'

import { Component, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Error Boundary component to catch JavaScript errors anywhere in the child component tree,
 * log those errors, and display a fallback UI instead of the component tree that crashed.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack: string }) {
    // Log the error to an error reporting service
    console.error('Error Boundary caught an error:', error)
    console.error('Component stack:', errorInfo.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined })
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: 'var(--bg-primary)' }}>
          <div className="max-w-md w-full text-center space-y-6">
            {/* Error Icon */}
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
                <svg className="w-10 h-10" style={{ color: '#ef4444' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Something went wrong
              </h1>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {this.state.error?.message || 'An unexpected error occurred'}
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-6 py-2.5 rounded-lg font-medium transition-all active:scale-95"
                style={{ backgroundColor: '#8b5cf6', color: 'white', cursor: 'pointer' }}
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-6 py-2.5 rounded-lg font-medium transition-all active:scale-95"
                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                Go Home
              </button>
            </div>

            {/* Report Issue */}
            <details className="text-left">
              <summary className="text-sm cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                View error details
              </summary>
              <pre className="mt-3 p-3 rounded-lg text-xs overflow-auto max-h-40" style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
                {this.state.error?.stack || 'No stack trace available'}
              </pre>
            </details>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Hook version for functional components (requires Suspense wrapper)
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
): React.ComponentType<P & { errorBoundaryFallback?: ReactNode }> {
  function WithErrorBoundaryWrapper(props: P & { errorBoundaryFallback?: ReactNode }) {
    return (
      <ErrorBoundary fallback={props.errorBoundaryFallback || fallback}>
        <Component {...props} />
      </ErrorBoundary>
    )
  }

  WithErrorBoundaryWrapper.displayName = `withErrorBoundary(${Component.displayName || Component.name || 'Component'})`

  return WithErrorBoundaryWrapper
}
