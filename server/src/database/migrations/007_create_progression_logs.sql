-- UP
-- Experience and level up logging tables for progression tracking

-- Experience log for all experience gains
CREATE TABLE experience_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    amount NUMERIC(40,0) NOT NULL CHECK (amount > 0),
    source VARCHAR(50) NOT NULL,
    source_details JSONB DEFAULT '{}'::jsonb,
    old_level INTEGER NOT NULL,
    new_level INTEGER NOT NULL,
    old_experience NUMERIC(40,0) NOT NULL,
    new_experience NUMERIC(40,0) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for experience_log
CREATE INDEX idx_experience_log_character_id ON experience_log (character_id);
CREATE INDEX idx_experience_log_created_at ON experience_log (created_at);
CREATE INDEX idx_experience_log_source ON experience_log (source);

-- Level up log for tracking character level increases and rewards
CREATE TABLE level_up_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    old_level INTEGER NOT NULL,
    new_level INTEGER NOT NULL CHECK (new_level > old_level),
    stat_points_awarded INTEGER NOT NULL DEFAULT 0,
    new_title VARCHAR(100),
    milestone_rewards JSONB DEFAULT '[]'::jsonb,
    phase_changed BOOLEAN DEFAULT FALSE,
    old_phase VARCHAR(50),
    new_phase VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for level_up_log
CREATE INDEX idx_level_up_log_character_id ON level_up_log (character_id);
CREATE INDEX idx_level_up_log_new_level ON level_up_log (new_level);
CREATE INDEX idx_level_up_log_created_at ON level_up_log (created_at);

-- Character stat points tracking (optional for detailed tracking)
CREATE TABLE character_stat_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    total_earned INTEGER NOT NULL DEFAULT 0,
    total_spent INTEGER NOT NULL DEFAULT 0,
    available INTEGER NOT NULL DEFAULT 0 CHECK (available >= 0),
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure one record per character
    UNIQUE(character_id)
);

-- Milestone achievements tracking
CREATE TABLE milestone_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    milestone_level INTEGER NOT NULL,
    achievement_type VARCHAR(50) NOT NULL,
    reward_data JSONB DEFAULT '{}'::jsonb,
    achieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Prevent duplicate milestone achievements
    UNIQUE(character_id, milestone_level, achievement_type)
);

-- Indexes for milestone_achievements
CREATE INDEX idx_milestone_achievements_character_id ON milestone_achievements (character_id);
CREATE INDEX idx_milestone_achievements_level ON milestone_achievements (milestone_level);

-- Add stat points column to characters table if not exists
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'characters' AND column_name = 'available_stat_points'
    ) THEN
        ALTER TABLE characters ADD COLUMN available_stat_points INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;

-- DOWN
DROP TABLE IF EXISTS milestone_achievements;
DROP TABLE IF EXISTS character_stat_points;
DROP TABLE IF EXISTS level_up_log;
DROP TABLE IF EXISTS experience_log;

-- Remove stat points column if it was added
DO $$ 
BEGIN 
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'characters' AND column_name = 'available_stat_points'
    ) THEN
        ALTER TABLE characters DROP COLUMN available_stat_points;
    END IF;
END $$;