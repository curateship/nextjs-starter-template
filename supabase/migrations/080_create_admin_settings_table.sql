-- Drop existing table if you want to start fresh (uncomment if needed)
-- DROP TABLE IF EXISTS admin_settings CASCADE;

-- Create admin_settings table for platform-wide configuration
CREATE TABLE IF NOT EXISTS admin_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_admin_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS admin_settings_updated_at ON admin_settings;
CREATE TRIGGER admin_settings_updated_at
    BEFORE UPDATE ON admin_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_admin_settings_updated_at();

-- Insert default admin settings row with default fonts (only if table is empty)
INSERT INTO admin_settings (settings)
SELECT '{
    "font_family": "urbanist",
    "secondary_font_family": "urbanist",
    "font_weights": ["400", "500", "600", "700"],
    "secondary_font_weights": ["400", "500", "600", "700"]
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM admin_settings);

-- Enable Row Level Security
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to read admin settings" ON admin_settings;
DROP POLICY IF EXISTS "Allow authenticated users to update admin settings" ON admin_settings;
DROP POLICY IF EXISTS "authenticated_select_admin_settings" ON admin_settings;
DROP POLICY IF EXISTS "authenticated_update_admin_settings" ON admin_settings;

-- Create policy: Allow all authenticated users to read admin settings
CREATE POLICY "authenticated_select_admin_settings"
    ON admin_settings
    FOR SELECT
    TO authenticated
    USING (true);

-- Create policy: Allow all authenticated users to update admin settings
-- Note: In production, you may want to restrict this to admin role only
CREATE POLICY "authenticated_update_admin_settings"
    ON admin_settings
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Grant permissions to authenticated role
GRANT SELECT, UPDATE ON admin_settings TO authenticated;

-- Grant all permissions to service role
GRANT ALL ON admin_settings TO service_role;

-- Add comment for documentation
COMMENT ON TABLE admin_settings IS 'Stores platform-wide admin panel configuration including fonts and theme preferences';

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
