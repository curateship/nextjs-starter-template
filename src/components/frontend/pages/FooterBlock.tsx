import { Logo } from '@/components/ui/navigation/logo'
import Link from 'next/link'
import { isSafeUrl } from '@/lib/utils/url-validator'

const SocialIcon = ({ platform, url }: { platform: string; url: string }) => {
    const getSocialIcon = (platform: string) => {
        switch (platform.toLowerCase()) {
            case 'twitter':
                return (
                    <svg className="size-6" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M10.488 14.651L15.25 21h7l-7.858-10.478L20.93 3h-2.65l-5.117 5.886L8.75 3h-7l7.51 10.015L2.32 21h2.65zM16.25 19L5.75 5h2l10.5 14z"></path>
                    </svg>
                )
            case 'linkedin':
                return (
                    <svg className="size-6" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.32 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93zM6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37z"></path>
                    </svg>
                )
            case 'facebook':
                return (
                    <svg className="size-6" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95"></path>
                    </svg>
                )
            case 'instagram':
                return (
                    <svg className="size-6" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M7.8 2h8.4C19.4 2 22 4.6 22 7.8v8.4a5.8 5.8 0 0 1-5.8 5.8H7.8C4.6 22 2 19.4 2 16.2V7.8A5.8 5.8 0 0 1 7.8 2m-.2 2A3.6 3.6 0 0 0 4 7.6v8.8C4 18.39 5.61 20 7.6 20h8.8a3.6 3.6 0 0 0 3.6-3.6V7.6C20 5.61 18.39 4 16.4 4zm9.65 1.5a1.25 1.25 0 0 1 1.25 1.25A1.25 1.25 0 0 1 17.25 8A1.25 1.25 0 0 1 16 6.75a1.25 1.25 0 0 1 1.25-1.25M12 7a5 5 0 0 1 5 5a5 5 0 0 1-5 5a5 5 0 0 1-5-5a5 5 0 0 1 5-5m0 2a3 3 0 0 0-3 3a3 3 0 0 0 3 3a3 3 0 0 0 3-3a3 3 0 0 0-3-3"></path>
                    </svg>
                )
            case 'youtube':
                return (
                    <svg className="size-6" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path>
                    </svg>
                )
            case 'tiktok':
                return (
                    <svg className="size-6" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M16.6 5.82s.51.5 0 0A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6c0-1.72 1.66-3.01 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64c0 3.33 2.76 5.7 5.69 5.7c3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3s-1.88.09-3.24-1.48"></path>
                    </svg>
                )
            case 'github':
                return (
                    <svg className="size-6" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M12 2A10 10 0 0 0 2 12c0 4.42 2.87 8.17 6.84 9.5c.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34c-.46-1.16-1.11-1.47-1.11-1.47c-.91-.62.07-.6.07-.6c1 .07 1.53 1.03 1.53 1.03c.87 1.52 2.34 1.07 2.91.83c.09-.65.35-1.09.63-1.34c-2.22-.25-4.55-1.11-4.55-4.92c0-1.11.38-2 1.03-2.71c-.1-.25-.45-1.29.1-2.64c0 0 .84-.27 2.75 1.02c.79-.22 1.65-.33 2.5-.33c.85 0 1.71.11 2.5.33c1.91-1.29 2.75-1.02 2.75-1.02c.55 1.35.2 2.39.1 2.64c.65.71 1.03 1.6 1.03 2.71c0 3.82-2.34 4.66-4.57 4.91c.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2"></path>
                    </svg>
                )
            default:
                return (
                    <svg className="size-6" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24">
                        <path fill="currentColor" d="M18.364 5.636L16.95 7.05A7 7 0 1 0 19 12h2a9 9 0 1 1-2.636-6.364z"></path>
                    </svg>
                )
        }
    }

    return (
        <Link
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={platform.charAt(0).toUpperCase() + platform.slice(1)}
            className="text-muted-foreground hover:text-primary block"
        >
            {getSocialIcon(platform)}
        </Link>
    )
}

interface FooterBlockProps {
  logo?: string;
  logoUrl?: string;
  site?: {
    id: string;
    subdomain: string;
    name?: string;
  };
  copyright?: string;
  links?: Array<{ text: string; url: string }>;
  socialLinks?: Array<{ platform: string; url: string }>;
  style?: {
    backgroundColor: string;
    textColor: string;
  };
}

const defaultLinks = [
    {
        text: 'Features',
        url: '#',
    },
    {
        text: 'Solution',
        url: '#',
    },
    {
        text: 'Customers',
        url: '#',
    },
    {
        text: 'Pricing',
        url: '#',
    },
    {
        text: 'Help',
        url: '#',
    },
    {
        text: 'About',
        url: '#',
    },
]

export function FooterBlock({ logo, logoUrl, site, copyright, links, socialLinks, style }: FooterBlockProps) {
    const footerLinks = links && links.length > 0 ? links : defaultLinks
    
    // Determine logo URL with smart defaults
    const getLogoUrl = () => {
        // If logoUrl is explicitly set and valid, use it
        if (logoUrl && isSafeUrl(logoUrl)) {
            return logoUrl
        }
        // If site data is available, use root as default
        if (site?.subdomain) {
            return "/"
        }
        // Final fallback to home page
        return "/"
    }
    return (
        <footer 
            className="py-1"
            style={style ? {
                backgroundColor: style.backgroundColor,
                color: style.textColor
            } : undefined}
        >
            <div className="mx-auto max-w-5xl px-6">
                <Link
                    href={getLogoUrl()}
                    aria-label="go home"
                    className="mx-auto block size-fit">
                    {logo && logo !== '/images/logo.png' && isSafeUrl(logo) ? (
                        <img 
                            src={logo} 
                            alt="Logo" 
                            className="h-8 w-auto mx-auto"
                            onError={(e) => {
                                // Fallback to default logo on error
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                            }}
                        />
                    ) : null}
                    <Logo className={logo && logo !== '/images/logo.png' && isSafeUrl(logo) ? 'hidden' : ''} />
                </Link>

                <div className="my-8 flex flex-wrap justify-center gap-6 text-sm">
                    {footerLinks.map((link, index) => (
                        <Link
                            key={index}
                            href={link.url}
                            className="text-muted-foreground hover:text-primary block duration-150">
                            <span>{link.text}</span>
                        </Link>
                    ))}
                </div>
{socialLinks && socialLinks.length > 0 && (
                    <div className="my-8 flex flex-wrap justify-center gap-6 text-sm">
                        {socialLinks.map((social, index) => (
                            <SocialIcon key={index} platform={social.platform} url={social.url} />
                        ))}
                    </div>
                )}
                <span className="text-muted-foreground block text-center text-sm">
                    {copyright || `© ${new Date().getFullYear()} Tailark, All rights reserved`}
                </span>
            </div>
        </footer>
    )
}
