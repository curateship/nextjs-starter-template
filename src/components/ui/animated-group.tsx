'use client';
import { ReactNode } from 'react';
import dynamic from 'next/dynamic';
import React from 'react';
import { useAnimationSettings, getOptimizedAnimationSettings } from '@/contexts/animation-context';
import type { AnimationSettings } from '@/lib/actions/sites/site-actions';

const MotionGroup = dynamic(
  () => import('./motion-group').then(m => m.MotionGroup),
  { ssr: false }
);

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

  if (!shouldAnimate) {
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
