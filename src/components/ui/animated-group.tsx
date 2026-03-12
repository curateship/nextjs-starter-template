'use client';
import { ReactNode, useState, useEffect, useRef } from 'react';
import React from 'react';
import { useAnimationSettings, getOptimizedAnimationSettings } from '@/contexts/animation-context';
import type { AnimationSettings } from '@/lib/actions/sites/site-actions';

let MotionGroupComponent: React.ComponentType<any> | null = null;
let motionGroupPromise: Promise<any> | null = null;

function loadMotionGroup() {
  if (!motionGroupPromise) {
    motionGroupPromise = import('./motion-group').then(m => {
      MotionGroupComponent = m.MotionGroup;
    });
  }
  return motionGroupPromise;
}

export type PresetType =
  | 'fade'
  | 'slide'
  | 'scale'
  | 'blur'
  | 'blur-slide';

export type AnimatedGroupProps = {
  children: ReactNode;
  className?: string;
  variants?: {
    container?: Record<string, any>;
    item?: Record<string, any>;
  };
  preset?: PresetType;
  as?: string;
  asChild?: string;
  forceEnabled?: boolean;
  customSettings?: Partial<AnimationSettings>;
  useIntersectionObserver?: boolean;
};

function StaticWrapper({ children, className, as = 'div' }: { children: ReactNode, className?: string, as?: string }) {
  const Component = as as keyof React.JSX.IntrinsicElements;
  return <Component className={className}>{children}</Component>;
}

function AnimatedGroup({
  children,
  className,
  variants,
  preset,
  as = 'div',
  asChild = 'div',
  forceEnabled = false,
  customSettings,
}: AnimatedGroupProps) {
  const { settings, isEnabled } = useAnimationSettings();
  const hasBeenVisible = useRef(false);
  const [motionReady, setMotionReady] = useState(false);

  const effectiveSettings = customSettings
    ? { ...settings, ...customSettings }
    : settings;

  const optimizedSettings = getOptimizedAnimationSettings(effectiveSettings);
  const shouldAnimate = forceEnabled || isEnabled;

  // Preload motion library if animations are enabled, but don't trigger re-render
  useEffect(() => {
    if (shouldAnimate) {
      loadMotionGroup();
    }
  }, [shouldAnimate]);

  // Only use MotionGroup for elements that haven't been shown yet
  // (i.e., below-fold content that becomes visible via scroll)
  useEffect(() => {
    // Mark as "has been visible" on first render — prevents swap flicker
    hasBeenVisible.current = true;
  }, []);

  // For already-visible content, always use StaticWrapper (no remount flicker)
  if (!shouldAnimate || hasBeenVisible.current) {
    return <StaticWrapper className={className} as={as}>{children}</StaticWrapper>;
  }

  // This path is only reached on the very first render if shouldAnimate
  // and MotionGroup was already cached from a previous page
  if (MotionGroupComponent) {
    return (
      <MotionGroupComponent
        className={className}
        variants={variants}
        preset={preset}
        as={as}
        asChild={asChild}
        optimizedSettings={optimizedSettings}
        skipInitialAnimation
      >
        {children}
      </MotionGroupComponent>
    );
  }

  return <StaticWrapper className={className} as={as}>{children}</StaticWrapper>;
}

export { AnimatedGroup };
