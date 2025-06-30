-- UP
CREATE TABLE user_security (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  login_attempts INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMP WITH TIME ZONE,
  locked_until TIMESTAMP WITH TIME ZONE,
  two_factor_enabled BOOLEAN DEFAULT false,
  two_factor_secret VARCHAR(255),
  recovery_codes TEXT[],
  password_changed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  must_change_password BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_user_security_locked ON user_security(locked_until) WHERE locked_until IS NOT NULL;
CREATE INDEX idx_user_security_2fa ON user_security(user_id) WHERE two_factor_enabled = true;
CREATE INDEX idx_user_security_password_change ON user_security(user_id) WHERE must_change_password = true;

-- Trigger for automatic updated_at
CREATE TRIGGER update_user_security_updated_at 
    BEFORE UPDATE ON user_security 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create security record for new users
CREATE OR REPLACE FUNCTION create_user_security_record()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_security (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to create security record when user is created
CREATE TRIGGER create_user_security_on_user_insert
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION create_user_security_record();

-- DOWN
DROP TRIGGER IF EXISTS create_user_security_on_user_insert ON users;
DROP FUNCTION IF EXISTS create_user_security_record();
DROP TRIGGER IF EXISTS update_user_security_updated_at ON user_security;
DROP INDEX IF EXISTS idx_user_security_password_change;
DROP INDEX IF EXISTS idx_user_security_2fa;
DROP INDEX IF EXISTS idx_user_security_locked;
DROP TABLE IF EXISTS user_security;