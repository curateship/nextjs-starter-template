'use client';
import { ReactNode } from 'react';
import { motion, Variants } from 'motion/react';
import React from 'react';
import type { AnimationSettings } from '@/lib/actions/sites/site-actions';

export type PresetType =
  | 'fade'
  | 'slide'
  | 'scale'
  | 'blur'
  | 'blur-slide';

const defaultItemVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

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

interface MotionGroupProps {
  children: ReactNode;
  className?: string;
  variants?: {
    container?: Variants;
    item?: Variants;
  };
  preset?: PresetType;
  as?: string;
  asChild?: string;
  optimizedSettings: AnimationSettings;
  skipInitialAnimation?: boolean;
}

export function MotionGroup({
  children,
  className,
  variants,
  preset,
  as = 'div',
  asChild = 'div',
  optimizedSettings,
  skipInitialAnimation = false,
}: MotionGroupProps) {
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

  return (
    <motion.div
      initial={skipInitialAnimation ? "visible" : "hidden"}
      animate="visible"
      variants={containerVariants}
      className={className}
    >
      {React.Children.map(children, (child, index) => (
        <motion.div
          key={index}
          variants={itemVariants}
          style={{ pointerEvents: 'auto' }}
        >
          {child}
        </motion.div>
      ))}
    </motion.div>
  );
}
