"use client";

import React from "react";
import { Key, ArrowRight, Download, ExternalLink, Star, Rocket, Github, Zap } from "lucide-react";
import DotPattern from "@/components/ui/dot-pattern";
import Image from "next/image";
import { AnimatedGroup } from "@/components/ui/animated-group";
import { cn } from "@/lib/utils/tailwind-class-merger";
import Link from "next/link";
import { TrustedByAvatars } from "@/components/ui/trusted-by-avatars";
import type { HeroStyleRendererProps } from "./index";

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

// Gradient overlay component for blending background pattern into page background
const GradientOverlays = () => (
  <>
    <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-background via-background/80 via-background/40 to-transparent pointer-events-none" />
    <div className="absolute bottom-0 left-0 right-0 h-64 bg-gradient-to-t from-background via-background/80 via-background/40 to-transparent pointer-events-none" />
    <div className="absolute top-0 left-0 bottom-0 w-8 bg-gradient-to-r from-background to-transparent pointer-events-none" />
    <div className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-background to-transparent pointer-events-none" />
  </>
);

// Helper function to get icon component based on string value
const getButtonIcon = (iconName?: string) => {
  const iconClass = "w-4 h-4 mr-2";
  switch (iconName) {
    case 'github': return <Github className={iconClass} />;
    case 'arrow-right': return <ArrowRight className={iconClass} />;
    case 'download': return <Download className={iconClass} />;
    case 'external-link': return <ExternalLink className={iconClass} />;
    case 'star': return <Star className={iconClass} />;
    case 'rocket': return <Rocket className={iconClass} />;
    case 'zap': return <Zap className={iconClass} />;
    case 'none': return null;
    default: return <Key className={iconClass} />;
  }
};

// Rainbow gradient button component
const RainbowButton = ({ rainbowButtonLink, buttonText, buttonIcon }: { rainbowButtonLink?: string; buttonText?: string; buttonIcon?: string }) => (
  <button
    className="group relative inline-flex h-11 cursor-pointer items-center justify-center rounded-3xl border-0 bg-[length:200%] px-8 py-2 font-medium text-black dark:text-white transition-colors [background-clip:padding-box,border-box,border-box] [background-origin:border-box] [border:calc(0.08*1rem)_solid_transparent]
      focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50
      before:absolute before:bottom-[-20%] before:left-1/2 before:z-0 before:h-1/5 before:w-3/5 before:-translate-x-1/2 before:animate-[rainbow_3s_linear_infinite] before:bg-[linear-gradient(90deg,var(--color-1),var(--color-2),var(--color-3),var(--color-4),var(--color-5))] before:bg-[length:200%] before:[filter:blur(12px)]
      bg-white dark:bg-black"
    style={{
      ['--color-1' as any]: 'hsl(210, 100%, 60%)',
      ['--color-2' as any]: 'hsl(280, 80%, 65%)',
      ['--color-3' as any]: 'hsl(330, 100%, 65%)',
      ['--color-4' as any]: 'hsl(20, 100%, 60%)',
      ['--color-5' as any]: 'hsl(140, 70%, 50%)',
    }}
  >
    <Link
      href={rainbowButtonLink || "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex border px-3 py-2 rounded-2xl items-center text-black dark:text-white font-medium"
    >
      {getButtonIcon(buttonIcon)}
      {buttonText || "Get Access to Everything"}
    </Link>
  </button>
);

// Social proof section component
const SocialProof = ({ trustedByText, trustedByAvatars }: { trustedByText?: string; trustedByAvatars?: Array<{ src: string; alt: string; fallback: string }> }) => (
  <div className="mt-8 flex justify-center">
    <TrustedByAvatars badgeText={trustedByText} avatars={trustedByAvatars} />
  </div>
);

// Hero Image component
const HeroImage = ({ heroImage }: { heroImage?: string }) => {
  if (!heroImage) return null;

  return (
    <div className="max-w-6xl mx-auto">
      <AnimatedGroup customSettings={{ stagger: 0.05, duration: 1.2 }}>
        <div className="overflow-hidden md:px-6 sm:mt-8">
          <div
            aria-hidden
            className="bg-linear-to-b to-background absolute inset-0 z-10 from-transparent from-35%"
          />
          <div className="inset-shadow-2xs ring-background dark:inset-shadow-white/20 bg-background overflow-hidden rounded-2xl border shadow-lg shadow-zinc-950/15 ring-1">
            <Image
              className="bg-background relative h-auto w-full rounded-2xl object-cover"
              src={heroImage}
              alt="app screen"
              width={1100}
              height={675}
              style={{ width: '100%', height: 'auto' }}
              priority
            />
          </div>
        </div>
      </AnimatedGroup>
      <div className="bg-linear-to-t absolute bottom-0 h-2/3 w-full from-white to-transparent" />
    </div>
  );
};

export const DefaultHeroRenderer = ({ config, sharedContent, children }: HeroStyleRendererProps) => {
  const {
    heroImage,
    rainbowButtonText,
    rainbowButtonIcon,
    githubLink,
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
        <div
          className="absolute top-0 left-0 right-0 h-24 bg-background pointer-events-none"
          style={{ opacity: 1, zIndex: 1 }}
        />
      </div>

      {/* Content layer above background */}
      <div className="relative z-10 w-full flex flex-col items-center">
        <AnimatedGroup customSettings={{ stagger: 0.2 }}>
          <div className="relative z-10 text-center max-w-3xl space-y-6">
            {rainbowButtonText && (
              <RainbowButton
                rainbowButtonLink={githubLink}
                buttonText={rainbowButtonText}
                buttonIcon={rainbowButtonIcon}
              />
            )}
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
