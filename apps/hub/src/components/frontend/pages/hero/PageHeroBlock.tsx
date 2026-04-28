"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { HERO_STYLE_RENDERERS } from ".";

// Fields that were previously at the content root before the styleConfig migration
const LEGACY_STYLE_FIELDS = [
  'heroImage', 'showHeroImage', 'showRainbowButton',
  'rainbowButtonText', 'rainbowButtonIcon', 'githubLink',
  'showParticles', 'trustedByText', 'trustedByCount',
  'trustedByAvatars', 'backgroundPattern', 'backgroundPatternSize',
  'backgroundPatternOpacity', 'backgroundColor', 'backgroundCustomColor',
  'backgroundMutedShade', 'showTrustedByBadge', 'extendBackgroundUnderNavigation',
] as const;

interface EmailFormConfig {
  enabled?: boolean;
  formId?: string;
  apiEndpoint?: string;
  placeholder?: string;
  buttonText?: string;
  successMessage?: string;
  layout?: 'inline' | 'stacked';
}

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
  siteWidth?: string;
  customWidth?: number;
  emailForm?: EmailFormConfig;
  visibility?: Record<string, boolean>;
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
  backgroundColor?: string;
  backgroundCustomColor?: string;
  backgroundMutedShade?: number;
  extendBackgroundUnderNavigation?: boolean;
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
    <h1 className="text-4xl md:text-6xl lg:text-7xl !font-bold py-2 md:py-5 leading-none tracking-tight">
      {title}
    </h1>
  );
};

// Hero subtitle component
const HeroSubtitle = ({ subtitle, alignment }: { subtitle?: string; alignment?: string }) => {
  if (!subtitle || !subtitle.trim()) return null;
  return (
    <p className={`text-lg text-muted-foreground max-w-xl ${alignment === 'left' ? 'mr-auto' : alignment === 'right' ? 'ml-auto' : 'mx-auto'}`}>
      {subtitle}
    </p>
  );
};

// Call-to-action buttons component
const CTAButtons = ({ primaryButton, secondaryButton, primaryButtonLink, secondaryButtonLink, alignment }: { primaryButton?: string | any; secondaryButton?: string | any; primaryButtonLink?: string; secondaryButtonLink?: string; alignment?: string }) => {
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
    <div className={`mt-8 flex gap-4 flex-wrap ${alignment === 'left' ? 'justify-start' : alignment === 'right' ? 'justify-end' : 'justify-center'}`}>
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

// Email subscription form component
const EmailSubscriptionForm = ({ config, alignment }: { config: EmailFormConfig; alignment?: string }) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const placeholder = config.placeholder || 'Enter your email address';
  const buttonText = config.buttonText || 'Subscribe';
  const successMessage = config.successMessage || 'Thanks for subscribing!';
  const layout = config.layout || 'inline';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setStatus('loading');
    try {
      if (config.apiEndpoint) {
        const res = await fetch(config.apiEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, formId: config.formId }),
        });
        if (!res.ok) throw new Error('Subscription failed');
      }
      setStatus('success');
      setMessage(successMessage);
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('Something went wrong. Please try again.');
    }
  };

  if (status === 'success') {
    return (
      <div className={`mt-6 ${alignment === 'left' ? 'text-left' : alignment === 'right' ? 'text-right' : 'text-center'}`}>
        <p className="text-sm text-green-600 dark:text-green-400 font-medium">{message}</p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={`mt-6 w-full max-w-lg ${alignment === 'left' ? 'mr-auto' : alignment === 'right' ? 'ml-auto' : 'mx-auto'}`}
    >
      <div className={layout === 'inline' ? 'flex gap-2' : 'flex flex-col gap-2'}>
        <Input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={placeholder}
          required
          className="flex-1 h-11 text-base px-4"
        />
        <Button type="submit" disabled={status === 'loading'} className="h-11 text-base px-6">
          {status === 'loading' ? 'Sending...' : buttonText}
        </Button>
      </div>
      {status === 'error' && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-2">{message}</p>
      )}
    </form>
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
    siteWidth,
    customWidth,
    emailForm,
    visibility,
  } = props;

  // Resolve the style config: prefer styleConfig[heroStyle], fall back to legacy root-level fields
  let resolvedConfig: Record<string, any>;
  if (styleConfig && styleConfig[heroStyle]) {
    resolvedConfig = { ...styleConfig[heroStyle] };
  } else {
    // Legacy fallback: pull style fields from the root props
    resolvedConfig = {};
    LEGACY_STYLE_FIELDS.forEach(field => {
      if (props[field] !== undefined) {
        resolvedConfig[field] = props[field];
      }
    });
  }

  // Default contentMaxWidth to the site-level width if not explicitly set
  if (resolvedConfig.contentMaxWidth === undefined && customWidth) {
    resolvedConfig.contentMaxWidth = customWidth;
  }

  const StyleRenderer = HERO_STYLE_RENDERERS[heroStyle] || HERO_STYLE_RENDERERS.default;
  const alignment = resolvedConfig.alignment || 'center';

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
    <section className="relative w-full flex flex-col items-center justify-center -mt-[var(--site-page-start-offset,0px)] pt-[calc(var(--site-page-start-offset,0px)_+_1.5rem)] md:pt-[calc(var(--site-page-start-offset,0px)_+_3rem)] pb-4 md:pb-10 overflow-hidden">
      <StyleRenderer config={resolvedConfig} sharedContent={sharedContent}>
        {visibility?.title !== false && <HeroTitle title={title} />}
        {visibility?.subtitle !== false && <HeroSubtitle subtitle={subtitle} alignment={alignment} />}
        {visibility?.ctaButtons !== false && (
          <CTAButtons
            primaryButton={primaryButton}
            secondaryButton={secondaryButton}
            primaryButtonLink={primaryButtonLink}
            secondaryButtonLink={secondaryButtonLink}
            alignment={alignment}
          />
        )}
        {visibility?.emailForm !== false && emailForm?.enabled && (
          <EmailSubscriptionForm config={emailForm} alignment={alignment} />
        )}
      </StyleRenderer>
    </section>
  );
};

export { PageHeroBlock };
