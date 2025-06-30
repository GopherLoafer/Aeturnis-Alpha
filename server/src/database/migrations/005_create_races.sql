-- UP
-- Races table for MMORPG playable races
CREATE TABLE races (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT NOT NULL,
    lore TEXT,
    
    -- Stat modifiers (default to 0)
    strength_modifier INTEGER NOT NULL DEFAULT 0,
    vitality_modifier INTEGER NOT NULL DEFAULT 0,
    dexterity_modifier INTEGER NOT NULL DEFAULT 0,
    intelligence_modifier INTEGER NOT NULL DEFAULT 0,
    wisdom_modifier INTEGER NOT NULL DEFAULT 0,
    
    -- Progression bonuses (range -0.5 to +1.0)
    experience_bonus DECIMAL(3,2) NOT NULL DEFAULT 0.00 CHECK (experience_bonus >= -0.50 AND experience_bonus <= 1.00),
    weapon_affinity_bonus DECIMAL(3,2) NOT NULL DEFAULT 0.00 CHECK (weapon_affinity_bonus >= -0.50 AND weapon_affinity_bonus <= 1.00),
    magic_affinity_bonus DECIMAL(3,2) NOT NULL DEFAULT 0.00 CHECK (magic_affinity_bonus >= -0.50 AND magic_affinity_bonus <= 1.00),
    
    -- Starting values
    starting_health INTEGER NOT NULL DEFAULT 100,
    starting_mana INTEGER NOT NULL DEFAULT 50,
    starting_zone VARCHAR(100) NOT NULL DEFAULT 'starter_zone',
    starting_gold INTEGER NOT NULL DEFAULT 100,
    
    -- Special traits and abilities
    special_abilities JSONB DEFAULT '[]'::jsonb,
    racial_traits JSONB DEFAULT '[]'::jsonb,
    equipment_restrictions JSONB DEFAULT '{}'::jsonb,
    
    -- Regeneration rates (per second)
    health_regen_rate DECIMAL(5,2) NOT NULL DEFAULT 1.00,
    mana_regen_rate DECIMAL(5,2) NOT NULL DEFAULT 2.00,
    
    -- Available customizations
    available_customizations JSONB DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_races_name ON races(name);
CREATE INDEX idx_races_created_at ON races(created_at);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_races_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER races_update_trigger
    BEFORE UPDATE ON races
    FOR EACH ROW
    EXECUTE FUNCTION update_races_updated_at();

-- Insert the 8 starting races
INSERT INTO races (name, description, lore, strength_modifier, vitality_modifier, dexterity_modifier, intelligence_modifier, wisdom_modifier, 
                  experience_bonus, weapon_affinity_bonus, magic_affinity_bonus, starting_health, starting_mana, starting_zone, starting_gold,
                  special_abilities, racial_traits, equipment_restrictions, health_regen_rate, mana_regen_rate, available_customizations) VALUES

-- Human - Balanced and versatile
('Human', 
 'Adaptable and resourceful beings known for their determination and balanced capabilities.', 
 'Humans are the most numerous race in Aeturnis, known for their adaptability and drive to explore every corner of the realm.',
 0, 0, 0, 0, 0, 0.10, 0.05, 0.05, 120, 80, 'human_capital', 150,
 '["Adaptability", "Quick Learning"]'::jsonb,
 '["Versatile", "Diplomatic", "Resourceful"]'::jsonb,
 '{}'::jsonb,
 1.20, 2.50,
 '{"hair_colors": ["brown", "black", "blonde", "red"], "eye_colors": ["brown", "blue", "green", "hazel"], "skin_tones": ["fair", "olive", "tan", "dark"]}'::jsonb),

-- Elf - Magical and agile
('Elf', 
 'Graceful and long-lived beings with a natural affinity for magic and archery.', 
 'Ancient guardians of the mystical forests, elves possess centuries of wisdom and unmatched magical prowess.',
 -1, -1, 2, 2, 1, 0.05, 0.15, 0.20, 90, 120, 'elven_grove', 120,
 '["Nature Magic", "Enhanced Senses", "Longevity"]'::jsonb,
 '["Forest Affinity", "Magic Resistance", "Keen Sight"]'::jsonb,
 '{"heavy_armor": false}'::jsonb,
 0.80, 3.00,
 '{"hair_colors": ["silver", "gold", "auburn", "white"], "eye_colors": ["emerald", "sapphire", "violet", "gold"], "ear_shapes": ["pointed", "curved"]}'::jsonb),

-- Dwarf - Strong and resilient
('Dwarf', 
 'Sturdy mountain dwellers renowned for their craftsmanship and battle prowess.', 
 'Masters of forge and hammer, dwarves have carved their legacy deep within the mountain halls of Aeturnis.',
 2, 2, -1, -1, 0, 0.00, 0.20, -0.10, 150, 60, 'mountain_hold', 200,
 '["Smithing Mastery", "Stone Sense", "Alcohol Tolerance"]'::jsonb,
 '["Mountain Born", "Weapon Expertise", "Poison Resistance"]'::jsonb,
 '{"light_armor": false, "robes": false}'::jsonb,
 1.50, 1.50,
 '{"beard_styles": ["braided", "long", "short", "decorated"], "hair_colors": ["brown", "black", "red", "gray"], "eye_colors": ["brown", "green", "blue"]}'::jsonb),

-- Orc - Powerful warriors
('Orc', 
 'Fierce tribal warriors with incredible physical strength and battle instincts.', 
 'Born from the harsh wastelands, orcs have survived through strength and tribal unity, earning respect through combat.',
 3, 1, 0, -2, -1, 0.05, 0.25, -0.20, 140, 40, 'orc_stronghold', 80,
 '["Battle Fury", "Intimidation", "Night Vision"]'::jsonb,
 '["Savage Strength", "Thick Skin", "Warrior Culture"]'::jsonb,
 '{"light_armor": false, "cloth_armor": false}'::jsonb,
 1.80, 1.00,
 '{"skin_colors": ["green", "brown", "gray"], "tusk_sizes": ["small", "medium", "large"], "war_paint": ["tribal", "clan", "battle"]}'::jsonb),

-- Halfling - Lucky and nimble
('Halfling', 
 'Small but courageous folk known for their luck, stealth, and love of comfort.', 
 'Peaceful inhabitants of rolling hills and fertile valleys, halflings possess an uncanny ability to avoid trouble and find fortune.',
 -2, 0, 3, 0, 1, 0.08, 0.10, 0.05, 80, 70, 'halfling_shire', 180,
 '["Lucky", "Stealth Mastery", "Small Size"]'::jsonb,
 '["Natural Luck", "Nimble", "Brave Heart"]'::jsonb,
 '{"heavy_armor": false, "large_weapons": false}'::jsonb,
 1.00, 2.20,
 '{"hair_colors": ["brown", "black", "sandy", "red"], "eye_colors": ["brown", "green", "blue"], "foot_hair": ["curly", "straight", "thick"]}'::jsonb),

-- Dragonborn - Draconic heritage
('Dragonborn', 
 'Proud descendants of dragons with scales, breath weapons, and draconic pride.', 
 'Born from the union of dragon and mortal magic, dragonborn carry the legacy of their draconic ancestors in their very blood.',
 1, 1, 0, 1, 0, 0.00, 0.15, 0.15, 130, 90, 'dragon_peak', 100,
 '["Breath Weapon", "Draconic Ancestry", "Scale Armor"]'::jsonb,
 '["Dragon Heritage", "Elemental Resistance", "Intimidating Presence"]'::jsonb,
 '{}'::jsonb,
 1.30, 2.00,
 '{"scale_colors": ["red", "blue", "green", "black", "white", "gold", "silver", "bronze"], "breath_types": ["fire", "cold", "lightning", "acid", "poison"]}'::jsonb),

-- Tiefling - Infernal heritage
('Tiefling', 
 'Beings touched by infernal magic, bearing horns, tails, and supernatural abilities.', 
 'Marked by ancient pacts with fiendish powers, tieflings struggle against prejudice while wielding their inherited magical gifts.',
 0, 0, 1, 2, 0, 0.05, 0.00, 0.25, 100, 110, 'shadowlands', 120,
 '["Infernal Magic", "Fire Resistance", "Darkness Vision"]'::jsonb,
 '["Fiendish Heritage", "Supernatural Charisma", "Magic Affinity"]'::jsonb,
 '{"holy_items": false}'::jsonb,
 1.00, 2.80,
 '{"horn_styles": ["curved", "straight", "spiraled", "broken"], "tail_types": ["long", "short", "barbed"], "skin_colors": ["red", "purple", "blue", "gray"], "eye_colors": ["red", "gold", "silver", "black"]}'::jsonb),

-- Gnome - Small magical tinkerers
('Gnome', 
 'Tiny but brilliant inventors and scholars with a natural connection to magic and mechanisms.', 
 'Living in harmony with nature and technology, gnomes are renowned throughout Aeturnis for their inventions and magical research.',
 -1, -1, 1, 3, 1, 0.12, 0.05, 0.30, 70, 130, 'gnome_workshop', 160,
 '["Tinker Mastery", "Illusion Magic", "Small Size"]'::jsonb,
 '["Inventive Genius", "Magic Resistance", "Keen Mind"]'::jsonb,
 '{"heavy_armor": false, "large_weapons": false}'::jsonb,
 0.90, 3.50,
 '{"hair_colors": ["white", "gray", "brown", "blue", "green"], "eye_colors": ["bright_blue", "green", "purple", "gold"], "beard_styles": ["long", "braided", "wild", "neat"]}'::jsonb);

-- DOWN
DROP TRIGGER IF EXISTS races_update_trigger ON races;
DROP FUNCTION IF EXISTS update_races_updated_at();
DROP INDEX IF EXISTS idx_races_created_at;
DROP INDEX IF EXISTS idx_races_name;
DROP TABLE IF EXISTS races;