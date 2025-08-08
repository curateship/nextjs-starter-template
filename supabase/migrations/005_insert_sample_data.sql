-- Insert sample data for testing the multi-tenant theme system
-- This data helps test and demonstrate the functionality

-- Insert additional sample themes
INSERT INTO themes (name, description, template_path, status, preview_image, metadata) VALUES 
('Modern Blog', 'Clean and minimal blog theme with focus on typography and readability', '/themes/modern-blog', 'active', '/images/themes/modern-blog-preview.png', '{"features": ["responsive", "seo-optimized", "fast-loading"], "color_scheme": "light"}'),
('E-commerce Pro', 'Professional e-commerce theme with product showcases and shopping features', '/themes/ecommerce-pro', 'active', '/images/themes/ecommerce-pro-preview.png', '{"features": ["product-grid", "shopping-cart", "payment-integration"], "color_scheme": "dark"}'),
('Portfolio Creative', 'Creative portfolio theme for designers and artists', '/themes/portfolio-creative', 'development', '/images/themes/portfolio-creative-preview.png', '{"features": ["gallery", "animations", "contact-form"], "color_scheme": "gradient"}'),
('Corporate', 'Professional corporate theme for businesses', '/themes/corporate', 'inactive', '/images/themes/corporate-preview.png', '{"features": ["team-section", "services", "testimonials"], "color_scheme": "blue"}')
ON CONFLICT (name) DO NOTHING;

-- Note: We cannot insert sample sites or customizations without actual user IDs from auth.users
-- These would be created through the application interface after user authentication

-- Create a function to generate sample data for a given user (to be called after user login)
CREATE OR REPLACE FUNCTION create_sample_site_for_user(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
    v_site_id UUID;
    v_marketplace_theme_id UUID;
    v_subdomain TEXT;
BEGIN
    -- Get the marketplace theme ID
    SELECT id INTO v_marketplace_theme_id 
    FROM themes 
    WHERE name = 'Marketplace' 
    AND status = 'active' 
    LIMIT 1;
    
    IF v_marketplace_theme_id IS NULL THEN
        RAISE EXCEPTION 'Marketplace theme not found';
    END IF;
    
    -- Generate a unique subdomain
    SELECT generate_subdomain_suggestion('demo-site') INTO v_subdomain;
    
    -- Create sample site
    INSERT INTO sites (
        user_id, 
        theme_id, 
        name, 
        description, 
        subdomain, 
        status,
        settings
    ) VALUES (
        p_user_id,
        v_marketplace_theme_id,
        'My Demo Site',
        'A sample site created to demonstrate the multi-tenant theme system',
        v_subdomain,
        'active',
        '{
            "site_title": "Demo Site",
            "site_description": "Welcome to my demo site",
            "analytics_enabled": false,
            "seo_enabled": true
        }'
    ) RETURNING id INTO v_site_id;
    
    -- Create sample customizations for the home page
    -- Hero block customization
    PERFORM save_block_customization(
        v_site_id,
        '/',
        'HeroRuixenBlock',
        'hero-main',
        '{
            "title": "Welcome to My Demo Site",
            "subtitle": "This is a customized hero section showing how block-level customization works",
            "primary_button": {
                "text": "Get Started",
                "href": "/contact"
            },
            "secondary_button": {
                "text": "Learn More",
                "href": "/about"
            },
            "background_color": "#f8fafc",
            "text_color": "#1e293b"
        }'
    );
    
    -- Product grid customization
    PERFORM save_block_customization(
        v_site_id,
        '/',
        'ProductGridBlock',
        'products-featured',
        '{
            "title": "Featured Products",
            "subtitle": "Check out our most popular items",
            "show_view_all": true,
            "view_all_text": "Shop All Products",
            "products_per_row": 3,
            "max_products": 6,
            "layout": "grid"
        }'
    );
    
    -- Post grid customization
    PERFORM save_block_customization(
        v_site_id,
        '/',
        'PostGridBlock',
        'blog-recent',
        '{
            "title": "Latest Blog Posts",
            "subtitle": "Stay updated with our latest news and insights",
            "show_view_all": true,
            "view_all_text": "Read All Posts",
            "posts_per_row": 2,
            "max_posts": 4,
            "show_excerpt": true,
            "show_date": true
        }'
    );
    
    -- FAQ block customization
    PERFORM save_block_customization(
        v_site_id,
        '/',
        'FaqBlock',
        'faq-main',
        '{
            "title": "Frequently Asked Questions",
            "subtitle": "Find answers to common questions about our service",
            "faqs": [
                {
                    "question": "How do I get started?",
                    "answer": "Getting started is easy! Simply sign up for an account and follow our guided setup process."
                },
                {
                    "question": "Can I customize my site?",
                    "answer": "Yes! You can customize individual blocks on your pages, change colors, text, and layout options."
                },
                {
                    "question": "Is there customer support?",
                    "answer": "We offer 24/7 customer support via email and live chat to help you with any questions."
                }
            ]
        }'
    );
    
    RETURN v_site_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to get site statistics (for admin dashboard)
