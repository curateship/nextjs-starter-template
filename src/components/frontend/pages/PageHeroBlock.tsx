"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { HERO_STYLE_RENDERERS } from "./hero-styles";

// Fields that were previously at the content root before the styleConfig migration
const LEGACY_STYLE_FIELDS = [
  'heroImage', 'showHeroImage', 'showRainbowButton',
  'rainbowButtonText', 'rainbowButtonIcon', 'githubLink',
  'showParticles', 'trustedByText', 'trustedByCount',
  'trustedByAvatars', 'backgroundPattern', 'backgroundPatternSize',
  'backgroundPatternOpacity', 'showTrustedByBadge',
] as const;

interface PageHeroBlockProps {
  className?: string;
  title?: string;
  subtitle?: string;
  primaryButton?: string;
  secondaryButton?: string;
  primaryButtonLink?: string;
  secondaryButtonLink?: string;
  primaryButtonStyle?: string;
  secondaryButtonStyle?: string;
  heroStyle?: string;
  styleConfig?: Record<string, Record<string, any>>;
  // Legacy fields (for migration fallback)
  rainbowButtonText?: string;
  rainbowButtonIcon?: string;
  rainbowButtonLink?: string;
  trustedByText?: string;
  trustedByCount?: string;
  trustedByAvatars?: Array<{ src: string; alt: string; fallback: string }>;
  backgroundPattern?: string;
  backgroundPatternSize?: string;
  backgroundPatternOpacity?: number;
  heroImage?: string;
  githubLink?: string;
  showHeroImage?: boolean;
  showRainbowButton?: boolean;
  showParticles?: boolean;
  showTrustedByBadge?: boolean;
  [key: string]: any;
}

// Hero title component
const HeroTitle = ({ title }: { title?: string }) => {
  if (!title || !title.trim()) return null;
  return (
    <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold py-2 md:py-5 leading-none tracking-tight">
      {title}
    </h1>
  );
};

// Hero subtitle component
const HeroSubtitle = ({ subtitle }: { subtitle?: string }) => {
  if (!subtitle || !subtitle.trim()) return null;
  return (
    <p className="text-lg text-muted-foreground max-w-xl mx-auto">
      {subtitle}
    </p>
  );
};

// Call-to-action buttons component
const CTAButtons = ({ primaryButton, secondaryButton, primaryButtonLink, secondaryButtonLink }: { primaryButton?: string | any; secondaryButton?: string | any; primaryButtonLink?: string; secondaryButtonLink?: string }) => {
  const getPrimaryButtonText = () => {
    if (typeof primaryButton === 'string') return primaryButton;
    if (typeof primaryButton === 'object' && primaryButton?.text) return primaryButton.text;
    return "Get Started";
  };

  const getSecondaryButtonText = () => {
    if (typeof secondaryButton === 'string') return secondaryButton;
    if (typeof secondaryButton === 'object' && secondaryButton?.text) return secondaryButton.text;
    return "Browse Components";
  };

  const getPrimaryButtonLink = () => {
    if (primaryButtonLink) return primaryButtonLink;
    if (typeof primaryButton === 'object' && primaryButton?.url) return primaryButton.url;
    return '';
  };

  const getSecondaryButtonLink = () => {
    if (secondaryButtonLink) return secondaryButtonLink;
    if (typeof secondaryButton === 'object' && secondaryButton?.url) return secondaryButton.url;
    return '';
  };

  const isValidUrl = (url: string): boolean => {
    if (!url || url.trim() === '') return false;
    try {
      new URL(url);
      return true;
    } catch {
      return url.startsWith('/');
    }
  };

  const primaryLink = getPrimaryButtonLink();
  const secondaryLink = getSecondaryButtonLink();
  const validPrimaryLink = isValidUrl(primaryLink) ? primaryLink : '';
  const validSecondaryLink = isValidUrl(secondaryLink) ? secondaryLink : '';

  if (!validPrimaryLink && !validSecondaryLink) return null;

  return (
    <div className="mt-8 flex justify-center gap-4 flex-wrap">
      {validPrimaryLink && (
        <Link href={validPrimaryLink}>
          <Button size="lg">{getPrimaryButtonText()}</Button>
        </Link>
      )}
      {validSecondaryLink && (
        <Link href={validSecondaryLink}>
          <Button size="lg" variant="outline">
            {getSecondaryButtonText()}
          </Button>
        </Link>
      )}
    </div>
  );
};

const PageHeroBlock = (props: PageHeroBlockProps) => {
  const {
    title,
    subtitle,
    primaryButton,
    secondaryButton,
    primaryButtonLink,
    secondaryButtonLink,
    primaryButtonStyle,
    secondaryButtonStyle,
    heroStyle = 'default',
    styleConfig,
  } = props;

  // Resolve the style config: prefer styleConfig[heroStyle], fall back to legacy root-level fields
  let resolvedConfig: Record<string, any>;
  if (styleConfig && styleConfig[heroStyle]) {
    resolvedConfig = styleConfig[heroStyle];
  } else {
    // Legacy fallback: pull style fields from the root props
    resolvedConfig = {};
    LEGACY_STYLE_FIELDS.forEach(field => {
      if (props[field] !== undefined) {
        resolvedConfig[field] = props[field];
      }
    });
  }

  const StyleRenderer = HERO_STYLE_RENDERERS[heroStyle] || HERO_STYLE_RENDERERS.default;

  const sharedContent = {
    title,
    subtitle,
    primaryButton,
    secondaryButton,
    primaryButtonLink,
    secondaryButtonLink,
    primaryButtonStyle,
    secondaryButtonStyle,
  };

  return (
    <section className="relative w-full flex flex-col items-center justify-center px-6 pt-12 pb-4 md:pb-10 overflow-hidden">
      <StyleRenderer config={resolvedConfig} sharedContent={sharedContent}>
        {/* Shared content rendered by orchestrator, placed by the style renderer */}
        <HeroTitle title={title} />
        <HeroSubtitle subtitle={subtitle} />
        <CTAButtons
          primaryButton={primaryButton}
          secondaryButton={secondaryButton}
          primaryButtonLink={primaryButtonLink}
          secondaryButtonLink={secondaryButtonLink}
        />
      </StyleRenderer>
    </section>
  );
};

export { PageHeroBlock };
