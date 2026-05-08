"use client";

import React from "react";
import Image from "next/image";
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

// Hero Background Image component
const HeroBackgroundImage = ({ heroImage, heroImageAlign = 'center', heroImageSize, isFixedWidth, contentMaxWidth, hideMobile, mobileOpacity }: { heroImage?: string; heroImageAlign?: string; heroImageSize?: number; isFixedWidth?: boolean; contentMaxWidth?: number; hideMobile?: boolean; mobileOpacity?: number }) => {
  if (!heroImage) return null;

  const objectPosition = heroImageAlign === 'left' ? 'left' : heroImageAlign === 'right' ? 'right' : 'center';
  const mobileClass = hideMobile ? 'hidden md:block' : '';
  const mobileOpacityStyle = !hideMobile && mobileOpacity !== undefined && mobileOpacity < 100
    ? { '--hero-img-opacity': mobileOpacity / 100 } as React.CSSProperties
    : undefined;
  const mobileOpacityClass = !hideMobile && mobileOpacity !== undefined && mobileOpacity < 100
    ? 'opacity-[var(--hero-img-opacity)] md:opacity-100'
    : '';

  if (heroImageSize) {
    const horizontalPos = heroImageAlign === 'left' ? 'left-0' : heroImageAlign === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2';
    return (
      <div className={cn("absolute inset-0 z-0 pointer-events-none", mobileClass, mobileOpacityClass)} style={mobileOpacityStyle}>
        <div
          className={cn("absolute inset-0", isFixedWidth && "mx-auto px-6")}
          style={isFixedWidth ? { maxWidth: `${contentMaxWidth}px` } : undefined}
        >
          <div className={cn("absolute top-1/2 -translate-y-1/2 max-md:scale-[0.7]", horizontalPos, heroImageAlign === 'right' ? 'max-md:origin-right' : heroImageAlign === 'left' ? 'max-md:origin-left' : 'max-md:origin-center')} style={{ width: `${heroImageSize}px`, height: `${heroImageSize}px` }}>
            <Image
              className="object-contain"
              src={heroImage}
              alt=""
              fill
              priority
              fetchPriority="high"
              sizes={`${heroImageSize}px`}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("absolute inset-0 z-0 pointer-events-none", mobileClass, mobileOpacityClass)} style={mobileOpacityStyle}>
      <Image
        className="object-cover"
        src={heroImage}
        alt=""
        fill
        priority
        fetchPriority="high"
        sizes="100vw"
        style={{ objectPosition }}
      />
      <div className="absolute inset-0 bg-background/60" />
    </div>
  );
};

export const DefaultHeroRenderer = ({ config, children }: HeroStyleRendererProps) => {
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
    heroImageAlign = 'center',
    heroImageSize,
    heroImageHideMobile,
    heroImageMobileOpacity,
  } = config;

  const alignItems = alignment === 'left' ? 'items-start' : alignment === 'right' ? 'items-end' : 'items-center';
  const textAlign = alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center';
  const isFixedWidth = contentWidth === 'fixed';
  const heroBackgroundColor = getHeroBackgroundColor(backgroundColor, backgroundCustomColor, backgroundMutedShade);

  return (
    <>
      {/* Background layer with pattern and gradient overlays */}
      <div className="absolute inset-0 z-0" style={{ backgroundColor: heroBackgroundColor }}>
        <BackgroundPattern
          pattern={backgroundPattern ?? 'none'}
          size={backgroundPatternSize ?? 'medium'}
          opacity={backgroundPatternOpacity ?? 80}
        />
        <GradientOverlays backgroundColor={heroBackgroundColor} />
        <div
          className="pointer-events-none absolute left-0 right-0 top-0 h-24"
          style={{ backgroundColor: heroBackgroundColor, opacity: 1, zIndex: 1 }}
        />
      </div>

      {/* Background image layer - above pattern */}
      <HeroBackgroundImage heroImage={heroImage} heroImageAlign={heroImageAlign} heroImageSize={heroImageSize} isFixedWidth={isFixedWidth} contentMaxWidth={contentMaxWidth} hideMobile={heroImageHideMobile} mobileOpacity={heroImageMobileOpacity} />

      {/* Content layer above background */}
      <div
        className={cn(
          "relative z-10 w-full flex flex-col",
          alignItems,
          isFixedWidth && "mx-auto px-6"
        )}
        style={isFixedWidth ? { maxWidth: `${contentMaxWidth}px` } : undefined}
      >
        <div className={cn("relative z-10 max-w-3xl space-y-6", textAlign)}>
          {/* Shared content (title, subtitle, CTAs) injected by orchestrator */}
          {children}
          {trustedByAvatars && trustedByAvatars.length > 0 && (
            <SocialProof trustedByText={trustedByText} trustedByAvatars={trustedByAvatars} alignment={alignment} />
          )}
        </div>
      </div>
    </>
  );
};
