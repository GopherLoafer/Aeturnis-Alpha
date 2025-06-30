-- UP
-- Combat sessions table for managing real-time combat encounters
CREATE TABLE combat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_name VARCHAR(100) NOT NULL,
    zone_id VARCHAR(100) NOT NULL,
    
    -- Combat state
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    turn_order JSONB NOT NULL DEFAULT '[]',
    current_turn INTEGER NOT NULL DEFAULT 0,
    round_number INTEGER NOT NULL DEFAULT 1,
    
    -- Participants
    max_participants INTEGER NOT NULL DEFAULT 10,
    participant_count INTEGER NOT NULL DEFAULT 0,
    
    -- Timing
    turn_duration_seconds INTEGER NOT NULL DEFAULT 30,
    last_action_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Combat data
    combat_log JSONB NOT NULL DEFAULT '[]',
    victory_conditions JSONB NOT NULL DEFAULT '{}',
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Combat participants table
CREATE TABLE combat_participants (
    id SERIAL PRIMARY KEY,
    combat_session_id UUID NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    
    -- Combat stats
    current_health INTEGER NOT NULL,
    max_health INTEGER NOT NULL,
    current_mana INTEGER NOT NULL,
    max_mana INTEGER NOT NULL,
    
    -- Combat state
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    initiative INTEGER NOT NULL DEFAULT 0,
    turn_position INTEGER NOT NULL,
    
    -- Actions
    actions_taken INTEGER NOT NULL DEFAULT 0,
    last_action JSONB,
    
    -- Metadata
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(combat_session_id, character_id)
);

-- Combat actions table for detailed action logging
CREATE TABLE combat_actions (
    id SERIAL PRIMARY KEY,
    combat_session_id UUID NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    
    -- Action details
    action_type VARCHAR(50) NOT NULL,
    action_data JSONB NOT NULL,
    target_character_id INTEGER REFERENCES characters(id),
    
    -- Results
    damage_dealt INTEGER DEFAULT 0,
    healing_done INTEGER DEFAULT 0,
    effects_applied JSONB DEFAULT '[]',
    
    -- Timing
    round_number INTEGER NOT NULL,
    turn_number INTEGER NOT NULL,
    action_timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_combat_sessions_status ON combat_sessions(status);
CREATE INDEX idx_combat_sessions_zone_id ON combat_sessions(zone_id);
CREATE INDEX idx_combat_sessions_created_at ON combat_sessions(created_at DESC);

CREATE INDEX idx_combat_participants_session ON combat_participants(combat_session_id);
CREATE INDEX idx_combat_participants_character ON combat_participants(character_id);
CREATE INDEX idx_combat_participants_status ON combat_participants(status);

CREATE INDEX idx_combat_actions_session ON combat_actions(combat_session_id);
CREATE INDEX idx_combat_actions_character ON combat_actions(character_id);
CREATE INDEX idx_combat_actions_timestamp ON combat_actions(action_timestamp DESC);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_combat_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER combat_sessions_update_trigger
    BEFORE UPDATE ON combat_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_combat_sessions_updated_at();

CREATE OR REPLACE FUNCTION update_combat_participants_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER combat_participants_update_trigger
    BEFORE UPDATE ON combat_participants
    FOR EACH ROW
    EXECUTE FUNCTION update_combat_participants_updated_at();

-- DOWN
DROP TRIGGER IF EXISTS combat_participants_update_trigger ON combat_participants;
DROP FUNCTION IF EXISTS update_combat_participants_updated_at();
DROP TRIGGER IF EXISTS combat_sessions_update_trigger ON combat_sessions;
DROP FUNCTION IF EXISTS update_combat_sessions_updated_at();

DROP INDEX IF EXISTS idx_combat_actions_timestamp;
DROP INDEX IF EXISTS idx_combat_actions_character;
DROP INDEX IF EXISTS idx_combat_actions_session;
DROP INDEX IF EXISTS idx_combat_participants_status;
DROP INDEX IF EXISTS idx_combat_participants_character;
DROP INDEX IF EXISTS idx_combat_participants_session;
DROP INDEX IF EXISTS idx_combat_sessions_created_at;
DROP INDEX IF EXISTS idx_combat_sessions_zone_id;
DROP INDEX IF EXISTS idx_combat_sessions_status;

DROP TABLE IF EXISTS combat_actions;
DROP TABLE IF EXISTS combat_participants;
DROP TABLE IF EXISTS combat_sessions;