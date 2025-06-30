-- Migration 002: Create Sessions Table
-- Description: Active session tracking for security and device management
-- Created: 2025-06-30

-- Create user_sessions table for tracking active sessions
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Session identification
    session_token VARCHAR(255) NOT NULL UNIQUE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    token_family UUID NOT NULL DEFAULT uuid_generate_v4(),
    
    -- Device and location info
    device_type VARCHAR(50) NULL, -- 'mobile', 'desktop', 'tablet', 'api'
    device_name VARCHAR(100) NULL, -- User-friendly device name
    user_agent TEXT NULL,
    ip_address INET NULL,
    location_country VARCHAR(2) NULL, -- ISO country code
    location_city VARCHAR(100) NULL,
    
    -- Session status and timing
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked', 'suspicious')),
    is_trusted BOOLEAN NOT NULL DEFAULT false,
    last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    
    -- Security tracking
    login_method VARCHAR(50) NOT NULL DEFAULT 'password', -- 'password', 'oauth', 'api_key'
    is_suspicious BOOLEAN NOT NULL DEFAULT false,
    risk_score INTEGER NOT NULL DEFAULT 0 CHECK (risk_score >= 0 AND risk_score <= 100),
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMP NULL,
    revoked_by VARCHAR(50) NULL -- 'user', 'admin', 'system', 'security'
);

-- Create indexes for session management performance
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_refresh_token_hash ON user_sessions(refresh_token_hash);
CREATE INDEX IF NOT EXISTS idx_user_sessions_token_family ON user_sessions(token_family);
CREATE INDEX IF NOT EXISTS idx_user_sessions_status ON user_sessions(status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_ip_address ON user_sessions(ip_address);
CREATE INDEX IF NOT EXISTS idx_user_sessions_device_type ON user_sessions(device_type);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_suspicious ON user_sessions(is_suspicious);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_device ON user_sessions(user_id, device_type, status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_cleanup ON user_sessions(status, expires_at) WHERE status IN ('expired', 'revoked');

-- Create function to automatically update last_activity
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if it's been more than 1 minute since last update
    IF NEW.last_activity IS NULL OR 
       OLD.last_activity IS NULL OR 
       NEW.last_activity - OLD.last_activity > INTERVAL '1 minute' THEN
        NEW.last_activity = NOW();
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for session activity updates
CREATE TRIGGER update_user_sessions_activity 
    BEFORE UPDATE ON user_sessions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_session_activity();

-- Add table and column comments
COMMENT ON TABLE user_sessions IS 'Active user sessions for security tracking and device management';
COMMENT ON COLUMN user_sessions.id IS 'Unique session identifier';
COMMENT ON COLUMN user_sessions.user_id IS 'Reference to users table';
COMMENT ON COLUMN user_sessions.session_token IS 'Unique session token (hashed access token reference)';
COMMENT ON COLUMN user_sessions.refresh_token_hash IS 'Hashed refresh token for validation';
COMMENT ON COLUMN user_sessions.token_family IS 'Token family for refresh token rotation tracking';
COMMENT ON COLUMN user_sessions.device_type IS 'Type of device: mobile, desktop, tablet, api';
COMMENT ON COLUMN user_sessions.device_name IS 'User-friendly device name';
COMMENT ON COLUMN user_sessions.user_agent IS 'Browser/app user agent string';
COMMENT ON COLUMN user_sessions.ip_address IS 'Client IP address for security tracking';
COMMENT ON COLUMN user_sessions.location_country IS 'ISO country code from IP geolocation';
COMMENT ON COLUMN user_sessions.location_city IS 'City from IP geolocation';
COMMENT ON COLUMN user_sessions.status IS 'Session status: active, expired, revoked, suspicious';
COMMENT ON COLUMN user_sessions.is_trusted IS 'Whether this device/location is trusted';
COMMENT ON COLUMN user_sessions.last_activity IS 'Last time this session was used';
COMMENT ON COLUMN user_sessions.expires_at IS 'When this session expires';
COMMENT ON COLUMN user_sessions.login_method IS 'How user authenticated: password, oauth, api_key';
COMMENT ON COLUMN user_sessions.is_suspicious IS 'Flag for suspicious activity detection';
COMMENT ON COLUMN user_sessions.risk_score IS 'Security risk score (0-100)';
COMMENT ON COLUMN user_sessions.revoked_by IS 'Who/what revoked the session: user, admin, system, security';