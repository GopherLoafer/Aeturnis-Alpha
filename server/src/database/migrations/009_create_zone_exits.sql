-- UP
-- Zone exits system for movement between zones

-- Create zone_exits table
CREATE TABLE zone_exits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    to_zone_id UUID NOT NULL REFERENCES zones(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL,
    exit_type VARCHAR(30) NOT NULL DEFAULT 'normal',
    is_visible BOOLEAN DEFAULT TRUE,
    is_locked BOOLEAN DEFAULT FALSE,
    lock_type VARCHAR(50),
    required_level INTEGER DEFAULT 1,
    required_item_id UUID, -- Future reference to items table
    travel_message TEXT,
    reverse_direction VARCHAR(20),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE (from_zone_id, direction),
    CHECK (direction IN ('north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'enter', 'exit')),
    CHECK (exit_type IN ('normal', 'door', 'portal', 'teleporter', 'hidden', 'magical', 'ladder', 'stairs')),
    CHECK (reverse_direction IN ('north', 'south', 'east', 'west', 'northeast', 'northwest', 'southeast', 'southwest', 'up', 'down', 'enter', 'exit')),
    CHECK (lock_type IN ('key', 'level', 'quest', 'guild', 'password', 'magic', 'skill') OR lock_type IS NULL),
    CHECK (required_level >= 1 AND required_level <= 999999)
);

-- Indexes for zone_exits
CREATE INDEX idx_zone_exits_from_zone ON zone_exits (from_zone_id);
CREATE INDEX idx_zone_exits_to_zone ON zone_exits (to_zone_id);
CREATE INDEX idx_zone_exits_direction ON zone_exits (direction);
CREATE INDEX idx_zone_exits_visible ON zone_exits (is_visible);
CREATE INDEX idx_zone_exits_locked ON zone_exits (is_locked);
CREATE INDEX idx_zone_exits_required_level ON zone_exits (required_level);

-- Add trigger for updated_at
CREATE TRIGGER update_zone_exits_updated_at 
    BEFORE UPDATE ON zone_exits 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert starting zone exits
INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'north' as direction,
    'normal' as exit_type,
    true as is_visible,
    false as is_locked,
    1 as required_level,
    'You walk north along the winding path.' as travel_message,
    'south' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'starting_village' AND z2.internal_name = 'meadow_path';

INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'south' as direction,
    'normal' as exit_type,
    true as is_visible,
    false as is_locked,
    1 as required_level,
    'You return south to the village.' as travel_message,
    'north' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'meadow_path' AND z2.internal_name = 'starting_village';

INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'east' as direction,
    'normal' as exit_type,
    true as is_visible,
    false as is_locked,
    5 as required_level,
    'You venture east into the shadowy forest.' as travel_message,
    'west' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'meadow_path' AND z2.internal_name = 'dark_forest';

INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'west' as direction,
    'normal' as exit_type,
    true as is_visible,
    false as is_locked,
    5 as required_level,
    'You emerge west from the dark forest.' as travel_message,
    'east' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'dark_forest' AND z2.internal_name = 'meadow_path';

INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'down' as direction,
    'stairs' as exit_type,
    true as is_visible,
    false as is_locked,
    10 as required_level,
    'You descend the stone stairs into the crystal caverns.' as travel_message,
    'up' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'dark_forest' AND z2.internal_name = 'crystal_caves';

INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'up' as direction,
    'stairs' as exit_type,
    true as is_visible,
    false as is_locked,
    10 as required_level,
    'You climb up the stone stairs back to the forest.' as travel_message,
    'down' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'crystal_caves' AND z2.internal_name = 'dark_forest';

INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'north' as direction,
    'normal' as exit_type,
    true as is_visible,
    false as is_locked,
    20 as required_level,
    'You begin the treacherous climb north to Iron Peak.' as travel_message,
    'south' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'dark_forest' AND z2.internal_name = 'iron_peak';

INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'south' as direction,
    'normal' as exit_type,
    true as is_visible,
    false as is_locked,
    20 as required_level,
    'You carefully descend south from the mountain peak.' as travel_message,
    'north' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'iron_peak' AND z2.internal_name = 'dark_forest';

INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'west' as direction,
    'portal' as exit_type,
    true as is_visible,
    false as is_locked,
    1 as required_level,
    'You step through the shimmering portal to the arena.' as travel_message,
    'east' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'starting_village' AND z2.internal_name = 'pvp_arena';

INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'east' as direction,
    'portal' as exit_type,
    true as is_visible,
    false as is_locked,
    1 as required_level,
    'You step through the portal back to the village.' as travel_message,
    'west' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'pvp_arena' AND z2.internal_name = 'starting_village';

INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'east' as direction,
    'normal' as exit_type,
    true as is_visible,
    false as is_locked,
    1 as required_level,
    'You walk east to the bustling merchant quarter.' as travel_message,
    'west' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'starting_village' AND z2.internal_name = 'merchant_quarter';

INSERT INTO zone_exits (from_zone_id, to_zone_id, direction, exit_type, is_visible, is_locked, required_level, travel_message, reverse_direction) 
SELECT 
    z1.id as from_zone_id,
    z2.id as to_zone_id,
    'west' as direction,
    'normal' as exit_type,
    true as is_visible,
    false as is_locked,
    1 as required_level,
    'You return west to the village center.' as travel_message,
    'east' as reverse_direction
FROM zones z1, zones z2 
WHERE z1.internal_name = 'merchant_quarter' AND z2.internal_name = 'starting_village';

-- DOWN
DROP TRIGGER IF EXISTS update_zone_exits_updated_at ON zone_exits;
DROP INDEX IF EXISTS idx_zone_exits_required_level;
DROP INDEX IF EXISTS idx_zone_exits_locked;
DROP INDEX IF EXISTS idx_zone_exits_visible;
DROP INDEX IF EXISTS idx_zone_exits_direction;
DROP INDEX IF EXISTS idx_zone_exits_to_zone;
DROP INDEX IF EXISTS idx_zone_exits_from_zone;
DROP TABLE IF EXISTS zone_exits;