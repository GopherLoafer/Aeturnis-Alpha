-- UP
-- Combat participants table for tracking combat entities

-- Create combat_participants table
CREATE TABLE combat_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    participant_type VARCHAR(20) NOT NULL DEFAULT 'player',
    side VARCHAR(20) NOT NULL DEFAULT 'attackers',
    initiative INTEGER DEFAULT 0,
    position INTEGER DEFAULT 0,
    current_hp INTEGER NOT NULL,
    max_hp INTEGER NOT NULL,
    current_mp INTEGER DEFAULT 0,
    max_mp INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'alive',
    status_effects JSONB DEFAULT '[]'::jsonb,
    last_action_at TIMESTAMP WITH TIME ZONE,
    action_cooldowns JSONB DEFAULT '{}'::jsonb,
    damage_taken INTEGER DEFAULT 0,
    damage_dealt INTEGER DEFAULT 0,
    actions_used INTEGER DEFAULT 0,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    UNIQUE (session_id, character_id),
    CHECK (participant_type IN ('player', 'monster', 'npc', 'boss')),
    CHECK (side IN ('attackers', 'defenders', 'neutral')),
    CHECK (status IN ('alive', 'dead', 'fled', 'stunned', 'incapacitated')),
    CHECK (current_hp >= 0),
    CHECK (max_hp > 0),
    CHECK (current_mp >= 0),
    CHECK (max_mp >= 0),
    CHECK (damage_taken >= 0),
    CHECK (damage_dealt >= 0),
    CHECK (actions_used >= 0),
    CHECK (initiative >= 0),
    CHECK (position >= 0)
);

-- Indexes for combat_participants
CREATE INDEX idx_combat_participants_session ON combat_participants (session_id);
CREATE INDEX idx_combat_participants_character ON combat_participants (character_id);
CREATE INDEX idx_combat_participants_status ON combat_participants (status);
CREATE INDEX idx_combat_participants_side ON combat_participants (side);
CREATE INDEX idx_combat_participants_initiative ON combat_participants (initiative DESC);
CREATE INDEX idx_combat_participants_alive ON combat_participants (session_id, status) WHERE status = 'alive';

-- DOWN
DROP INDEX IF EXISTS idx_combat_participants_alive;
DROP INDEX IF EXISTS idx_combat_participants_initiative;
DROP INDEX IF EXISTS idx_combat_participants_side;
DROP INDEX IF EXISTS idx_combat_participants_status;
DROP INDEX IF EXISTS idx_combat_participants_character;
DROP INDEX IF EXISTS idx_combat_participants_session;
DROP TABLE IF EXISTS combat_participants;