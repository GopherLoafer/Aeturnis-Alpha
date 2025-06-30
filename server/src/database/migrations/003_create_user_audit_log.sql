-- Migration 003: Create User Audit Log Table
-- Description: Security audit trail for user actions and system events
-- Created: 2025-06-30

-- Create user_audit_log table for security tracking
CREATE TABLE IF NOT EXISTS user_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL, -- NULL for system events
    session_id UUID NULL REFERENCES user_sessions(id) ON DELETE SET NULL,
    
    -- Event identification
    event_type VARCHAR(50) NOT NULL, -- 'login', 'logout', 'password_change', 'email_change', etc.
    event_category VARCHAR(30) NOT NULL, -- 'authentication', 'account', 'security', 'admin', 'game'
    action VARCHAR(100) NOT NULL, -- Specific action taken
    resource_type VARCHAR(50) NULL, -- Type of resource affected
    resource_id VARCHAR(255) NULL, -- ID of affected resource
    
    -- Event details
    status VARCHAR(20) NOT NULL, -- 'success', 'failure', 'partial', 'pending'
    result_code VARCHAR(20) NULL, -- Error code or success code
    message TEXT NULL, -- Human-readable event description
    
    -- Security context
    ip_address INET NULL,
    user_agent TEXT NULL,
    location_country VARCHAR(2) NULL,
    location_city VARCHAR(100) NULL,
    risk_score INTEGER NULL CHECK (risk_score >= 0 AND risk_score <= 100),
    
    -- Request/Response data (for debugging and analysis)
    request_method VARCHAR(10) NULL, -- HTTP method
    request_path VARCHAR(500) NULL, -- API endpoint
    request_params JSONB NULL, -- Request parameters (sanitized)
    response_status INTEGER NULL, -- HTTP status code
    
    -- Additional metadata
    metadata JSONB NULL, -- Flexible additional data
    tags TEXT[] NULL, -- Tags for categorization and searching
    
    -- Administrative fields
    severity VARCHAR(20) NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    is_sensitive BOOLEAN NOT NULL DEFAULT false, -- Contains sensitive data
    retention_policy VARCHAR(30) NOT NULL DEFAULT 'standard', -- 'standard', 'extended', 'permanent'
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMP NULL, -- When log was processed/analyzed
    expires_at TIMESTAMP NULL -- For automatic cleanup
);

