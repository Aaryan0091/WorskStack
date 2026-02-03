'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoginForm } from '@/components/auth/login-form'
import { SignupForm } from '@/components/auth/signup-form'
import { GuestSyncPrompt } from '@/components/guest-sync-prompt'

export default function LoginPage() {
  const router = useRouter()
  const [isLogin, setIsLogin] = useState(true)

  const features = [
    { icon: '🔖', title: 'Smart Bookmarks', desc: 'Organize and search your bookmarks effortlessly' },
    { icon: '📚', title: 'Reading List', desc: 'Save articles to read later with AI summaries' },
    { icon: '📊', title: 'Activity Tracking', desc: 'Monitor your productivity over time' },
    { icon: '🤖', title: 'AI Powered', desc: 'Smart search and content organization' },
  ]

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--bg-secondary)' }}>
      {/* Left side - Features */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 p-12 flex-col justify-center relative overflow-hidden">
        {/* Gradient background effect */}
        <div className="absolute inset-0 opacity-30">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full blur-3xl" style={{ background: 'linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)' }} />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full blur-3xl" style={{ background: 'linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%)' }} />
        </div>

        <div className="relative z-10 max-w-xl mx-auto">
          <h1 className="text-5xl font-bold mb-4" style={{ color: 'var(--text-primary)' }}>
            WorkStack
          </h1>
          <p className="text-xl mb-12" style={{ color: 'var(--text-secondary)' }}>
            Your all-in-one productivity toolkit powered by AI
          </p>

          <div className="space-y-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="flex items-start gap-4 p-4 rounded-xl transition-all duration-300"
                style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}
              >
                <span className="text-3xl">{feature.icon}</span>
                <div>
                  <h3 className="font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                    {feature.title}
                  </h3>
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {feature.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="w-full lg:w-1/2 xl:w-2/5 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
              WorkStack
            </h1>
            <p style={{ color: 'var(--text-secondary)' }}>
              Your all-in-one productivity toolkit
            </p>
          </div>

          {/* Form card with gradient border */}
          <div
            className="rounded-2xl p-8 relative"
            style={{
              backgroundColor: 'var(--bg-primary)',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)'
            }}
          >
            {/* Gradient border effect */}
            <div className="absolute inset-0 rounded-2xl p-[1px] bg-gradient-to-br from-purple-500 via-pink-500 to-blue-500 -z-10 opacity-50" />

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
                {isLogin ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                {isLogin ? 'Sign in to continue to WorkStack' : 'Start your productivity journey today'}
              </p>
            </div>

            {/* Tab toggle */}
            <div className="flex p-1 rounded-xl mb-6" style={{ backgroundColor: 'var(--bg-secondary)' }}>
              <button
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isLogin ? 'shadow-sm' : ''
                }`}
                style={{
                  backgroundColor: isLogin ? 'var(--bg-primary)' : 'transparent',
                  color: isLogin ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                Sign in
              </button>
              <button
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  !isLogin ? 'shadow-sm' : ''
                }`}
                style={{
                  backgroundColor: !isLogin ? 'var(--bg-primary)' : 'transparent',
                  color: !isLogin ? 'var(--text-primary)' : 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
              >
                Sign up
              </button>
            </div>

            {isLogin ? (
              <LoginForm />
            ) : (
              <SignupForm />
            )}
          </div>

          {/* Back to Dashboard button */}
          <button
            onClick={() => router.push('/')}
            className="w-full py-3 rounded-lg font-medium transition-all duration-200 hover:scale-[1.02] active:scale-95 flex items-center justify-center gap-2 mt-4"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-secondary)',
              cursor: 'pointer'
            }}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Continue as Guest</span>
          </button>

          {/* Terms */}
          <p className="text-xs text-center mt-6" style={{ color: 'var(--text-secondary)' }}>
            By continuing, you agree to our Terms of Service and Privacy Policy
          </p>
        </div>
      </div>

      <GuestSyncPrompt />
    </div>
  )
}
