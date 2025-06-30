-- UP
-- Affinity Tracking System - Step 2.6
-- Tables for weapon and magic affinity progression with tier system

-- Create affinities lookup table
CREATE TABLE affinities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL,
    description TEXT,
    max_tier INTEGER NOT NULL DEFAULT 7,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (type IN ('weapon', 'magic')),
    CHECK (max_tier >= 1 AND max_tier <= 10),
    CHECK (name ~ '^[a-z_]+$') -- Enforce lowercase with underscores
);

-- Create character_affinities tracking table
CREATE TABLE character_affinities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    affinity_id UUID NOT NULL REFERENCES affinities(id) ON DELETE CASCADE,
    experience BIGINT NOT NULL DEFAULT 0,
    tier INTEGER NOT NULL DEFAULT 1,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (experience >= 0),
    CHECK (tier >= 1 AND tier <= 7),
    
    -- Unique constraint - one record per character per affinity
    UNIQUE (character_id, affinity_id)
);

-- Create affinity_log for audit trail
CREATE TABLE affinity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID, -- Optional - may not always be from combat
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    affinity_id UUID NOT NULL REFERENCES affinities(id) ON DELETE CASCADE,
    experience_awarded BIGINT NOT NULL,
    previous_tier INTEGER NOT NULL,
    new_tier INTEGER NOT NULL,
    source VARCHAR(50) NOT NULL DEFAULT 'combat',
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (experience_awarded > 0),
    CHECK (previous_tier >= 1 AND previous_tier <= 7),
    CHECK (new_tier >= 1 AND new_tier <= 7),
    CHECK (source IN ('combat', 'quest', 'training', 'admin', 'event'))
);

-- Create indexes for performance
CREATE INDEX idx_character_affinities_character_id ON character_affinities(character_id);
CREATE INDEX idx_character_affinities_affinity_id ON character_affinities(affinity_id);
CREATE INDEX idx_character_affinities_tier ON character_affinities(tier);
CREATE INDEX idx_affinity_log_character_id ON affinity_log(character_id);
CREATE INDEX idx_affinity_log_timestamp ON affinity_log(timestamp);
CREATE INDEX idx_affinities_type ON affinities(type);
CREATE INDEX idx_affinities_name ON affinities(name);

-- Insert default weapon affinities
INSERT INTO affinities (name, type, description, max_tier) VALUES
    ('sword', 'weapon', 'Proficiency with swords, rapiers, and blade weapons', 7),
    ('axe', 'weapon', 'Mastery of axes, hatchets, and cleaving weapons', 7),
    ('bow', 'weapon', 'Skill with bows, crossbows, and ranged weapons', 7),
    ('staff', 'weapon', 'Expertise with staves, wands, and magical implements', 7),
    ('dagger', 'weapon', 'Precision with daggers, knives, and stealth weapons', 7),
    ('mace', 'weapon', 'Power with maces, hammers, and blunt weapons', 7),
    ('spear', 'weapon', 'Technique with spears, pikes, and polearms', 7),
    ('unarmed', 'weapon', 'Combat prowess with fists, claws, and natural weapons', 7);

-- Insert default magic affinities
INSERT INTO affinities (name, type, description, max_tier) VALUES
    ('fire', 'magic', 'Mastery of fire magic, flames, and heat-based spells', 7),
    ('ice', 'magic', 'Control over ice magic, frost, and cold-based spells', 7),
    ('lightning', 'magic', 'Command of lightning magic and electrical energy', 7),
    ('earth', 'magic', 'Dominion over earth magic, stone, and nature spells', 7),
    ('water', 'magic', 'Fluency with water magic, healing, and flow-based spells', 7),
    ('shadow', 'magic', 'Understanding of shadow magic, darkness, and illusion', 7),
    ('light', 'magic', 'Channeling of light magic, healing, and divine energy', 7),
    ('arcane', 'magic', 'Knowledge of arcane magic, pure energy, and scholarly spells', 7);

-- Create stored function to calculate experience required for next tier
CREATE OR REPLACE FUNCTION calculate_tier_experience(target_tier INTEGER)
RETURNS BIGINT AS $$
BEGIN
    -- Formula: 100 * (1.2 ^ tier) - cumulative experience needed
    IF target_tier <= 1 THEN
        RETURN 0;
    END IF;
    
    -- Calculate cumulative experience from tier 1 to target_tier
    RETURN FLOOR(100 * (POWER(1.2, target_tier) - 1.2) / (1.2 - 1));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create stored function to determine tier from experience
CREATE OR REPLACE FUNCTION calculate_tier_from_experience(experience BIGINT)
RETURNS INTEGER AS $$
DECLARE
    current_tier INTEGER := 1;
    required_exp BIGINT;
BEGIN
    -- Find the highest tier where experience meets the requirement
    FOR current_tier IN 1..7 LOOP
        required_exp := calculate_tier_experience(current_tier + 1);
        IF experience < required_exp THEN
            RETURN current_tier;
        END IF;
    END LOOP;
    
    -- If experience exceeds tier 7 requirements, return max tier
    RETURN 7;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Create trigger to automatically update tier when experience changes
CREATE OR REPLACE FUNCTION update_affinity_tier()
RETURNS TRIGGER AS $$
DECLARE
    new_tier INTEGER;
    old_tier INTEGER;
BEGIN
    -- Calculate new tier based on experience
    new_tier := calculate_tier_from_experience(NEW.experience);
    old_tier := OLD.tier;
    
    -- Update tier if it changed
    IF new_tier != old_tier THEN
        NEW.tier := new_tier;
        NEW.last_updated := CURRENT_TIMESTAMP;
        
        -- Log the tier change
        INSERT INTO affinity_log (
            character_id, affinity_id, experience_awarded, 
            previous_tier, new_tier, source
        ) VALUES (
            NEW.character_id, NEW.affinity_id, 
            NEW.experience - OLD.experience,
            old_tier, new_tier, 'combat'
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on character_affinities
CREATE TRIGGER trigger_update_affinity_tier
    BEFORE UPDATE OF experience ON character_affinities
    FOR EACH ROW
    EXECUTE FUNCTION update_affinity_tier();

-- Create view for character affinity summary with bonus calculations
CREATE VIEW character_affinity_summary AS
SELECT 
    ca.character_id,
    a.name as affinity_name,
    a.type as affinity_type,
    a.description,
    ca.experience,
    ca.tier,
    (ca.tier * 2) as bonus_percentage,
    calculate_tier_experience(ca.tier + 1) as next_tier_experience,
    (calculate_tier_experience(ca.tier + 1) - ca.experience) as experience_to_next_tier,
    ca.last_updated
FROM character_affinities ca
JOIN affinities a ON ca.affinity_id = a.id;

-- DOWN
-- Drop everything in reverse order
DROP VIEW IF EXISTS character_affinity_summary;
DROP TRIGGER IF EXISTS trigger_update_affinity_tier ON character_affinities;
DROP FUNCTION IF EXISTS update_affinity_tier();
DROP FUNCTION IF EXISTS calculate_tier_from_experience(BIGINT);
DROP FUNCTION IF EXISTS calculate_tier_experience(INTEGER);
DROP TABLE IF EXISTS affinity_log;
DROP TABLE IF EXISTS character_affinities;
DROP TABLE IF EXISTS affinities;