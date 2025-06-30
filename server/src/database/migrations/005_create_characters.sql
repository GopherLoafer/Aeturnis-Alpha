-- UP
-- Characters table for MMORPG character data
CREATE TABLE characters (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL UNIQUE,
    class VARCHAR(30) NOT NULL DEFAULT 'warrior',
    level INTEGER NOT NULL DEFAULT 1,
    experience BIGINT NOT NULL DEFAULT 0,
    
    -- Position and zone data
    zone_id VARCHAR(100) NOT NULL DEFAULT 'starter_zone',
    position_x DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    position_y DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    position_z DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    rotation DECIMAL(5,2) NOT NULL DEFAULT 0.0,
    
    -- Stats
    health INTEGER NOT NULL DEFAULT 100,
    max_health INTEGER NOT NULL DEFAULT 100,
    mana INTEGER NOT NULL DEFAULT 50,
    max_mana INTEGER NOT NULL DEFAULT 50,
    strength INTEGER NOT NULL DEFAULT 10,
    agility INTEGER NOT NULL DEFAULT 10,
    intelligence INTEGER NOT NULL DEFAULT 10,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'online',
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_characters_user_id ON characters(user_id);
CREATE INDEX idx_characters_name ON characters(name);
CREATE INDEX idx_characters_zone_id ON characters(zone_id);
CREATE INDEX idx_characters_status ON characters(status);
CREATE INDEX idx_characters_last_activity ON characters(last_activity DESC);

-- Position index for spatial queries
CREATE INDEX idx_characters_position ON characters(zone_id, position_x, position_y);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_characters_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER characters_update_trigger
    BEFORE UPDATE ON characters
    FOR EACH ROW
    EXECUTE FUNCTION update_characters_updated_at();

-- DOWN
DROP TRIGGER IF EXISTS characters_update_trigger ON characters;
DROP FUNCTION IF EXISTS update_characters_updated_at();
DROP INDEX IF EXISTS idx_characters_position;
DROP INDEX IF EXISTS idx_characters_last_activity;
DROP INDEX IF EXISTS idx_characters_status;
DROP INDEX IF EXISTS idx_characters_zone_id;
DROP INDEX IF EXISTS idx_characters_name;
DROP INDEX IF EXISTS idx_characters_user_id;
DROP TABLE IF EXISTS characters;