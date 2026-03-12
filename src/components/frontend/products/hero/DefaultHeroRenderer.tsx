"use client";

import React from "react";
import DotPattern from "@/components/ui/dot-pattern";
import Image from "next/image";
import { AnimatedGroup } from "@/components/ui/animated-group";
import { cn } from "@/lib/utils/tailwind-class-merger";
import { GradientOverlays } from "@/components/ui/gradient-overlays";
import { TrustedByAvatars } from "@/components/ui/trusted-by-avatars";
import type { HeroStyleRendererProps } from ".";

// Background Pattern component that supports different pattern types
const BackgroundPattern = ({
  pattern,
  size,
  opacity,
  color
}: {
  pattern?: string;
  size?: string;
  opacity?: number;
  color?: string;
}) => {
  if (pattern === 'none') return null;

  const getPatternSize = (size?: string) => {
    switch (size) {
      case 'small': return { width: 12, height: 12 };
      case 'large': return { width: 24, height: 24 };
      default: return { width: 16, height: 16 };
    }
  };

  const getPatternOpacity = (opacity?: number) => {
    return opacity ? opacity / 100 : 0.8;
  };

  const patternSize = getPatternSize(size);
  const patternOpacity = getPatternOpacity(opacity);
  const patternColor = color || '#94a3b8';

  if (pattern === 'grid') {
    return (
      <svg
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full",
          "[mask-image:radial-gradient(60vw_circle_at_center,white,transparent)]"
        )}
        style={{ opacity: patternOpacity }}
      >
        <defs>
          <pattern
            id="grid-pattern"
            width={patternSize.width}
            height={patternSize.height}
            patternUnits="userSpaceOnUse"
          >
            <path
              d={`M ${patternSize.width} 0 L 0 0 0 ${patternSize.height}`}
              fill="none"
              stroke={patternColor}
              strokeWidth="0.5"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid-pattern)" />
      </svg>
    );
  }

  return (
    <DotPattern
      className={cn(
        "[mask-image:radial-gradient(60vw_circle_at_center,white,transparent)]"
      )}
      {...patternSize}
      style={{
        opacity: patternOpacity,
        fill: patternColor
      }}
    />
  );
};

// Social proof section component
const SocialProof = ({ trustedByText, trustedByAvatars }: { trustedByText?: string; trustedByAvatars?: Array<{ src: string; alt: string; fallback: string }> }) => (
  <div className="mt-8 flex justify-center">
    <TrustedByAvatars badgeText={trustedByText} avatars={trustedByAvatars} />
  </div>
);

// Hero Image component — matches original product styling
const HeroImage = ({ heroImage }: { heroImage?: string }) => {
  if (!heroImage) return null;

  return (
    <div className="w-full max-w-[1100px] mx-auto">
      <AnimatedGroup customSettings={{ stagger: 0.05, duration: 1.2 }}>
        <div className="overflow-hidden sm:mt-8 pb-4 md:pb-8">
          <div className="inset-shadow-2xs ring-background dark:inset-shadow-white/20 bg-background overflow-hidden rounded-2xl border shadow-lg shadow-zinc-950/15">
            <Image
              className="bg-background rounded-2xl w-full h-auto"
              src={heroImage}
              alt="app screen"
              width={1608}
              height={1002}
              priority
              fetchPriority="high"
            />
          </div>
        </div>
      </AnimatedGroup>
    </div>
  );
};

export const DefaultHeroRenderer = ({ config, sharedContent, children }: HeroStyleRendererProps) => {
  const {
    heroImage,
    trustedByText,
    trustedByAvatars,
    backgroundPattern,
    backgroundPatternSize,
    backgroundPatternOpacity,
  } = config;

  return (
    <>
      {/* Background layer with pattern and gradient overlays */}
      <div className="absolute inset-0 z-0">
        <BackgroundPattern
          pattern={backgroundPattern || 'dots'}
          size={backgroundPatternSize || 'medium'}
          opacity={backgroundPatternOpacity || 80}
        />
        <GradientOverlays />
      </div>

      {/* Content layer above background */}
      <div className="relative z-10 w-full flex flex-col items-center">
        <AnimatedGroup customSettings={{ stagger: 0.2 }}>
          <div className="relative z-10 text-center max-w-3xl space-y-6">
            {/* Shared content (title, subtitle, CTAs) injected by orchestrator */}
            {children}
            {trustedByAvatars && trustedByAvatars.length > 0 && (
              <SocialProof trustedByText={trustedByText} trustedByAvatars={trustedByAvatars} />
            )}
          </div>
        </AnimatedGroup>
        <HeroImage heroImage={heroImage} />
      </div>
    </>
  );
};
