-- UP
-- Zone system for world navigation and exploration

-- Create zones table
CREATE TABLE zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    internal_name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL,
    zone_type VARCHAR(50) NOT NULL DEFAULT 'normal',
    level_range INT4RANGE,
    pvp_enabled BOOLEAN DEFAULT FALSE,
    safe_zone BOOLEAN DEFAULT FALSE,
    climate VARCHAR(50),
    terrain VARCHAR(50),
    lighting VARCHAR(50),
    features JSONB DEFAULT '{}'::jsonb,
    map_x INTEGER,
    map_y INTEGER,
    layer INTEGER DEFAULT 0,
    monster_spawn_rate DECIMAL(3,2) DEFAULT 0.0 CHECK (monster_spawn_rate >= 0.0 AND monster_spawn_rate <= 1.0),
    ambient_sounds JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CHECK (zone_type IN ('normal', 'dungeon', 'city', 'wilderness', 'cave', 'tower', 'arena', 'guild_hall', 'instance')),
    CHECK (climate IN ('temperate', 'tropical', 'arctic', 'desert', 'underground', 'magical', 'void')),
    CHECK (terrain IN ('plains', 'forest', 'mountain', 'swamp', 'desert', 'cave', 'water', 'urban', 'magical')),
    CHECK (lighting IN ('bright', 'dim', 'dark', 'magical', 'natural', 'artificial', 'none'))
);

-- Indexes for zones
CREATE INDEX idx_zones_internal_name ON zones (internal_name);
CREATE INDEX idx_zones_zone_type ON zones (zone_type);
CREATE INDEX idx_zones_level_range ON zones USING GIST (level_range);
CREATE INDEX idx_zones_map_coordinates ON zones (map_x, map_y, layer);
CREATE INDEX idx_zones_pvp_enabled ON zones (pvp_enabled);
CREATE INDEX idx_zones_safe_zone ON zones (safe_zone);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_zones_updated_at 
    BEFORE UPDATE ON zones 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert starter zones
INSERT INTO zones (internal_name, display_name, description, zone_type, level_range, pvp_enabled, safe_zone, climate, terrain, lighting, features, map_x, map_y, layer, monster_spawn_rate, ambient_sounds) VALUES
('starting_village', 'Novice Village', 'A peaceful village where new adventurers begin their journey. Cozy cottages line cobblestone streets, and friendly NPCs offer guidance to newcomers.', 'city', '[1,10]', false, true, 'temperate', 'urban', 'bright', '{"shops": ["general_store", "weaponsmith", "inn"], "npcs": ["village_elder", "trainer", "merchant"], "facilities": ["respawn_point", "bank", "guild_registrar"]}', 0, 0, 0, 0.0, '["birds_chirping", "village_chatter", "gentle_breeze"]'),

('meadow_path', 'Sunlit Meadow', 'A serene meadow with wildflowers swaying in the gentle breeze. The path here leads to various training grounds and nearby settlements.', 'normal', '[1,15]', false, false, 'temperate', 'plains', 'bright', '{"resources": ["herbs", "flowers"], "wildlife": ["rabbits", "butterflies"], "visibility": "excellent"}', 1, 0, 0, 0.1, '["wind_through_grass", "distant_birds", "rustling_leaves"]'),

('dark_forest', 'Whispering Woods', 'An ancient forest where shadows dance between towering trees. Strange sounds echo from the depths, and the air feels thick with mystery.', 'normal', '[10,25]', false, false, 'temperate', 'forest', 'dim', '{"dangers": ["wolf_packs", "bandits"], "resources": ["rare_herbs", "magical_mushrooms"], "mysteries": ["ancient_ruins", "fairy_circles"]}', 0, 1, 0, 0.3, '["owl_hoots", "branch_creaking", "mysterious_whispers"]'),

('crystal_caves', 'Luminous Crystal Caverns', 'Underground caverns illuminated by glowing crystals. The walls sparkle with precious gems, but dangerous creatures lurk in the deeper passages.', 'cave', '[15,40]', false, false, 'underground', 'cave', 'magical', '{"resources": ["crystals", "gems", "rare_ores"], "hazards": ["cave_ins", "toxic_gases"], "features": ["underground_lake", "crystal_formations"]}', -1, 0, -1, 0.4, '["crystal_chimes", "dripping_water", "distant_growls"]'),

('iron_peak', 'Iron Peak Summit', 'A treacherous mountain peak where only the brave dare to climb. The thin air and harsh winds test even experienced adventurers.', 'normal', '[25,50]', true, false, 'arctic', 'mountain', 'bright', '{"challenges": ["harsh_weather", "steep_cliffs"], "resources": ["rare_metals", "mountain_herbs"], "views": ["panoramic_vista", "distant_lands"]}', 0, -1, 1, 0.25, '["howling_wind", "avalanche_distant", "eagle_cries"]'),

('pvp_arena', 'Colosseum of Honor', 'A grand arena where warriors test their skills against each other. The roar of the crowd echoes through the ancient stone structure.', 'arena', '[1,999999]', true, false, 'temperate', 'urban', 'bright', '{"combat_zones": ["main_arena", "practice_ring"], "spectator_areas": ["noble_box", "common_stands"], "facilities": ["weapon_rack", "healing_station"]}', 2, 0, 0, 0.0, '["crowd_cheering", "clashing_weapons", "announcer_voice"]'),

('merchant_quarter', 'Grand Bazaar', 'A bustling marketplace where traders from across the realm gather to sell their wares. The air is filled with exotic scents and the sounds of commerce.', 'city', '[1,999999]', false, true, 'temperate', 'urban', 'bright', '{"shops": ["exotic_goods", "rare_weapons", "magical_items", "provisions"], "services": ["banking", "storage", "auction_house"], "attractions": ["fountain", "statue_plaza"]}', 1, 1, 0, 0.0, '["merchant_calls", "coin_clinking", "crowd_murmur"]');

-- DOWN
DROP TRIGGER IF EXISTS update_zones_updated_at ON zones;
DROP FUNCTION IF EXISTS update_updated_at_column();
DROP INDEX IF EXISTS idx_zones_safe_zone;
DROP INDEX IF EXISTS idx_zones_pvp_enabled;
DROP INDEX IF EXISTS idx_zones_map_coordinates;
DROP INDEX IF EXISTS idx_zones_level_range;
DROP INDEX IF EXISTS idx_zones_zone_type;
DROP INDEX IF EXISTS idx_zones_internal_name;
DROP TABLE IF EXISTS zones;