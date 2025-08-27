'use client';
import { ReactNode, lazy, Suspense } from 'react';
import { motion, Variants } from 'motion/react';
import React from 'react';
import { useAnimationSettings, getOptimizedAnimationSettings } from '@/contexts/animation-context';
import type { AnimationSettings } from '@/lib/actions/sites/site-actions';

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
    container?: Variants;
    item?: Variants;
  };
  preset?: PresetType;
  as?: string;
  asChild?: string;
  // Override global settings for specific use cases
  forceEnabled?: boolean;
  customSettings?: Partial<AnimationSettings>;
  // Performance optimization
  useIntersectionObserver?: boolean;
};

const defaultContainerVariants: Variants = {
  visible: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const defaultItemVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

// Intensity-based animation variants
const getPresetVariants = (intensity: 'low' | 'medium' | 'high'): Record<PresetType, Variants> => {
  const intensityMultiplier = {
    low: 0.5,
    medium: 1,
    high: 1.8
  }[intensity];

  return {
    fade: {},
    slide: {
      hidden: { y: 12 * intensityMultiplier },
      visible: { y: 0 },
    },
    scale: {
      hidden: { scale: 1 - (0.2 * intensityMultiplier) },
      visible: { scale: 1 },
    },
    blur: {
      hidden: { filter: `blur(${2 * intensityMultiplier}px)` },
      visible: { filter: 'blur(0px)' },
    },
    'blur-slide': {
      hidden: { 
        filter: `blur(${2 * intensityMultiplier}px)`, 
        y: 12 * intensityMultiplier 
      },
      visible: { filter: 'blur(0px)', y: 0 },
    },
  };
};

const addDefaultVariants = (variants: Variants) => ({
  hidden: { ...defaultItemVariants.hidden, ...variants.hidden },
  visible: { ...defaultItemVariants.visible, ...variants.visible },
});

// Static wrapper for when animations are disabled
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
  useIntersectionObserver = true,
}: AnimatedGroupProps) {
  const { settings, isEnabled } = useAnimationSettings();
  
  // Merge custom settings with global settings
  const effectiveSettings = customSettings 
    ? { ...settings, ...customSettings }
    : settings;

  // Get optimized settings for device performance
  const optimizedSettings = getOptimizedAnimationSettings(effectiveSettings);
  
  // Final decision on whether to animate
  const shouldAnimate = forceEnabled || isEnabled;

  // If animations are disabled, return static wrapper
  if (!shouldAnimate) {
    return <StaticWrapper className={className} as={as}>{children}</StaticWrapper>;
  }

  // Get variants based on optimized settings
  const presetVariants = getPresetVariants(optimizedSettings.intensity);
  const effectivePreset = preset || optimizedSettings.preset;
  
  const containerVariants: Variants = variants?.container || {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: optimizedSettings.stagger,
      },
    },
  };

  const itemVariants: Variants = variants?.item || addDefaultVariants(
    presetVariants[effectivePreset as PresetType] || presetVariants.fade
  );

  // Add duration to all item transitions
  if (itemVariants.visible && typeof itemVariants.visible === 'object') {
    itemVariants.visible = {
      ...itemVariants.visible,
      transition: {
        duration: optimizedSettings.duration,
        ease: 'easeOut',
        ...(itemVariants.visible.transition || {}),
      },
    };
  }

  const MotionComponent = motion.div;
  const MotionChild = motion.div;

  return (
    <MotionComponent
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className={className}
      {...(as !== 'div' && { as })}
    >
      {React.Children.map(children, (child, index) => (
        <MotionChild 
          key={index} 
          variants={itemVariants}
          style={{ pointerEvents: 'auto' }}
          {...(asChild !== 'div' && { as: asChild })}
        >
          {child}
        </MotionChild>
      ))}
    </MotionComponent>
  );
}

export { AnimatedGroup };
