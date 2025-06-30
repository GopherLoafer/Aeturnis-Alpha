-- Character Stats View
-- Combines character base stats with race modifiers for calculated total stats

CREATE OR REPLACE VIEW character_stats AS
SELECT 
    c.id,
    c.user_id,
    c.race_id,
    c.name,
    c.gender,
    c.level,
    c.experience,
    c.next_level_exp,
    c.titles,
    c.status,
    
    -- Race information
    r.name as race_name,
    r.description as race_description,
    
    -- Base stats
    c.strength as base_strength,
    c.vitality as base_vitality,
    c.dexterity as base_dexterity,
    c.intelligence as base_intelligence,
    c.wisdom as base_wisdom,
    
    -- Race modifiers
    r.strength_modifier,
    r.vitality_modifier,
    r.dexterity_modifier,
    r.intelligence_modifier,
    r.wisdom_modifier,
    
    -- Total stats (base + race modifier)
    (c.strength + r.strength_modifier) as total_strength,
    (c.vitality + r.vitality_modifier) as total_vitality,
    (c.dexterity + r.dexterity_modifier) as total_dexterity,
    (c.intelligence + r.intelligence_modifier) as total_intelligence,
    (c.wisdom + r.wisdom_modifier) as total_wisdom,
    
    -- Resources
    c.health,
    c.max_health,
    c.mana,
    c.max_mana,
    
    -- Location
    c.current_zone,
    c.position_x,
    c.position_y,
    c.spawn_zone,
    
    -- Inventory
    c.gold,
    c.inventory_slots,
    c.bank_slots,
    c.weight_capacity,
    c.current_weight,
    
    -- Race bonuses
    r.experience_bonus,
    r.weapon_affinity_bonus,
    r.magic_affinity_bonus,
    r.health_regen_rate,
    r.mana_regen_rate,
    
    -- Race traits
    r.special_abilities,
    r.racial_traits,
    r.equipment_restrictions,
    
    -- Customization
    c.appearance,
    c.active_title,
    c.settings,
    
    -- Lifecycle
    c.created_at,
    c.last_active,
    c.deleted_at,
    c.updated_at
    
FROM characters c
JOIN races r ON c.race_id = r.id
WHERE c.deleted_at IS NULL;