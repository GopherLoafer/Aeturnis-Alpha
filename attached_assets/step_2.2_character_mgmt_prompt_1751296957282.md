# 🧝‍♂️ Step 2.2 – Character Management System

**Prompt ID:** `character-mgmt-v1`  
**From:** Claude  
**To:** Replit Agent AI  
**Purpose:** Implement character creation, listing, selection, and deletion logic with API endpoints

---

## 🎯 Overview

You are implementing the core business logic and REST API for managing player characters in Aeturnis Online. This includes creating new characters, selecting one for play, listing all characters for an account, and soft-deleting characters.

---

## 📦 Requirements

### 1. CharacterService (`src/services/CharacterService.ts`)
Implement the following methods:

```ts
class CharacterService {
  async createCharacter(userId: string, dto: CreateCharacterDto): Promise<Character>
  async getUserCharacters(userId: string): Promise<Character[]>
  async getCharacter(characterId: string, userId: string): Promise<CharacterFullData>
  async selectCharacter(characterId: string, userId: string): Promise<CharacterFullData>
  async deleteCharacter(characterId: string, userId: string): Promise<void>
}
```

Functionality:
- Enforce a max of 5 characters per user
- Validate race and name using RaceRepository
- Calculate starting stats/resources using race modifiers
- Bind character to user’s spawn zone
- Cache key: `char:{characterId}:data` (if ready for caching layer)

---

### 2. CharacterController (`src/controllers/CharacterController.ts`)
Define routes with proper guards:

| Method | Path                 | Description                        |
|--------|----------------------|------------------------------------|
| GET    | `/api/characters`    | List all characters for user       |
| POST   | `/api/characters`    | Create new character               |
| GET    | `/api/characters/:id`| Get single character (ownership)   |
| POST   | `/api/characters/:id/select` | Select character for session |
| DELETE | `/api/characters/:id`| Soft-delete a character            |

---

### 3. DTO + Validation

- `CreateCharacterDto`:
  - name: string (3–20 chars, alphanumeric, no duplicates)
  - raceId: UUID
  - gender: enum ['male', 'female', 'neutral', 'other']
  - appearance: optional JSONB object

- Use express-validator or class-validator to enforce schema

---

### 4. Character Creation Flow

- Validate user ID and character limit
- Validate race from DB
- Check name availability and profanity
- Apply race stat modifiers
- Assign spawn zone
- Save in DB (transactional)
- Return character with full details

---

### 5. Socket & Session Integration

- When selecting character:
  - Update session data with `characterId`
  - Join `zone:{zoneName}` and `character:{characterId}` rooms via Socket.io

---

### 6. Audit Logging

- Log all creation and deletion actions in `audit_log`
- Track user ID, action type, character ID, timestamp

---

## 🔐 Best Practices

- Use typed interfaces and DTOs
- Validate all inputs and ownership
- Use transaction wrapper for character creation
- Handle soft deletion securely (set `deleted_at`)
- Return consistent error formats `{ error: { code, message } }`

---

## 📎 Output Files

- `src/services/CharacterService.ts`
- `src/controllers/CharacterController.ts`
- `src/types/character.types.ts` (extend if needed)
- Update `src/routes/character.routes.ts` or similar

---

When complete, return an implementation report.
