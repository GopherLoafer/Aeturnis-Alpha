-- UP
-- Character location tracking for zone movement system

-- Create character_locations table
CREATE TABLE character_locations (
    character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE RESTRICT,
    instance_id UUID, -- For instanced zones/dungeons
    x INTEGER DEFAULT 0,
    y INTEGER DEFAULT 0,
    last_movement TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    total_zones_visited INTEGER DEFAULT 1,
    distance_traveled BIGINT DEFAULT 0,
    unique_zones_visited TEXT[] DEFAULT ARRAY[]::TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for character_locations
CREATE INDEX idx_character_locations_zone_id ON character_locations (zone_id);
CREATE INDEX idx_character_locations_instance_id ON character_locations (instance_id);
CREATE INDEX idx_character_locations_last_movement ON character_locations (last_movement);
CREATE INDEX idx_character_locations_coordinates ON character_locations (x, y);

-- Add trigger for updated_at
CREATE TRIGGER update_character_locations_updated_at 
    BEFORE UPDATE ON character_locations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create movement_log table for tracking character movement history
CREATE TABLE movement_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    from_zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
    to_zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    direction VARCHAR(20),
    movement_type VARCHAR(30) DEFAULT 'normal',
    travel_time INTEGER DEFAULT 0, -- In milliseconds
    distance_units INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (movement_type IN ('normal', 'teleport', 'recall', 'summon', 'forced', 'respawn')),
    CHECK (direction IN ('north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'enter', 'exit') OR direction IS NULL)
);

-- Indexes for movement_log
CREATE INDEX idx_movement_log_character_id ON movement_log (character_id);
CREATE INDEX idx_movement_log_from_zone ON movement_log (from_zone_id);
CREATE INDEX idx_movement_log_to_zone ON movement_log (to_zone_id);
CREATE INDEX idx_movement_log_created_at ON movement_log (created_at);
CREATE INDEX idx_movement_log_movement_type ON movement_log (movement_type);

-- Initialize character locations for existing characters
INSERT INTO character_locations (character_id, zone_id, unique_zones_visited)
SELECT 
    c.id as character_id,
    z.id as zone_id,
    ARRAY[z.internal_name] as unique_zones_visited
FROM characters c
CROSS JOIN zones z
WHERE c.deleted_at IS NULL 
AND z.internal_name = 'starting_village'
ON CONFLICT (character_id) DO NOTHING;

-- Create function to update character location and track movement
CREATE OR REPLACE FUNCTION update_character_location(
    p_character_id UUID,
    p_new_zone_id UUID,
    p_direction VARCHAR(20) DEFAULT NULL,
    p_movement_type VARCHAR(30) DEFAULT 'normal',
    p_travel_time INTEGER DEFAULT 0
) RETURNS VOID AS $$
DECLARE
    v_old_zone_id UUID;
    v_zone_internal_name TEXT;
    v_unique_zones TEXT[];
    v_zones_visited INTEGER;
    v_distance_traveled BIGINT;
BEGIN
    -- Get current location
    SELECT zone_id, unique_zones_visited, total_zones_visited, distance_traveled
    INTO v_old_zone_id, v_unique_zones, v_zones_visited, v_distance_traveled
    FROM character_locations
    WHERE character_id = p_character_id;
    
    -- Get new zone internal name
    SELECT internal_name INTO v_zone_internal_name
    FROM zones WHERE id = p_new_zone_id;
    
    -- Check if this is a new unique zone
    IF NOT (v_zone_internal_name = ANY(v_unique_zones)) THEN
        v_unique_zones := array_append(v_unique_zones, v_zone_internal_name);
        v_zones_visited := v_zones_visited + 1;
    END IF;
    
    -- Update character location
    UPDATE character_locations SET
        zone_id = p_new_zone_id,
        last_movement = CURRENT_TIMESTAMP,
        total_zones_visited = v_zones_visited,
        distance_traveled = v_distance_traveled + 1,
        unique_zones_visited = v_unique_zones,
        updated_at = CURRENT_TIMESTAMP
    WHERE character_id = p_character_id;
    
    -- Log the movement
    INSERT INTO movement_log (
        character_id,
        from_zone_id,
        to_zone_id,
        direction,
        movement_type,
        travel_time,
        distance_units
    ) VALUES (
        p_character_id,
        v_old_zone_id,
        p_new_zone_id,
        p_direction,
        p_movement_type,
        p_travel_time,
        1
    );
    
    -- Update character's current zone in main table
    UPDATE characters SET 
        current_zone_id = p_new_zone_id,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_character_id;
    
END;
$$ LANGUAGE plpgsql;

-- Create function to get characters in a zone
CREATE OR REPLACE FUNCTION get_characters_in_zone(p_zone_id UUID)
RETURNS TABLE (
    character_id UUID,
    character_name VARCHAR,
    level INTEGER,
    race_name VARCHAR,
    active_title VARCHAR,
    x INTEGER,
    y INTEGER,
    last_movement TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id as character_id,
        c.name as character_name,
        c.level,
        r.name as race_name,
        c.active_title,
        cl.x,
        cl.y,
        cl.last_movement
    FROM character_locations cl
    JOIN characters c ON cl.character_id = c.id
    JOIN races r ON c.race_id = r.id
    WHERE cl.zone_id = p_zone_id
    AND c.deleted_at IS NULL
    ORDER BY cl.last_movement DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to check movement cooldown
CREATE OR REPLACE FUNCTION check_movement_cooldown(
    p_character_id UUID,
    p_cooldown_seconds INTEGER DEFAULT 1
) RETURNS BOOLEAN AS $$
DECLARE
    v_last_movement TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT last_movement INTO v_last_movement
    FROM character_locations
    WHERE character_id = p_character_id;
    
    IF v_last_movement IS NULL THEN
        RETURN TRUE;
    END IF;
    
    RETURN (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - v_last_movement)) >= p_cooldown_seconds);
END;
$$ LANGUAGE plpgsql;

-- DOWN
DROP FUNCTION IF EXISTS check_movement_cooldown(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_characters_in_zone(UUID);
DROP FUNCTION IF EXISTS update_character_location(UUID, UUID, VARCHAR, VARCHAR, INTEGER);
DROP TRIGGER IF EXISTS update_character_locations_updated_at ON character_locations;
DROP INDEX IF EXISTS idx_movement_log_movement_type;
DROP INDEX IF EXISTS idx_movement_log_created_at;
DROP INDEX IF EXISTS idx_movement_log_to_zone;
DROP INDEX IF EXISTS idx_movement_log_from_zone;
DROP INDEX IF EXISTS idx_movement_log_character_id;
DROP TABLE IF EXISTS movement_log;
DROP INDEX IF EXISTS idx_character_locations_coordinates;
DROP INDEX IF EXISTS idx_character_locations_last_movement;
DROP INDEX IF EXISTS idx_character_locations_instance_id;
DROP INDEX IF EXISTS idx_character_locations_zone_id;
DROP TABLE IF EXISTS character_locations;