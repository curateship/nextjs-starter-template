import { BlockDefinition } from '../types'

export const heroRuixenBlockDefinition: BlockDefinition = {
  type: 'hero-ruixen',
  name: 'Hero Section',
  icon: '🎯',
  schema: {
    properties: {
      title: {
        type: 'string',
        label: 'Hero Title',
        placeholder: 'Build Exceptional Interfaces with Ease',
        description: 'Main heading displayed in large text',
        validation: {
          minLength: 3,
          maxLength: 100,
          allowEmpty: false
        }
      },
      subtitle: {
        type: 'textarea',
        label: 'Hero Subtitle',
        placeholder: 'Use our component library powered by Shadcn UI & Tailwind CSS...',
        description: 'Description text below the main heading',
        validation: {
          minLength: 10,
          maxLength: 500,
          allowEmpty: false
        }
      },
      primaryButton: {
        type: 'string',
        label: 'Primary Button Text',
        placeholder: 'Get Started',
        validation: {
          minLength: 2,
          maxLength: 30,
          allowEmpty: false
        }
      },
      secondaryButton: {
        type: 'string',
        label: 'Secondary Button Text', 
        placeholder: 'Browse Components',
        validation: {
          minLength: 2,
          maxLength: 30,
          allowEmpty: false
        }
      },
      showRainbowButton: {
        type: 'boolean',
        label: 'Show Rainbow Button',
        description: 'Display the special GitHub access button'
      },
      rainbowButtonText: {
        type: 'string',
        label: 'Rainbow Button Text',
        placeholder: 'Get Access to Everything',
        description: 'Text displayed on the rainbow button',
        validation: {
          minLength: 2,
          maxLength: 50,
          allowEmpty: false
        }
      },
      rainbowButtonIcon: {
        type: 'select',
        label: 'Rainbow Button Icon',
        options: [
          { value: 'none', label: 'No Icon' },
          { value: 'github', label: 'GitHub' },
          { value: 'arrow-right', label: 'Arrow Right' },
          { value: 'download', label: 'Download' },
          { value: 'external-link', label: 'External Link' },
          { value: 'star', label: 'Star' },
          { value: 'rocket', label: 'Rocket' },
          { value: 'zap', label: 'Zap' }
        ],
        description: 'Icon displayed on the rainbow button'
      },
      githubLink: {
        type: 'url',
        label: 'GitHub Link',
        placeholder: 'https://github.com/ruixenui/ruixen-free-components',
        description: 'Link for the rainbow button',
        validation: {
          pattern: '^https://github\\.com/.*'
        }
      },
      showParticles: {
        type: 'boolean',
        label: 'Show Floating Particles',
        description: 'Enable floating particle animation'
      },
      trustedByTextColor: {
        type: 'color',
        label: 'Badge Text Color',
        placeholder: '#6b7280',
        description: 'Color for the trusted by badge text'
      }
    },
    required: ['title', 'subtitle', 'primaryButton', 'secondaryButton']
  },
  defaultContent: {
    title: 'Build Exceptional Interfaces with Ease',
    subtitle: 'Use our component library powered by Shadcn UI & Tailwind CSS to craft beautiful, fast, and accessible UIs.',
    primaryButton: 'Get Started',
    secondaryButton: 'Browse Components',
    showRainbowButton: true,
    rainbowButtonText: 'Get Access to Everything',
    rainbowButtonIcon: 'github',
    githubLink: 'https://github.com/ruixenui/ruixen-free-components',
    showParticles: true,
    trustedByTextColor: '#6b7280'
  }
}

// claude.md followed