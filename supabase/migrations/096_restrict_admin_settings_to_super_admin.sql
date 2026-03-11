-- Restrict admin_settings to super_admin only
-- Previously allowed all authenticated users to SELECT and UPDATE

DROP POLICY IF EXISTS "authenticated_select_admin_settings" ON admin_settings;
DROP POLICY IF EXISTS "authenticated_update_admin_settings" ON admin_settings;

CREATE POLICY "super_admin_select_admin_settings"
    ON admin_settings
    FOR SELECT
    TO authenticated
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
    );

CREATE POLICY "super_admin_update_admin_settings"
    ON admin_settings
    FOR UPDATE
    TO authenticated
    USING (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
    )
    WITH CHECK (
        (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
    );
