-- Grant access to read user information for attribution
GRANT USAGE ON SCHEMA auth TO anon;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT SELECT ON TABLE auth.users TO anon;
GRANT SELECT ON TABLE auth.users TO authenticated;
