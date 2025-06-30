-- UP
-- Combat actions log table for detailed combat history

-- Create combat_actions_log table
CREATE TABLE combat_actions_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES combat_sessions(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    target_id UUID REFERENCES characters(id) ON DELETE SET NULL,
    action_type VARCHAR(20) NOT NULL,
    action_name VARCHAR(100) NOT NULL,
    damage INTEGER DEFAULT 0,
    healing INTEGER DEFAULT 0,
    mp_cost INTEGER DEFAULT 0,
    is_critical BOOLEAN DEFAULT FALSE,
    is_blocked BOOLEAN DEFAULT FALSE,
    is_missed BOOLEAN DEFAULT FALSE,
    status_effect_applied VARCHAR(50),
    description TEXT NOT NULL,
    turn_number INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (action_type IN ('attack', 'spell', 'heal', 'defend', 'item', 'special', 'flee')),
    CHECK (damage >= 0),
    CHECK (healing >= 0),
    CHECK (mp_cost >= 0),
    CHECK (turn_number >= 1),
    CHECK (status_effect_applied IN ('poison', 'burn', 'freeze', 'stun', 'blind', 'regeneration', 'shield', 'strength', 'weakness', 'haste', 'slow') OR status_effect_applied IS NULL)
);

-- Indexes for combat_actions_log
CREATE INDEX idx_combat_actions_session ON combat_actions_log (session_id);
CREATE INDEX idx_combat_actions_actor ON combat_actions_log (actor_id);
CREATE INDEX idx_combat_actions_target ON combat_actions_log (target_id);
CREATE INDEX idx_combat_actions_type ON combat_actions_log (action_type);
CREATE INDEX idx_combat_actions_turn ON combat_actions_log (turn_number);
CREATE INDEX idx_combat_actions_created_at ON combat_actions_log (created_at);
CREATE INDEX idx_combat_actions_session_turn ON combat_actions_log (session_id, turn_number);

-- Create function to calculate combat statistics
CREATE OR REPLACE FUNCTION get_combat_statistics(p_session_id UUID)
RETURNS TABLE (
    total_damage BIGINT,
    total_healing BIGINT,
    total_actions BIGINT,
    critical_hits BIGINT,
    blocks BIGINT,
    misses BIGINT,
    status_effects_applied BIGINT,
    turns_duration INTEGER,
    participant_stats JSONB
) AS $$
DECLARE
    v_participant_stats JSONB := '{}';
    v_participant RECORD;
    v_stats JSONB;
BEGIN
    -- Get aggregate statistics
    SELECT 
        COALESCE(SUM(damage), 0),
        COALESCE(SUM(healing), 0),
        COUNT(*),
        COUNT(*) FILTER (WHERE is_critical = TRUE),
        COUNT(*) FILTER (WHERE is_blocked = TRUE),
        COUNT(*) FILTER (WHERE is_missed = TRUE),
        COUNT(*) FILTER (WHERE status_effect_applied IS NOT NULL),
        MAX(turn_number)
    INTO total_damage, total_healing, total_actions, critical_hits, blocks, misses, status_effects_applied, turns_duration
    FROM combat_actions_log
    WHERE session_id = p_session_id;
    
    -- Get per-participant statistics
    FOR v_participant IN 
        SELECT DISTINCT actor_id 
        FROM combat_actions_log 
        WHERE session_id = p_session_id
    LOOP
        SELECT jsonb_build_object(
            'characterId', v_participant.actor_id,
            'characterName', c.name,
            'level', c.level,
            'damageTaken', COALESCE(p.damage_taken, 0),
            'damageDealt', COALESCE(SUM(cal.damage), 0),
            'healingDone', COALESCE(SUM(cal.healing), 0),
            'actionsUsed', COUNT(cal.*),
            'criticalHits', COUNT(*) FILTER (WHERE cal.is_critical = TRUE),
            'blocks', COUNT(*) FILTER (WHERE cal.is_blocked = TRUE),
            'statusEffectsApplied', COUNT(*) FILTER (WHERE cal.status_effect_applied IS NOT NULL)
        )
        INTO v_stats
        FROM combat_actions_log cal
        LEFT JOIN characters c ON c.id = v_participant.actor_id
        LEFT JOIN combat_participants p ON p.character_id = v_participant.actor_id AND p.session_id = p_session_id
        WHERE cal.session_id = p_session_id AND cal.actor_id = v_participant.actor_id
        GROUP BY c.name, c.level, p.damage_taken;
        
        v_participant_stats := v_participant_stats || jsonb_build_object(v_participant.actor_id::text, v_stats);
    END LOOP;
    
    participant_stats := v_participant_stats;
    
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Create function to process combat action with validation
CREATE OR REPLACE FUNCTION process_combat_action(
    p_session_id UUID,
    p_actor_id UUID,
    p_target_id UUID,
    p_action_type VARCHAR,
    p_action_name VARCHAR,
    p_damage INTEGER DEFAULT 0,
    p_healing INTEGER DEFAULT 0,
    p_mp_cost INTEGER DEFAULT 0,
    p_is_critical BOOLEAN DEFAULT FALSE,
    p_is_blocked BOOLEAN DEFAULT FALSE,
    p_is_missed BOOLEAN DEFAULT FALSE,
    p_status_effect VARCHAR DEFAULT NULL,
    p_description TEXT DEFAULT ''
) RETURNS UUID AS $$
DECLARE
    v_action_id UUID;
    v_turn_number INTEGER;
    v_session_status VARCHAR;
    v_participant_status VARCHAR;