CREATE OR REPLACE FUNCTION get_system_statistics()
RETURNS JSON AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'total_themes', (SELECT COUNT(*) FROM themes),
        'active_themes', (SELECT COUNT(*) FROM themes WHERE status = 'active'),
        'total_sites', (SELECT COUNT(*) FROM sites),
        'active_sites', (SELECT COUNT(*) FROM sites WHERE status = 'active'),
        'total_customizations', (SELECT COUNT(*) FROM site_customizations WHERE is_active = true),
        'themes_by_status', (
            SELECT json_object_agg(status, count)
            FROM (
                SELECT status, COUNT(*) as count
                FROM themes
                GROUP BY status
            ) theme_stats
        ),
        'sites_by_status', (
            SELECT json_object_agg(status, count)
            FROM (
                SELECT status, COUNT(*) as count
                FROM sites
                GROUP BY status
            ) site_stats
        ),
        'popular_themes', (
            SELECT json_agg(
                json_build_object(
                    'theme_name', t.name,
                    'site_count', theme_usage.site_count
                )
            )
            FROM (
                SELECT theme_id, COUNT(*) as site_count
                FROM sites
                WHERE status = 'active'
                GROUP BY theme_id
                ORDER BY site_count DESC
                LIMIT 5
            ) theme_usage
            JOIN themes t ON t.id = theme_usage.theme_id
        )
    ) INTO result;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to validate customization data structure
CREATE OR REPLACE FUNCTION validate_customization_data(
    p_block_type VARCHAR(100),
    p_customizations JSONB
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Basic validation - ensure customizations is a valid JSON object
    IF p_customizations IS NULL OR jsonb_typeof(p_customizations) != 'object' THEN
        RETURN FALSE;
    END IF;
    
    -- Block-specific validation (can be extended)
    CASE p_block_type
        WHEN 'HeroRuixenBlock' THEN
            -- Validate hero block has required fields
            IF NOT (p_customizations ? 'title' OR p_customizations ? 'subtitle') THEN
                RETURN FALSE;
            END IF;
            
        WHEN 'ProductGridBlock' THEN
            -- Validate product grid has valid configuration
            IF p_customizations ? 'products_per_row' THEN
                IF NOT (p_customizations->>'products_per_row')::INTEGER BETWEEN 1 AND 6 THEN
                    RETURN FALSE;
                END IF;
            END IF;
            
        WHEN 'FaqBlock' THEN
            -- Validate FAQ block has valid structure
            IF p_customizations ? 'faqs' THEN
                IF jsonb_typeof(p_customizations->'faqs') != 'array' THEN
                    RETURN FALSE;
                END IF;
            END IF;
    END CASE;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate customizations before saving
CREATE OR REPLACE FUNCTION validate_customization_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT validate_customization_data(NEW.block_type, NEW.customizations) THEN
        RAISE EXCEPTION 'Invalid customization data for block type: %', NEW.block_type;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_customization_data_trigger
    BEFORE INSERT OR UPDATE ON site_customizations
    FOR EACH ROW
    EXECUTE FUNCTION validate_customization_trigger();