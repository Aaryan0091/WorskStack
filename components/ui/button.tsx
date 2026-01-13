import React from 'react'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const baseStyles = 'rounded-lg font-medium transition-all duration-75 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-90 cursor-pointer'

  const variantStyles: Record<string, string> = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'text-gray-900 hover:bg-gray-300 focus:ring-gray-500',
    ghost: 'bg-transparent hover:bg-gray-100 text-gray-700 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  }

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  }

  const getVariantStyle = (variant: string): React.CSSProperties => {
    if (variant === 'secondary') {
      return {
        backgroundColor: 'var(--bg-secondary)',
        color: 'var(--text-primary)'
      }
    }
    if (variant === 'ghost') {
      return {
        backgroundColor: 'transparent',
        color: 'var(--text-primary)'
      }
    }
    return {}
  }

  return (
    <button
      className={`${baseStyles} ${variant === 'primary' || variant === 'danger' ? variantStyles[variant] : ''} ${sizeStyles[size]} ${className}`}
      style={getVariantStyle(variant)}
      {...props}
    >
      {children}
    </button>
  )
}
