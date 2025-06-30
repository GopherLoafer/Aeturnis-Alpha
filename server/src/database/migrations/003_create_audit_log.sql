-- UP
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(50) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(255),
  changes JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance and queries
CREATE INDEX idx_audit_user ON audit_log(user_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX idx_audit_ip ON audit_log(ip_address);

-- Partition table by month for better performance (optional but recommended for high volume)
-- This creates monthly partitions automatically
CREATE OR REPLACE FUNCTION create_monthly_audit_partition()
RETURNS void AS $$
DECLARE
    start_date date;
    end_date date;
    partition_name text;
BEGIN
    start_date := date_trunc('month', CURRENT_DATE);
    end_date := start_date + interval '1 month';
    partition_name := 'audit_log_' || to_char(start_date, 'YYYY_MM');
    
    -- Create partition if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = partition_name
    ) THEN
        EXECUTE format('CREATE TABLE %I PARTITION OF audit_log 
                       FOR VALUES FROM (%L) TO (%L)',
                       partition_name, start_date, end_date);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to automatically create next month's partition
CREATE OR REPLACE FUNCTION maintain_audit_partitions()
RETURNS void AS $$
DECLARE
    next_month date;
    partition_name text;
BEGIN
    -- Create partition for next month
    next_month := date_trunc('month', CURRENT_DATE + interval '1 month');
    partition_name := 'audit_log_' || to_char(next_month, 'YYYY_MM');
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = partition_name
    ) THEN
        EXECUTE format('CREATE TABLE %I PARTITION OF audit_log 
                       FOR VALUES FROM (%L) TO (%L)',
                       partition_name, next_month, next_month + interval '1 month');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- DOWN
DROP FUNCTION IF EXISTS maintain_audit_partitions();
DROP FUNCTION IF EXISTS create_monthly_audit_partition();
DROP INDEX IF EXISTS idx_audit_ip;
DROP INDEX IF EXISTS idx_audit_resource;
DROP INDEX IF EXISTS idx_audit_action;
DROP INDEX IF EXISTS idx_audit_created;
DROP INDEX IF EXISTS idx_audit_user;
DROP TABLE IF EXISTS audit_log;