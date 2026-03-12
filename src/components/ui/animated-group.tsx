'use client';
import { ReactNode, useState, useEffect } from 'react';
import React from 'react';
import { useAnimationSettings, getOptimizedAnimationSettings } from '@/contexts/animation-context';
import type { AnimationSettings } from '@/lib/actions/sites/site-actions';

let MotionGroupComponent: React.ComponentType<any> | null = null;
let motionGroupPromise: Promise<any> | null = null;

function useMotionGroup() {
  const [loaded, setLoaded] = useState(!!MotionGroupComponent);

  useEffect(() => {
    if (MotionGroupComponent) { setLoaded(true); return; }
    if (!motionGroupPromise) {
      motionGroupPromise = import('./motion-group').then(m => {
        MotionGroupComponent = m.MotionGroup;
      });
    }
    motionGroupPromise.then(() => setLoaded(true));
  }, []);

  return loaded ? MotionGroupComponent : null;
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

  const effectiveSettings = customSettings
    ? { ...settings, ...customSettings }
    : settings;

  const optimizedSettings = getOptimizedAnimationSettings(effectiveSettings);
  const shouldAnimate = forceEnabled || isEnabled;

  const MotionGroup = useMotionGroup();

  if (!shouldAnimate || !MotionGroup) {
    return <StaticWrapper className={className} as={as}>{children}</StaticWrapper>;
  }

  return (
    <MotionGroup
      className={className}
      variants={variants}
      preset={preset}
      as={as}
      asChild={asChild}
      optimizedSettings={optimizedSettings}
    >
      {children}
    </MotionGroup>
  );
}

export { AnimatedGroup };
