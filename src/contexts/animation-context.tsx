"use client"

import { createContext, useContext, ReactNode } from 'react'
import type { AnimationSettings } from '@/lib/actions/sites/site-actions'

interface AnimationContextType {
  settings: AnimationSettings
  isEnabled: boolean
  shouldRespectReducedMotion: boolean
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined)

interface AnimationProviderProps {
  children: ReactNode
  settings: AnimationSettings
}

export function AnimationProvider({ children, settings }: AnimationProviderProps) {
  // Check if user prefers reduced motion
  const shouldRespectReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false

  // Animation is enabled only if:
  // 1. Settings have it enabled
  // 2. User doesn't prefer reduced motion (accessibility)
  const isEnabled = settings.enabled && !shouldRespectReducedMotion

  const value: AnimationContextType = {
    settings,
    isEnabled,
    shouldRespectReducedMotion,
  }

  return (
    <AnimationContext.Provider value={value}>
      {children}
    </AnimationContext.Provider>
  )
}

export function useAnimationSettings(): AnimationContextType {
  const context = useContext(AnimationContext)
  
  if (context === undefined) {
    // Return safe defaults if no provider is found
    return {
      settings: {
        enabled: false,
        preset: 'fade',
        duration: 0.6,
        stagger: 0.1,
        intensity: 'medium'
      },
      isEnabled: false,
      shouldRespectReducedMotion: false,
    }
  }
  
  return context
}

// Performance-optimized animation settings based on device capabilities
export function getOptimizedAnimationSettings(settings: AnimationSettings): AnimationSettings {
  if (typeof window === 'undefined') {
    return settings
  }

  // Detect low-powered devices
  const isLowPoweredDevice = 
    // Low memory device
    (navigator as any).deviceMemory && (navigator as any).deviceMemory <= 4 ||
    // Slow connection
    (navigator as any).connection?.effectiveType === 'slow-2g' ||
    (navigator as any).connection?.effectiveType === '2g' ||
    // Mobile device with potential performance constraints
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

  if (isLowPoweredDevice && settings.enabled) {
    // Reduce animation complexity for low-powered devices
    return {
      ...settings,
      duration: Math.min(settings.duration, 0.4), // Faster animations
      stagger: Math.min(settings.stagger, 0.05), // Less stagger
      intensity: 'low', // Force low intensity
      preset: ['fade', 'slide'].includes(settings.preset) ? settings.preset : 'fade' // Use simple presets only
    }
  }

  return settings
}