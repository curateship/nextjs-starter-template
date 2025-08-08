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
    githubLink: 'https://github.com/ruixenui/ruixen-free-components',
    showParticles: true
  }
}

// claude.md followed