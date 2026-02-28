'use client'

import { useMemo, memo, useState } from 'react'

export interface ChartData {
  label: string
  value: number
  color: string
}

// Memoized Pie Chart component
interface PieChartProps {
  data: ChartData[]
}

export const PieChart = memo(function PieChart({ data }: PieChartProps) {
  const total = data.reduce((sum, item) => sum + item.value, 0)
  const size = 160
  const strokeWidth = 22
  const radius = (size - strokeWidth) / 2
  const center = size / 2
  const containerHeight = 160

  const slices = useMemo(() => {
    // Helper function to calculate coordinates
    const getCoordinates = (angle: number) => {
      const radians = (angle - 90) * (Math.PI / 180)
      return {
        x: center + radius * Math.cos(radians),
        y: center + radius * Math.sin(radians),
      }
    }

    // Use reduce to accumulate angle without mutation
    const { slices: resultSlices } = data.reduce<{
      currentAngle: number
      slices: (React.ReactElement | null)[]
    }>(
      (acc, item) => {
        if (item.value === 0) return acc
        const percentage = (item.value / total) * 100
        const angle = (item.value / total) * 360

        const start = getCoordinates(acc.currentAngle)
        const end = getCoordinates(acc.currentAngle + angle)
        const largeArc = angle > 180 ? 1 : 0

        // If it's a full circle (100%)
        if (percentage === 100) {
          return {
            currentAngle: acc.currentAngle + angle,
            slices: [
              ...acc.slices,
              (
                <circle
                  key={item.label}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={item.color}
                  strokeWidth={strokeWidth}
                  style={{ filter: 'drop-shadow(0 0 6px ' + item.color + '50)' }}
                />
              ),
            ],
          }
        }

        return {
          currentAngle: acc.currentAngle + angle,
          slices: [
            ...acc.slices,
            (
              <path
                key={item.label}
                d={`M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`}
                fill="none"
                stroke={item.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                style={{ filter: 'drop-shadow(0 0 6px ' + item.color + '50)' }}
              />
            ),
          ],
        }
      },
      { currentAngle: 0, slices: [] }
    )

    return resultSlices
  }, [data, total, radius, center, strokeWidth])

  return (
    <div className="flex items-center gap-5" style={{ height: containerHeight }}>
      <div className="relative" style={{ width: size, height: size }}>
        {/* Subtle glow behind */}
        <div
          className="absolute inset-0 rounded-full blur-xl opacity-20"
          style={{
            background: 'linear-gradient(135deg, #3b82f6, #a855f7, #f97316)',
            transform: 'scale(0.7)'
          }}
        />
        <svg width={size} height={size} className="flex-shrink-0 relative">
          {slices}
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-xl font-bold"
            style={{ fill: 'var(--text-primary)' }}
          >
            {total}
          </text>
        </svg>
      </div>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{
                backgroundColor: item.color,
                boxShadow: '0 0 8px ' + item.color + '50',
              }}
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</span>: <strong style={{ color: 'var(--text-primary)' }}>{item.value}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
})

// Memoized Bar Chart component
export const BarChart = memo(function BarChart({ data }: PieChartProps) {
  const maxValue = useMemo(() => Math.max(...data.map(d => d.value), 1), [data])
  const barWidth = 32
  const chartHeight = 120
  const gap = 12
  const containerHeight = 160

  return (
    <div className="flex items-center gap-5" style={{ height: containerHeight }}>
      <div className="relative flex items-end" style={{ width: barWidth * data.length + gap * (data.length - 1) + 40, height: containerHeight }}>
        <svg width="100%" height="100%" className="flex-shrink-0 relative" style={{ overflow: 'visible' }}>
          {data.map((item, index) => {
            const barHeight = (item.value / maxValue) * chartHeight
            const x = index * (barWidth + gap) + 20
            const y = containerHeight - 20 - barHeight

            return (
              <g key={item.label}>
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill={item.color}
                  rx={4}
                  style={{ filter: 'drop-shadow(0 0 6px ' + item.color + '50)' }}
                />
                {/* Value on top */}
                <text
                  x={x + barWidth / 2}
                  y={y - 5}
                  textAnchor="middle"
                  className="text-xs font-bold"
                  style={{ fill: 'var(--text-primary)' }}
                >
                  {item.value}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="space-y-2">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-sm flex-shrink-0"
              style={{
                backgroundColor: item.color,
                boxShadow: '0 0 8px ' + item.color + '50',
              }}
            />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
})

// Memoized Chart Container with toggle button
interface ChartWithToggleProps {
  data: ChartData[]
}

export const ChartWithToggle = memo(function ChartWithToggle({ data }: ChartWithToggleProps) {
  const [chartType, setChartType] = useState<'pie' | 'bar'>('pie')

  return (
    <div className="flex flex-col items-center gap-3">
      {chartType === 'pie' ? <PieChart data={data} /> : <BarChart data={data} />}
      <button
        onClick={() => setChartType(chartType === 'pie' ? 'bar' : 'pie')}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all duration-75 active:scale-90"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          color: 'var(--text-secondary)',
          cursor: 'pointer'
        }}
        aria-label={`Switch to ${chartType === 'pie' ? 'bar' : 'pie'} chart`}
      >
        {chartType === 'pie' ? (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Bar Chart
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
            </svg>
            Pie Chart
          </>
        )}
      </button>
    </div>
  )
})