BEGIN
    -- Validate session is active
    SELECT status INTO v_session_status 
    FROM combat_sessions 
    WHERE id = p_session_id;
    
    IF v_session_status != 'active' THEN
        RAISE EXCEPTION 'Combat session is not active';
    END IF;
    
    -- Validate participant is alive
    SELECT status INTO v_participant_status
    FROM combat_participants
    WHERE session_id = p_session_id AND character_id = p_actor_id;
    
    IF v_participant_status != 'alive' THEN
        RAISE EXCEPTION 'Participant is not alive';
    END IF;
    
    -- Get current turn number
    SELECT turn_number INTO v_turn_number
    FROM combat_sessions
    WHERE id = p_session_id;
    
    -- Insert action log
    INSERT INTO combat_actions_log (
        session_id, actor_id, target_id, action_type, action_name,
        damage, healing, mp_cost, is_critical, is_blocked, is_missed,
        status_effect_applied, description, turn_number
    ) VALUES (
        p_session_id, p_actor_id, p_target_id, p_action_type, p_action_name,
        p_damage, p_healing, p_mp_cost, p_is_critical, p_is_blocked, p_is_missed,
        p_status_effect, p_description, v_turn_number
    ) RETURNING id INTO v_action_id;
    
    -- Update participant stats
    UPDATE combat_participants SET
        damage_dealt = damage_dealt + p_damage,
        actions_used = actions_used + 1,
        last_action_at = CURRENT_TIMESTAMP,
        current_mp = GREATEST(0, current_mp - p_mp_cost)
    WHERE session_id = p_session_id AND character_id = p_actor_id;
    
    -- Update target if applicable
    IF p_target_id IS NOT NULL THEN
        UPDATE combat_participants SET
            damage_taken = damage_taken + p_damage,
            current_hp = GREATEST(0, current_hp - p_damage + p_healing),
            status = CASE 
                WHEN current_hp - p_damage + p_healing <= 0 THEN 'dead'::VARCHAR
                ELSE status 
            END
        WHERE session_id = p_session_id AND character_id = p_target_id;
    END IF;
    
    RETURN v_action_id;
END;
$$ LANGUAGE plpgsql;

-- DOWN
DROP FUNCTION IF EXISTS process_combat_action(UUID, UUID, UUID, VARCHAR, VARCHAR, INTEGER, INTEGER, INTEGER, BOOLEAN, BOOLEAN, BOOLEAN, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS get_combat_statistics(UUID);
DROP INDEX IF EXISTS idx_combat_actions_session_turn;
DROP INDEX IF EXISTS idx_combat_actions_created_at;
DROP INDEX IF EXISTS idx_combat_actions_turn;
DROP INDEX IF EXISTS idx_combat_actions_type;
DROP INDEX IF EXISTS idx_combat_actions_target;
DROP INDEX IF EXISTS idx_combat_actions_actor;
DROP INDEX IF EXISTS idx_combat_actions_session;
DROP TABLE IF EXISTS combat_actions_log;