-- Migration 004: Create Migration History Table
-- Description: Track applied database migrations for version control
-- Created: 2025-06-30

-- Create migration_history table for tracking applied migrations
CREATE TABLE IF NOT EXISTS migration_history (
    id SERIAL PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    migration_file VARCHAR(255) NOT NULL,
    batch_number INTEGER NOT NULL DEFAULT 1,
    
    -- Migration metadata
    checksum VARCHAR(64) NULL, -- SHA-256 hash of migration content
    description TEXT NULL,
    migration_type VARCHAR(50) NOT NULL DEFAULT 'schema', -- 'schema', 'data', 'index', 'function'
    
    -- Execution details
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back')),
    execution_time_ms INTEGER NULL,
    error_message TEXT NULL,
    
    -- Rollback information
    rollback_sql TEXT NULL,
    can_rollback BOOLEAN NOT NULL DEFAULT false,
    rolled_back_at TIMESTAMP NULL,
    rolled_back_by VARCHAR(100) NULL,
    
    -- Timestamps
    applied_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP NULL
);

-- Create indexes for migration tracking
CREATE INDEX IF NOT EXISTS idx_migration_history_migration_name ON migration_history(migration_name);
CREATE INDEX IF NOT EXISTS idx_migration_history_batch_number ON migration_history(batch_number);
CREATE INDEX IF NOT EXISTS idx_migration_history_status ON migration_history(status);
CREATE INDEX IF NOT EXISTS idx_migration_history_applied_at ON migration_history(applied_at);
CREATE INDEX IF NOT EXISTS idx_migration_history_migration_type ON migration_history(migration_type);

-- Create function to calculate file checksum (for integrity verification)
CREATE OR REPLACE FUNCTION calculate_migration_checksum(file_content TEXT)
RETURNS VARCHAR(64) AS $$
BEGIN
    -- Simple checksum using PostgreSQL's md5 function
    -- In production, would use SHA-256 or similar
    RETURN md5(file_content);
END;
$$ language 'plpgsql';

-- Create function to record migration start
CREATE OR REPLACE FUNCTION start_migration(
    p_migration_name VARCHAR(255),
    p_migration_file VARCHAR(255),
    p_description TEXT DEFAULT NULL,
    p_migration_type VARCHAR(50) DEFAULT 'schema',
    p_checksum VARCHAR(64) DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    migration_id INTEGER;
    current_batch INTEGER;
BEGIN
    -- Get next batch number
    SELECT COALESCE(MAX(batch_number), 0) + 1 INTO current_batch
    FROM migration_history;
    
    -- Insert migration record
    INSERT INTO migration_history (
        migration_name, migration_file, batch_number, 
        description, migration_type, checksum, status
    )
    VALUES (
        p_migration_name, p_migration_file, current_batch,
        p_description, p_migration_type, p_checksum, 'running'
    )
    RETURNING id INTO migration_id;
    
    RETURN migration_id;
END;
$$ language 'plpgsql';

-- Create function to mark migration as completed
CREATE OR REPLACE FUNCTION complete_migration(
    p_migration_id INTEGER,
    p_execution_time_ms INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE migration_history 
    SET 
        status = 'completed',
        completed_at = NOW(),
        execution_time_ms = p_execution_time_ms
    WHERE id = p_migration_id;
    
    RETURN FOUND;
END;
$$ language 'plpgsql';

-- Create function to mark migration as failed
CREATE OR REPLACE FUNCTION fail_migration(
    p_migration_id INTEGER,
    p_error_message TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE migration_history 
    SET 
        status = 'failed',
        completed_at = NOW(),
        error_message = p_error_message
    WHERE id = p_migration_id;
    
    RETURN FOUND;
END;
$$ language 'plpgsql';

-- Create view for migration status overview
CREATE OR REPLACE VIEW migration_status_overview AS
SELECT 
    migration_type,
    COUNT(*) as total_migrations,
    COUNT(*) FILTER (WHERE status = 'completed') as completed,
    COUNT(*) FILTER (WHERE status = 'failed') as failed,
    COUNT(*) FILTER (WHERE status = 'pending') as pending,
    MAX(applied_at) as last_migration_date,
    AVG(execution_time_ms) FILTER (WHERE execution_time_ms IS NOT NULL) as avg_execution_time_ms
FROM migration_history
GROUP BY migration_type
ORDER BY migration_type;

-- Create view for recent migrations
CREATE OR REPLACE VIEW recent_migrations AS
SELECT 
    id,
    migration_name,
    migration_file,
    batch_number,
    status,
    execution_time_ms,
    applied_at,
    completed_at,
    error_message
FROM migration_history
ORDER BY applied_at DESC
LIMIT 20;

-- Add table and column comments
COMMENT ON TABLE migration_history IS 'Track applied database migrations for version control';
COMMENT ON COLUMN migration_history.id IS 'Unique migration execution identifier';
COMMENT ON COLUMN migration_history.migration_name IS 'Unique name of the migration';
COMMENT ON COLUMN migration_history.migration_file IS 'Filename of the migration SQL file';
COMMENT ON COLUMN migration_history.batch_number IS 'Batch number for grouping related migrations';
COMMENT ON COLUMN migration_history.checksum IS 'SHA-256 hash of migration content for integrity';
COMMENT ON COLUMN migration_history.description IS 'Human-readable description of migration';
COMMENT ON COLUMN migration_history.migration_type IS 'Type: schema, data, index, function';
COMMENT ON COLUMN migration_history.status IS 'Execution status: pending, running, completed, failed, rolled_back';
COMMENT ON COLUMN migration_history.execution_time_ms IS 'Time taken to execute migration in milliseconds';
COMMENT ON COLUMN migration_history.error_message IS 'Error message if migration failed';
COMMENT ON COLUMN migration_history.rollback_sql IS 'SQL commands to rollback this migration';
COMMENT ON COLUMN migration_history.can_rollback IS 'Whether this migration can be safely rolled back';
COMMENT ON COLUMN migration_history.applied_at IS 'When migration was started';
COMMENT ON COLUMN migration_history.completed_at IS 'When migration completed (success or failure)';

COMMENT ON VIEW migration_status_overview IS 'Summary of migration status by type';
COMMENT ON VIEW recent_migrations IS 'Last 20 migrations for quick status check';