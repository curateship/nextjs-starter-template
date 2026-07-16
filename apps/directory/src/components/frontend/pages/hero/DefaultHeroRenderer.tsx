"use client";

import React from "react";
import DotPattern from "@/components/ui/dot-pattern";
import { cn } from "@/lib/utils/tailwind";
import { TrustedByAvatars } from "@/components/ui/trusted-by-avatars";
import type { HeroStyleRendererProps } from ".";
import { getHeroBackgroundColor } from "@/lib/utils/page-hero-background";

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
    return typeof opacity === 'number' ? opacity / 100 : 0.8;
  };

  const patternSize = getPatternSize(size);
  const patternOpacity = getPatternOpacity(opacity);
  const patternColor = color || '#94a3b8';

  if (pattern === 'grid') {
    return (
      <svg
        className={cn(
          "pointer-events-none absolute inset-0 h-full w-full",
          "mask-[radial-gradient(60vw_circle_at_center,white,transparent)]"
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
        "mask-[radial-gradient(60vw_circle_at_center,white,transparent)]"
      )}
      {...patternSize}
      style={{
        opacity: patternOpacity,
        fill: patternColor
      }}
    />
  );
};

// Gradient overlay component for blending background pattern into page background
const GradientOverlays = ({ backgroundColor }: { backgroundColor: string }) => (
  <>
    <div
      className="pointer-events-none absolute left-0 right-0 top-0 h-64"
      style={{ background: `linear-gradient(to bottom, ${backgroundColor}, transparent)` }}
    />
    <div
      className="pointer-events-none absolute bottom-0 left-0 right-0 h-64"
      style={{ background: `linear-gradient(to top, ${backgroundColor}, transparent)` }}
    />
    <div
      className="pointer-events-none absolute bottom-0 left-0 top-0 w-8"
      style={{ background: `linear-gradient(to right, ${backgroundColor}, transparent)` }}
    />
    <div
      className="pointer-events-none absolute bottom-0 right-0 top-0 w-8"
      style={{ background: `linear-gradient(to left, ${backgroundColor}, transparent)` }}
    />
  </>
);

// Social proof section component
const SocialProof = ({ trustedByText, trustedByAvatars, alignment }: { trustedByText?: string; trustedByAvatars?: Array<{ src: string; alt: string; fallback: string }>; alignment?: string }) => (
  <div className={cn("mt-8 flex", alignment === 'left' ? 'justify-start *:mx-0 *:mr-auto' : alignment === 'right' ? 'justify-end *:mx-0 *:ml-auto' : 'justify-center')}>
    <TrustedByAvatars badgeText={trustedByText} avatars={trustedByAvatars} />
  </div>
);

// Hero image column component
const HeroImageColumn = ({ heroImage, heroImageAlign = 'right', heroImageSize, hideMobile }: { heroImage?: string; heroImageAlign?: string; heroImageSize?: number; hideMobile?: boolean }) => {
  if (!heroImage) return null;

  const imageFirst = heroImageAlign === 'left';
  const mobileClass = hideMobile ? 'hidden md:flex' : 'flex';

  return (
    <div
      className={cn("relative z-10 w-full justify-center pointer-events-none md:ml-auto md:w-[var(--hero-image-width)] md:self-start md:justify-end", imageFirst && "md:order-first", mobileClass)}
      style={{
        '--hero-image-width': heroImageSize ? `${heroImageSize}px` : 'min(45vw, 680px)',
      } as React.CSSProperties}
    >
      <img
        className="block h-auto w-full object-contain"
        src={heroImage}
        alt=""
        fetchPriority="high"
      />
    </div>
  );
};

export const DefaultHeroRenderer = ({ config, visibility, children }: HeroStyleRendererProps) => {
  const {
    heroImage,
    trustedByText,
    trustedByAvatars,
    backgroundColor,
    backgroundCustomColor,
    backgroundMutedShade,
    backgroundPattern,
    backgroundPatternSize,
    backgroundPatternOpacity,
    alignment = 'center',
    contentWidth = 'full',
    contentMaxWidth = 1152,
    heroImageAlign = 'right',
    heroImageSize,
    heroImageHideMobile,
  } = config;

  const alignItems = alignment === 'left' ? 'items-start' : alignment === 'right' ? 'items-end' : 'items-center';
  const textAlign = alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center';
  const contentJustify = alignment === 'left' ? 'justify-self-start' : alignment === 'right' ? 'justify-self-end' : 'justify-self-center';
  const isFixedWidth = contentWidth === 'fixed';
  const heroBackgroundColor = getHeroBackgroundColor(backgroundColor, backgroundCustomColor, backgroundMutedShade);
  const showHeroImage = visibility?.heroImage !== false && Boolean(heroImage);
  const heroGridColumns = heroImageAlign === 'left'
    ? 'md:grid-cols-[auto_minmax(0,1fr)]'
    : 'md:grid-cols-[minmax(0,1fr)_auto]';

  return (
    <>
      {/* Background layer with pattern and gradient overlays */}
      <div className="absolute inset-0 z-0" style={{ backgroundColor: heroBackgroundColor }}>
        <BackgroundPattern
          pattern={visibility?.backgroundPattern === false ? 'none' : backgroundPattern ?? 'none'}
          size={backgroundPatternSize ?? 'medium'}
          opacity={backgroundPatternOpacity ?? 80}
        />
        <GradientOverlays backgroundColor={heroBackgroundColor} />
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 h-24"
          style={{ backgroundColor: heroBackgroundColor, opacity: 1, zIndex: 1 }}
        />
      </div>

      {/* Content layer above background */}
      <div
        className={cn(
          "relative z-10 w-full",
          !showHeroImage && "flex flex-col",
          !showHeroImage && alignItems,
          isFixedWidth && "mx-auto px-6"
        )}
        style={isFixedWidth ? { maxWidth: `${contentMaxWidth}px` } : undefined}
      >
        <div className={cn(showHeroImage && "grid w-full items-start gap-8 lg:gap-10", showHeroImage && heroGridColumns)}>
          <div className={cn("relative z-10 w-full space-y-6", !showHeroImage && "max-w-3xl", textAlign, showHeroImage && contentJustify, heroImageAlign === 'left' && "md:order-last")}>
            {/* Shared content (title, subtitle, CTAs) injected by orchestrator */}
            {children}
            {visibility?.trustedByBadges !== false && trustedByAvatars && trustedByAvatars.length > 0 && (
              <SocialProof trustedByText={trustedByText} trustedByAvatars={trustedByAvatars} alignment={alignment} />
            )}
          </div>
          {showHeroImage && (
            <HeroImageColumn heroImage={heroImage} heroImageAlign={heroImageAlign} heroImageSize={heroImageSize} hideMobile={heroImageHideMobile} />
          )}
        </div>
      </div>
    </>
  );
};
