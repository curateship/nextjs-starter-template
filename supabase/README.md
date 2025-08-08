# Multi-Tenant Theme System Database Schema

This directory contains the database schema and migrations for the multi-tenant theme system with block-based customization.

## Schema Overview

### Core Tables

1. **`themes`** - Stores available themes
   - `id` - Unique theme identifier
   - `name` - Theme display name (unique)
   - `description` - Theme description
   - `status` - Theme status (active, inactive, development)
   - `template_path` - Path to theme template files
   - `preview_image` - URL to theme preview image
   - `metadata` - JSON metadata for theme features and configuration

2. **`sites`** - Stores user sites with theme associations
   - `id` - Unique site identifier
   - `user_id` - Reference to authenticated user
   - `theme_id` - Reference to selected theme
   - `name` - Site display name
   - `description` - Site description
   - `subdomain` - Unique subdomain (e.g., 'mysite' for mysite.yourapp.com)
   - `custom_domain` - Optional custom domain
   - `status` - Site status (active, inactive, draft, suspended)
   - `settings` - JSON site configuration

3. **`site_customizations`** - Stores block-level customizations
   - `id` - Unique customization identifier
   - `site_id` - Reference to site
   - `page_path` - Page path (e.g., '/', '/about')
   - `block_type` - Type of block (e.g., 'HeroRuixenBlock')
   - `block_identifier` - Unique identifier within page
   - `customizations` - JSON customization data
   - `version` - Version number for rollback functionality
   - `is_active` - Whether this version is active

## Security Features

### Row Level Security (RLS)
- **Themes**: Public read access to active themes, admin-only write access
- **Sites**: Users can only access their own sites
- **Customizations**: Users can only access customizations for their own sites

### Data Validation
- Subdomain format validation (alphanumeric and hyphens only)
- Custom domain format validation
- Theme status validation (must be active to assign to sites)
- Customization data structure validation per block type

## Key Functions

### Site Management
- `generate_subdomain_suggestion(base_name)` - Generates unique subdomain suggestions
- `get_user_site_count(user_id)` - Returns count of user's sites
- `user_owns_site(site_id)` - Checks if user owns a specific site

### Customization Management
- `save_block_customization(site_id, page_path, block_type, block_identifier, customizations)` - Saves block customization with versioning
- `get_site_page_customizations(site_id, page_path)` - Retrieves active customizations for a site page
- `rollback_block_customization(site_id, page_path, block_type, block_identifier, target_version)` - Rollback to previous version

### Sample Data & Testing
- `create_sample_site_for_user(user_id)` - Creates a demo site with sample customizations
- `get_system_statistics()` - Returns system-wide statistics for admin dashboard

### Maintenance
- `cleanup_old_customizations(days_old)` - Cleans up old inactive customizations while preserving recent versions

## Usage Examples

### Creating a Site
```sql
-- Create a new site for the current user
INSERT INTO sites (user_id, theme_id, name, subdomain, status)
SELECT 
    auth.uid(),
    (SELECT id FROM themes WHERE name = 'Marketplace' AND status = 'active' LIMIT 1),
    'My New Site',
    generate_subdomain_suggestion('my-new-site'),
    'active';
```

### Customizing a Block
```sql
-- Save customization for a hero block
SELECT save_block_customization(
    'site-id-here',
    '/',
    'HeroRuixenBlock',
    'hero-main',
    '{
        "title": "Welcome to My Site",
        "subtitle": "Custom subtitle here",
        "background_color": "#f8fafc"
    }'::jsonb
);
```

### Getting Site Customizations
```sql
-- Get all customizations for a site's home page
SELECT * FROM get_site_page_customizations('site-id-here', '/');
```

## Migration Order

Run migrations in the following order:
1. `001_create_themes_table.sql`
2. `002_create_sites_table.sql`
3. `003_create_site_customizations_table.sql`
4. `004_setup_relationships_and_policies.sql`
5. `005_insert_sample_data.sql`

## Development Setup

1. Ensure Supabase project is set up
2. Run migrations in order using Supabase CLI or Dashboard
3. Use `create_sample_site_for_user(auth.uid())` after user login to create test data
4. Test customization functionality through the application interface

## Performance Considerations

- Indexes are created on frequently queried columns
- Composite indexes support common query patterns
- Row Level Security policies are optimized for performance
- Inactive customizations are automatically cleaned up to prevent bloat

## Security Best Practices

- All user inputs are validated before storage
- RLS policies prevent unauthorized access
- Customization data is validated per block type
- Admin functions are properly secured with SECURITY DEFINER
- Database functions handle potential SQL injection through parameterized queries