-- Create indexes for audit log performance and searching
CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON user_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_session_id ON user_audit_log(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON user_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_event_category ON user_audit_log(event_category);
CREATE INDEX IF NOT EXISTS idx_audit_log_status ON user_audit_log(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON user_audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_ip_address ON user_audit_log(ip_address);
CREATE INDEX IF NOT EXISTS idx_audit_log_severity ON user_audit_log(severity);
CREATE INDEX IF NOT EXISTS idx_audit_log_is_sensitive ON user_audit_log(is_sensitive);
CREATE INDEX IF NOT EXISTS idx_audit_log_expires_at ON user_audit_log(expires_at);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_log_user_events ON user_audit_log(user_id, event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_security_events ON user_audit_log(event_category, severity, created_at) 
    WHERE event_category = 'security';
CREATE INDEX IF NOT EXISTS idx_audit_log_failed_events ON user_audit_log(status, event_type, created_at) 
    WHERE status = 'failure';
CREATE INDEX IF NOT EXISTS idx_audit_log_cleanup ON user_audit_log(retention_policy, expires_at);

-- GIN indexes for JSONB columns
CREATE INDEX IF NOT EXISTS idx_audit_log_request_params_gin ON user_audit_log USING GIN (request_params);
CREATE INDEX IF NOT EXISTS idx_audit_log_metadata_gin ON user_audit_log USING GIN (metadata);

-- GIN index for tags array
CREATE INDEX IF NOT EXISTS idx_audit_log_tags_gin ON user_audit_log USING GIN (tags);

-- Create function to set expiration based on retention policy
CREATE OR REPLACE FUNCTION set_audit_log_expiration()
RETURNS TRIGGER AS $$
BEGIN
    -- Set expiration based on retention policy
    CASE NEW.retention_policy
        WHEN 'standard' THEN
            NEW.expires_at = NEW.created_at + INTERVAL '90 days';
        WHEN 'extended' THEN
            NEW.expires_at = NEW.created_at + INTERVAL '1 year';
        WHEN 'permanent' THEN
            NEW.expires_at = NULL; -- Never expires
        ELSE
            NEW.expires_at = NEW.created_at + INTERVAL '30 days'; -- Default
    END CASE;
    
    -- Set special retention for security events
    IF NEW.event_category = 'security' OR NEW.severity IN ('error', 'critical') THEN
        NEW.retention_policy = 'extended';
        NEW.expires_at = NEW.created_at + INTERVAL '2 years';
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for automatic expiration setting
CREATE TRIGGER set_audit_log_expiration_trigger
    BEFORE INSERT ON user_audit_log
    FOR EACH ROW
    EXECUTE FUNCTION set_audit_log_expiration();

-- Create function for secure audit logging (prevents tampering)
CREATE OR REPLACE FUNCTION log_user_event(
    p_user_id UUID,
    p_session_id UUID,
    p_event_type VARCHAR(50),
    p_event_category VARCHAR(30),
    p_action VARCHAR(100),
    p_status VARCHAR(20),
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT NULL,
    p_severity VARCHAR(20) DEFAULT 'info'
)
RETURNS UUID AS $$
DECLARE
    audit_id UUID;
BEGIN
    INSERT INTO user_audit_log (
        user_id, session_id, event_type, event_category, action, 
        status, ip_address, user_agent, metadata, severity
    )
    VALUES (
        p_user_id, p_session_id, p_event_type, p_event_category, p_action,
        p_status, p_ip_address, p_user_agent, p_metadata, p_severity
    )
    RETURNING id INTO audit_id;
    
    RETURN audit_id;
END;
$$ language 'plpgsql';

-- Create view for recent security events
CREATE OR REPLACE VIEW recent_security_events AS
SELECT 
    ual.id,
    ual.user_id,
    u.username,
    u.email,
    ual.event_type,
    ual.action,
    ual.status,
    ual.ip_address,
    ual.severity,
    ual.message,
    ual.created_at
FROM user_audit_log ual
LEFT JOIN users u ON ual.user_id = u.id
WHERE ual.event_category = 'security'
    AND ual.created_at >= NOW() - INTERVAL '7 days'
ORDER BY ual.created_at DESC;

-- Create view for failed login attempts
CREATE OR REPLACE VIEW failed_login_attempts AS
SELECT 
    ual.user_id,
    u.username,
    u.email,
    COUNT(*) as attempt_count,
    MAX(ual.created_at) as last_attempt,
    array_agg(DISTINCT ual.ip_address) as ip_addresses
FROM user_audit_log ual
LEFT JOIN users u ON ual.user_id = u.id
WHERE ual.event_type = 'login'
    AND ual.status = 'failure'
    AND ual.created_at >= NOW() - INTERVAL '24 hours'
GROUP BY ual.user_id, u.username, u.email
HAVING COUNT(*) >= 3
ORDER BY attempt_count DESC, last_attempt DESC;

-- Add table and column comments
COMMENT ON TABLE user_audit_log IS 'Security audit trail for user actions and system events';
COMMENT ON COLUMN user_audit_log.id IS 'Unique audit log entry identifier';
COMMENT ON COLUMN user_audit_log.user_id IS 'User who performed the action (NULL for system events)';
COMMENT ON COLUMN user_audit_log.session_id IS 'Session context for the event';
COMMENT ON COLUMN user_audit_log.event_type IS 'Type of event: login, logout, password_change, etc.';
COMMENT ON COLUMN user_audit_log.event_category IS 'Category: authentication, account, security, admin, game';
COMMENT ON COLUMN user_audit_log.action IS 'Specific action taken';
COMMENT ON COLUMN user_audit_log.resource_type IS 'Type of resource affected';
COMMENT ON COLUMN user_audit_log.resource_id IS 'ID of affected resource';
COMMENT ON COLUMN user_audit_log.status IS 'Event status: success, failure, partial, pending';
COMMENT ON COLUMN user_audit_log.result_code IS 'Error code or success code';
COMMENT ON COLUMN user_audit_log.message IS 'Human-readable event description';
COMMENT ON COLUMN user_audit_log.ip_address IS 'Client IP address';
COMMENT ON COLUMN user_audit_log.user_agent IS 'Client user agent string';
COMMENT ON COLUMN user_audit_log.risk_score IS 'Security risk score (0-100)';
COMMENT ON COLUMN user_audit_log.request_method IS 'HTTP request method';
COMMENT ON COLUMN user_audit_log.request_path IS 'API endpoint path';
COMMENT ON COLUMN user_audit_log.request_params IS 'Sanitized request parameters';
COMMENT ON COLUMN user_audit_log.response_status IS 'HTTP response status code';
COMMENT ON COLUMN user_audit_log.metadata IS 'Additional event metadata';
COMMENT ON COLUMN user_audit_log.tags IS 'Tags for categorization and searching';
COMMENT ON COLUMN user_audit_log.severity IS 'Log severity: debug, info, warning, error, critical';
COMMENT ON COLUMN user_audit_log.is_sensitive IS 'Whether entry contains sensitive data';
COMMENT ON COLUMN user_audit_log.retention_policy IS 'Data retention policy: standard, extended, permanent';
COMMENT ON COLUMN user_audit_log.expires_at IS 'When this log entry expires (automatic cleanup)';

COMMENT ON VIEW recent_security_events IS 'Recent security events for monitoring dashboard';
COMMENT ON VIEW failed_login_attempts IS 'Failed login attempts in last 24 hours for security monitoring';