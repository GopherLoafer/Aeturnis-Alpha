# 🧬 Step 2.1 – Character System Database Design

**Prompt ID:** `character-db-v1`  
**From:** Claude  
**To:** Replit Agent AI  
**Purpose:** Implement the races and characters schema for Aeturnis Online’s MMORPG backend

---

## 📘 Overview

This step defines the core database structure for player characters and playable races. The schema must support scalable MMO gameplay, rich stat modeling, and flexible character creation.

---

## 🛠️ Requirements

### 1. Races Table (`005_create_races.sql`)
- UUID primary key
- Fields:
  - `name`, `description`, `lore`
  - Stat modifiers: `strength_modifier`, `intelligence_modifier`, etc.
  - Progression bonuses: `experience_bonus`, `weapon_affinity_bonus`, `magic_affinity_bonus`
  - Starting values: health, mana, zone, gold
  - Traits: `special_abilities`, `racial_traits`, `equipment_restrictions`
  - Regeneration: `health_regen_rate`, `mana_regen_rate`
  - `available_customizations` (JSONB)
  - Timestamps

- Constraints:
  - Stat modifiers default to 0
  - Bonuses range -0.5 to +1.0
  - Insert all 8 starting races

---

### 2. Characters Table (`006_create_characters.sql`)
- UUID primary key, FK to `users` and `races`
- Fields:
  - Identity: `name`, `gender`, `user_id`, `race_id`
  - Progression: `level`, `experience`, `next_level_exp`, `titles`, `status`
  - Stats: `strength`, `vitality`, `dexterity`, `intelligence`, `wisdom`
  - Resources: current/max `health`, `mana`
  - Location: `current_zone`, `position_x`, `position_y`, `spawn_zone`
  - Inventory: `gold`, `inventory_slots`, `bank_slots`, `weight_capacity`, `current_weight`
  - Customization: `appearance`, `active_title`, `settings`
  - Lifecycle: `created_at`, `last_active`, `deleted_at`

- Constraints:
  - `level >= 1`, experience as NUMERIC(40,0)
  - `status` in (`normal`, `combat`, `dead`, `busy`)
  - Validation for resource bounds (e.g. `health <= max_health`)

- Indexes:
  - On `user_id`, `last_active`, `zone`, `level`
  - Partial index for `deleted_at IS NULL`

---

### 3. Character Stats View
- Derived columns combining base stats with race modifiers:
  - `total_strength = c.strength + r.strength_modifier`, etc.
- Join `characters` and `races`
- Include race name and bonuses

---

### 4. Character Repository (`CharacterRepository.ts`)
- Create TypeScript repository for character data access:
```ts
class CharacterRepository {
  async create(userId, data): Promise<Character>
  async findById(id): Promise<Character | null>
  async findByUserId(userId): Promise<Character[]>
  async updateStats(id, partialStats)
  async updateLocation(id, zone, x, y)
  async updateResources(id, health, mana)
  async softDelete(id)
}
```

---

## 🔐 Best Practices

- Use parameterized queries
- Validate foreign keys and input constraints
- Add comments and typings to all SQL fields
- Modularize repo logic for extensibility
- Use enums/constants for `status`, `gender`, `title` types

---

## 📎 Output

- SQL files in `/server/src/database/migrations/`
- TypeScript repo in `/server/src/repositories/CharacterRepository.ts`
- View file in `/server/src/database/views/character_stats.sql`

---

Begin implementation and provide a report upon completion.
