-- UP
-- Combat sessions table for turn-based combat system

-- Create combat_sessions table
CREATE TABLE combat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_type VARCHAR(20) NOT NULL DEFAULT 'pve',
    status VARCHAR(20) NOT NULL DEFAULT 'waiting',
    initiator_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    target_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    turn_order TEXT[] DEFAULT ARRAY[]::TEXT[],
    current_turn INTEGER DEFAULT 0,
    turn_number INTEGER DEFAULT 1,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP WITH TIME ZONE,
    winner UUID REFERENCES characters(id) ON DELETE SET NULL,
    experience INTEGER DEFAULT 0,
    gold INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (session_type IN ('pve', 'pvp', 'boss', 'arena', 'duel')),
    CHECK (status IN ('waiting', 'active', 'paused', 'ended', 'cancelled')),
    CHECK (current_turn >= 0),
    CHECK (turn_number >= 1),
    CHECK (experience >= 0),
    CHECK (gold >= 0)
);

-- Indexes for combat_sessions
CREATE INDEX idx_combat_sessions_status ON combat_sessions (status);
CREATE INDEX idx_combat_sessions_session_type ON combat_sessions (session_type);
CREATE INDEX idx_combat_sessions_initiator ON combat_sessions (initiator_id);
CREATE INDEX idx_combat_sessions_zone ON combat_sessions (zone_id);
CREATE INDEX idx_combat_sessions_created_at ON combat_sessions (created_at);
CREATE INDEX idx_combat_sessions_active ON combat_sessions (status) WHERE status = 'active';

-- Add trigger for updated_at
CREATE TRIGGER update_combat_sessions_updated_at 
    BEFORE UPDATE ON combat_sessions 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- DOWN
DROP TRIGGER IF EXISTS update_combat_sessions_updated_at ON combat_sessions;
DROP INDEX IF EXISTS idx_combat_sessions_active;
DROP INDEX IF EXISTS idx_combat_sessions_created_at;
DROP INDEX IF EXISTS idx_combat_sessions_zone;
DROP INDEX IF EXISTS idx_combat_sessions_initiator;
DROP INDEX IF EXISTS idx_combat_sessions_session_type;
DROP INDEX IF EXISTS idx_combat_sessions_status;
DROP TABLE IF EXISTS combat_sessions;