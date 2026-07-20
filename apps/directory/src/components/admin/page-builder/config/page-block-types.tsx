import Zap from "lucide-react/dist/esm/icons/zap.js"
import FileText from "lucide-react/dist/esm/icons/file-text.js"
import HelpCircle from "lucide-react/dist/esm/icons/circle-question-mark.js"
import LayoutGrid from "lucide-react/dist/esm/icons/layout-grid.js"
import Minus from "lucide-react/dist/esm/icons/minus.js"
import Code from "lucide-react/dist/esm/icons/code.js"
import Quote from "lucide-react/dist/esm/icons/quote.js"
import LogIn from "lucide-react/dist/esm/icons/log-in.js"
import Tags from "lucide-react/dist/esm/icons/tags.js"
import Search from "lucide-react/dist/esm/icons/search.js"
import Users from "lucide-react/dist/esm/icons/users.js"
import { BlockTypeDefinition, findBlockType, getBlockName as _getBlockName } from "@/lib/utils/block-types"

export type { BlockTypeDefinition }

export const PAGE_BLOCK_TYPES: BlockTypeDefinition[] = [
  {
    type: 'hero',
    name: 'Hero',
    icon: Zap,
    description: 'Eye-catching header section with title, subtitle, and call-to-action',
    defaultContent: {
      title: 'Welcome to Our Site',
      subtitle: 'Your subtitle here',
      primaryButton: 'Get Started',
      primaryButtonLink: '#',
      primaryButtonStyle: 'primary',
      secondaryButton: 'Learn More',
      secondaryButtonLink: '#',
      secondaryButtonStyle: 'outline',
      emailForm: {
        enabled: false,
        placeholder: 'Enter your email address',
        buttonText: 'Subscribe',
        redirectUrl: '',
        followUpFormSlug: '',
        identifier: '',
        layout: 'inline',
      },
      emailTemplateBody: '',
      heroStyle: 'default',
      styleConfig: {
        default: {
          heroImage: '',
          showHeroImage: false,
          rainbowButtonText: '',
          rainbowButtonIcon: 'star',
          rainbowButtonLink: '',
          trustedByText: '',
          trustedByAvatars: [],
          showTrustedByBadge: false,
          backgroundColor: 'muted',
          backgroundCustomColor: '#ffffff',
          backgroundMutedShade: 1,
          extendBackgroundUnderNavigation: false,
          backgroundPattern: 'dots',
          backgroundPatternSize: 'medium',
          backgroundPatternOpacity: 80,
          contentPaddingTop: undefined,
          contentPaddingBottom: undefined,
          showParticles: false,
          githubLink: '',
        }
      }
    }
  },
  {
    type: 'rich-text',
    name: 'Rich Text Editor',
    icon: FileText,
    description: 'Flexible content editor for formatted text, images, and media',
    defaultContent: {
      body: '',
      format: 'html',
      visibility: {},
    }
  },
  {
    type: 'auth',
    name: 'Auth',
    icon: LogIn,
    description: 'Login, registration, and password reset forms',
    defaultContent: {
      defaultTab: 'login',
      loginRedirectPath: '/account',
      registerRedirectPath: '/account',
      emailVerificationEnabled: true,
      loginButtonText: 'Sign In',
      registerButtonText: 'Create Account',
      resetButtonText: 'Send Reset Link',
      loginTitle: 'Welcome back',
      loginDescription: 'Login to your account',
      registerTitle: 'Create an account',
      registerDescription: 'Enter your details to get started',
      resetTitle: 'Reset your password',
      resetDescription: 'Enter your email to receive a reset link',
      visibility: {},
    },
    conflictsWith: ['auth'],
  },
  {
    type: 'faq',
    name: 'FAQ',
    icon: HelpCircle,
    description: 'Frequently asked questions with expandable answers',
    defaultContent: {
      faqItems: [{
        id: `faq-${Date.now()}-1`,
        question: 'Sample Question',
        answer: 'Sample answer goes here...'
      }]
    }
  },
  {
    type: 'listing-views',
    name: 'Listing Views',
    icon: LayoutGrid,
    description: 'Display product or content listings in grid or list format',
    defaultContent: {
      title: 'Product Listings',
      viewType: 'grid',
      listingStyle: 'default',
      imageFit: 'crop',
      saveIconOpacity: 70,
      categoryIds: [],
      categoryChipParentIds: [],
    }
  },
  {
    type: 'categories-listing',
    name: 'Categories Listing',
    icon: Tags,
    description: 'Display child category links from a selected parent category',
    defaultContent: {
      title: 'Browse Categories',
      subtitle: '',
      parentCategoryId: '',
      chipsToShow: 20,
      visibility: {},
    }
  },
  {
    type: 'site-search',
    name: 'Site Search',
    icon: Search,
    description: 'Search public pages, posts, products, listings, events, categories, and profiles',
    defaultContent: {
      title: 'Search',
      subtitle: 'Find anything on this site',
      placeholder: 'Search this site...',
      emptyText: 'Enter a search term to find public content.',
      noResultsText: 'No results found.',
      enabledTypes: ['page', 'post', 'product', 'directory', 'event', 'category', 'profile'],
      pageSize: 12,
      showTypeChips: true,
      showImages: true,
      showSummaries: true,
      visibility: {},
    }
  },
  {
    type: 'member-directory',
    name: 'Member Directory',
    icon: Users,
    description: 'Show active site members with links to public profiles',
    defaultContent: {
      title: 'Members',
      subtitle: '',
      layout: 'grid',
      columns: 3,
      itemsPerPage: 24,
      sortBy: 'name',
      sortOrder: 'asc',
      showSearch: true,
      showRoleChips: true,
      includedRoles: ['owner', 'admin', 'member'],
      visibility: {},
    }
  },
  {
    type: 'divider',
    name: 'Divider / Spacer',
    icon: Minus,
    description: 'Visual separator or spacing between content sections',
    defaultContent: {
      style: 'solid',
      width: 'full',
      color: '#e5e7eb'
    }
  },
  {
    type: 'testimonials',
    name: 'Testimonials',
    icon: Quote,
    description: 'Showcase client testimonials in an auto-scrolling carousel',
    defaultContent: {
      title: 'Meet Our Happy Clients',
      subtitle: 'Hear from the teams who have transformed their workflow.',
      headerAlign: 'center',
      testimonialItems: [
        {
          id: 'item-1',
          name: 'Sarah Chen',
          role: 'CEO & Founder',
          avatar: '',
          content: 'This product has transformed how we build and ship. We accomplished in weeks what used to take months.',
        },
        {
          id: 'item-2',
          name: 'Marcus Rodriguez',
          role: 'CTO',
          avatar: '',
          content: 'The attention to detail and performance is impressive. Our team productivity increased significantly.',
        },
        {
          id: 'item-3',
          name: 'Emily Watson',
          role: 'Head of Product',
          avatar: '',
          content: 'Finally, a solution that developers actually want to use. The documentation is clear and defaults are sensible.',
        },
      ],
      testimonialStyle: 'default',
      styleConfig: {
        default: { speed: 0.7, showSecondRow: true }
      }
    }
  },
  {
    type: 'embedded',
    name: 'Embedded',
    icon: Code,
    description: 'Embed HTML code, scripts, or newsletter signup forms',
    defaultContent: {
      code: '',
      type: 'html'
    }
  }
]

export function getBlockTypeDefinition(type: string): BlockTypeDefinition | undefined {
  return findBlockType(PAGE_BLOCK_TYPES, type)
}

export function getBlockName(type: string): string {
  return _getBlockName(PAGE_BLOCK_TYPES, type)
}
