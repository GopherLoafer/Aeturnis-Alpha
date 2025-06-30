-- UP
-- Characters table for MMORPG character data
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    race_id UUID NOT NULL REFERENCES races(id),
    
    -- Identity
    name VARCHAR(50) NOT NULL UNIQUE,
    gender VARCHAR(20) NOT NULL DEFAULT 'neutral',
    
    -- Progression
    level INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    experience NUMERIC(40,0) NOT NULL DEFAULT 0,
    next_level_exp NUMERIC(40,0) NOT NULL DEFAULT 1000,
    titles JSONB DEFAULT '[]'::jsonb,
    status VARCHAR(20) NOT NULL DEFAULT 'normal' CHECK (status IN ('normal', 'combat', 'dead', 'busy')),
    
    -- Core Stats
    strength INTEGER NOT NULL DEFAULT 10,
    vitality INTEGER NOT NULL DEFAULT 10,
    dexterity INTEGER NOT NULL DEFAULT 10,
    intelligence INTEGER NOT NULL DEFAULT 10,
    wisdom INTEGER NOT NULL DEFAULT 10,
    
    -- Resources
    health INTEGER NOT NULL DEFAULT 100,
    max_health INTEGER NOT NULL DEFAULT 100 CHECK (health <= max_health),
    mana INTEGER NOT NULL DEFAULT 50,
    max_mana INTEGER NOT NULL DEFAULT 50 CHECK (mana <= max_mana),
    
    -- Location
    current_zone VARCHAR(100) NOT NULL DEFAULT 'starter_zone',
    position_x DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    position_y DECIMAL(10,2) NOT NULL DEFAULT 0.0,
    spawn_zone VARCHAR(100) NOT NULL DEFAULT 'starter_zone',
    
    -- Inventory
    gold INTEGER NOT NULL DEFAULT 100,
    inventory_slots INTEGER NOT NULL DEFAULT 20,
    bank_slots INTEGER NOT NULL DEFAULT 50,
    weight_capacity DECIMAL(8,2) NOT NULL DEFAULT 100.00,
    current_weight DECIMAL(8,2) NOT NULL DEFAULT 0.00 CHECK (current_weight <= weight_capacity),
    
    -- Customization
    appearance JSONB DEFAULT '{}'::jsonb,
    active_title VARCHAR(100),
    settings JSONB DEFAULT '{}'::jsonb,
    
    -- Lifecycle
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_characters_user_id ON characters(user_id);
CREATE INDEX idx_characters_race_id ON characters(race_id);
CREATE INDEX idx_characters_name ON characters(name);
CREATE INDEX idx_characters_last_active ON characters(last_active DESC);
CREATE INDEX idx_characters_current_zone ON characters(current_zone);
CREATE INDEX idx_characters_level ON characters(level);
CREATE INDEX idx_characters_status ON characters(status);

-- Partial index for active characters (not deleted)
CREATE INDEX idx_characters_active ON characters(user_id, last_active) WHERE deleted_at IS NULL;

-- Position index for spatial queries
CREATE INDEX idx_characters_position ON characters(current_zone, position_x, position_y) WHERE deleted_at IS NULL;

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
DROP INDEX IF EXISTS idx_characters_active;
DROP INDEX IF EXISTS idx_characters_status;
DROP INDEX IF EXISTS idx_characters_level;
DROP INDEX IF EXISTS idx_characters_current_zone;
DROP INDEX IF EXISTS idx_characters_last_active;
DROP INDEX IF EXISTS idx_characters_name;
DROP INDEX IF EXISTS idx_characters_race_id;
DROP INDEX IF EXISTS idx_characters_user_id;
DROP TABLE IF EXISTS characters;