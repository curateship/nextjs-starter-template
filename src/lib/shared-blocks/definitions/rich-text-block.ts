import { BlockDefinition } from '../types'

export const richTextBlockDefinition: BlockDefinition = {
  type: 'rich-text',
  name: 'Rich Text Content',
  icon: '📝',
  schema: {
    properties: {
      title: {
        type: 'string',
        label: 'Section Title',
        placeholder: 'Enter section title...',
        description: 'Optional title for this content section'
      },
      subtitle: {
        type: 'string',
        label: 'Section Subtitle', 
        placeholder: 'Enter section subtitle...',
        description: 'Optional subtitle for this content section'
      },
      headerAlign: {
        type: 'select',
        label: 'Header Alignment',
        description: 'Alignment for title and subtitle',
        options: [
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Center' }
        ],
        default: 'left'
      },
      content: {
        type: 'richtext',
        label: 'Content',
        placeholder: 'Start writing your content here...',
        description: 'Rich text content with formatting options',
        validation: {
          minLength: 1,
          allowEmpty: false
        }
      }
    },
    required: ['content']
  },
  defaultContent: {
    title: 'Content Section',
    subtitle: 'Professional content with rich formatting',
    headerAlign: 'left',
    content: '<p>This is a sample rich text block. You can add <strong>bold text</strong>, <em>italic text</em>, create lists, add links, and format your content with professional typography.</p><ul><li>Create bullet points</li><li>Add numbered lists</li><li>Include links and emphasis</li></ul><p>Perfect for contact pages, about sections, legal documents, and any content that needs professional formatting.</p>'
  }
}