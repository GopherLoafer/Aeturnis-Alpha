# Replit.md

## Overview

This is a Node.js/TypeScript backend application built with Express.js. The project appears to be in its initial setup phase, with dependencies configured for a secure web API that includes authentication, database connectivity, caching, and comprehensive logging capabilities.

## System Architecture

The application follows a modern MMORPG backend architecture with the following stack:
- **Runtime**: Node.js with TypeScript
- **Web Framework**: Express.js with comprehensive security middleware
- **Database**: PostgreSQL with migration system and repository pattern
- **Caching**: Redis for session management and rate limiting
- **Authentication**: JWT with Argon2id password hashing and dual tokens
- **Validation**: Zod for schema validation and input sanitization
- **Logging**: Winston for structured logging and audit trails
- **Migration System**: Custom PostgreSQL migration runner with up/down support

## Key Components

### Core Dependencies
- **Express.js**: Web application framework for handling HTTP requests and routing
- **TypeScript**: Provides type safety and better development experience
- **Zod**: Runtime type checking and validation for API inputs
- **Winston**: Professional logging with multiple transport options

### Security & Authentication
- **JWT (jsonwebtoken)**: Token-based authentication system
- **Argon2 & bcryptjs**: Password hashing libraries for secure credential storage
- **Helmet**: Security middleware for Express apps
- **CORS**: Cross-origin resource sharing configuration
- **express-rate-limit**: API rate limiting for DDoS protection

### Database & Caching
- **PostgreSQL (pg)**: Primary relational database
- **Redis (ioredis)**: In-memory caching and session storage

### Development Tools
- **tsx**: TypeScript execution for development
- **tsc-alias**: Path alias resolution for TypeScript compilation
- **dotenv**: Environment variable management

## Data Flow

The application is designed to handle the following typical flow:
1. **Request Reception**: Express receives HTTP requests
2. **Security Middleware**: Helmet and CORS handle security headers
3. **Rate Limiting**: express-rate-limit prevents abuse
4. **Authentication**: JWT tokens validated for protected routes
5. **Validation**: Zod schemas validate request data
6. **Database Operations**: PostgreSQL for persistent data storage
7. **Caching**: Redis for temporary data and session management
8. **Logging**: Winston captures all activities and errors
9. **Response**: JSON responses sent back to clients

## External Dependencies

### Database Systems
- **PostgreSQL**: Primary database for persistent data storage
- **Redis**: Caching layer and session storage

### Security Libraries
- **Argon2/bcryptjs**: Industry-standard password hashing
- **JWT**: Stateless authentication tokens

### Utility Libraries
- **UUID**: Unique identifier generation
- **dotenv**: Environment configuration management

## Deployment Strategy

The application is configured for flexible deployment with:
- Environment-based configuration through dotenv
- TypeScript compilation with path alias support
- Production-ready security middleware
- Comprehensive logging for monitoring
- Rate limiting for API protection

The setup suggests preparation for containerized deployment or cloud platform hosting.

## Recent Changes

### Character System Database Design (June 30, 2025) - Step 2.1
- Complete races table with 8 playable races (Human, Elf, Dwarf, Orc, Halfling, Dragonborn, Tiefling, Gnome)
- Enhanced characters table with race relationships, UUID primary keys, and comprehensive stat system
- Character stats view combining base stats with race modifiers for calculated totals
- Production-ready CharacterRepository with race bonus calculations and soft deletion
- Character type definitions with comprehensive interfaces and validation constants
- Database migration system updated with proper race and character schema
- Stat system supporting strength, vitality, dexterity, intelligence, and wisdom
- Rich character progression with experience tracking, titles, and customization
- Inventory management with weight capacity and slot limitations
- Location tracking with current zone, position coordinates, and spawn zones

### Character Management System (June 30, 2025) - Step 2.2
- Complete CharacterService with business logic for character creation, listing, selection, and deletion
- Production-ready CharacterController with 7 REST API endpoints and comprehensive validation
- Input validation using express-validator with custom rules for character names and race validation
- Character creation with automatic race bonus application and 5-character limit enforcement
- Name availability checking with alphanumeric validation and profanity protection
- Character selection system with last active timestamp updates and audit logging
- Soft deletion implementation with ownership verification and cache invalidation
- Redis-based caching for character data, race information, and session management
- Rate limiting integration with different tiers for creation, selection, and general operations
- Comprehensive error handling with specific error codes and user-friendly messages
- Integration layer for mounting character routes in Express application
- Full TypeScript integration with existing authentication middleware

### Infinite Progression System (June 30, 2025) - Step 2.3
- Complete ProgressionService with exponential experience curve calculation using BigInt for large numbers
- 7 progression phases from Novice to Legendary with phase-based bonuses and titles
- Experience award system with race bonuses, phase multipliers, and automatic level calculations
- Milestone reward system with stat points, gold, titles, and achievement tracking
- Comprehensive logging with experience_log, level_up_log, and milestone_achievements tables
- ProgressionController with 8 REST API endpoints for experience management and statistics
- BigInt support for handling billions of experience points and extreme high-level characters
- Exponential scaling formula (1000 * 1.15^level) for balanced infinite progression
- Phase transition system with automatic title awards and stat point scaling
- Redis-based caching for progression data with performance optimization
- Transaction-based level up processing ensuring data consistency
- Complete audit trail for all experience gains and character progression events

### Zone and Movement System (June 30, 2025) - Step 2.4
- Complete zone system with 7 starter zones featuring rich environmental descriptions and varied themes
- Zone classification system supporting normal, dungeon, city, wilderness, cave, tower, arena, and guild hall types
- Comprehensive zone exits system with 12 directional movement and multiple exit types (normal, portal, stairs, etc.)
- Level-based access control with requirement validation and descriptive error messaging
- Character location tracking with real-time position updates and exploration statistics
- Movement validation system with 1-second cooldowns and comprehensive error code handling
- ZoneService with zone information retrieval, player presence tracking, and look command functionality
- MovementService with character movement logic, teleportation support, and movement history
- MovementController with 8 REST API endpoints including move, look, zone info, and search capabilities
- Database schema with 3 core tables (zones, zone_exits, character_locations) and PostgreSQL stored functions
- Redis-based caching for zone information with 5-minute TTL and automatic cache invalidation
- Real-time movement broadcasting preparation for Socket.io integration with zone entry/exit events

### Combat System Foundation (June 30, 2025) - Step 2.5
- Complete turn-based combat engine with initiative system, turn order management, and specification-compliant damage calculation
- 3 core database tables (combat_sessions, combat_participants, combat_actions_log) with optimized indexes and constraints
- Initiative-based turn system using Dexterity + Level + 1d20 roll for tactical depth and fair turn order
- Advanced damage formula: Math.max(1, (STR - VIT) * weaponCoef) with vitality-based damage reduction
- Dynamic critical hit system: 5% + DEX/200 scaling with 1.5x damage multiplier for strategic character builds
- Comprehensive status effects system supporting poison, burn, freeze, stun, regeneration, and buffs/debuffs
- EquipmentService integration with weapon coefficient system for equipment-based damage scaling
- CombatService with 25+ methods handling encounter creation, action processing, and state management
- 7 REST API endpoints with combat-specific rate limiting (20 actions per 5 seconds) and comprehensive validation
- Real-time Socket.io integration with combat rooms and event broadcasting for live combat updates
- Combat statistics tracking with per-participant metrics, damage/healing totals, and performance analytics
- Production-ready error handling with 12 specific combat error codes and graceful degradation
- Formula alignment patch ensuring mathematical accuracy and specification compliance
- Comprehensive unit test suite validating damage calculations and critical hit scaling
- Performance optimized with Redis caching, connection pooling, and sub-100ms action processing

### Affinity System Integration (June 30, 2025) - Step 2.6
- Complete affinity database schema with character_affinities and affinity_experience_log tables  
- Production-ready AffinityService with tier progression system (Novice to Grandmaster)
- Comprehensive experience calculation system with exponential tier requirements
- 7 weapon affinities: sword, dagger, axe, bow, staff, mace, spear, unarmed
- 7 magic schools: fire, light, lightning, ice, earth, water, shadow, arcane
- Tier-based bonus system providing 0-50% damage/healing bonuses
- Full combat integration with automatic affinity experience awarding and damage bonuses
- Combat damage calculations enhanced with weapon/magic affinity bonuses
- Healing spells benefit from light magic affinity progression bonuses
- AffinityController with 6 REST API endpoints for progression tracking
- Real-time broadcasting for tier-up events and experience gains
- Redis-based caching for affinity data with performance optimization

### Caching and Session Management System (June 30, 2025)
- Production-ready Redis connection service with automatic reconnection and health monitoring
- Comprehensive cache manager with JSON serialization, bulk operations, and statistics
- Advanced session manager with sliding TTL, metadata tracking, and multi-session support
- Cache patterns implementation (Cache-Aside, Write-Through, Write-Behind) with background refresh
- Distributed locking system using Redlock pattern for critical sections
- Redis-based rate limiting with sliding window algorithm and per-user/IP tracking
- Tagged cache invalidation and predictive refresh capabilities
- Unit tests for core caching and session management services
- Integration with health monitoring endpoints for cache and session statistics
- Comprehensive documentation and usage examples in CACHING_GUIDE.md

### Real-Time Communication Layer (June 30, 2025)
- Production-ready Socket.io server with Redis adapter for horizontal scaling
- JWT authentication middleware for socket connections with rate limiting
- Comprehensive room management system (user, character, zone, combat, guild, global)
- Real-time event handlers for character movement, combat, and chat
- Presence management system with activity tracking and online status
- Rate limiting per event type with Redis-based distributed tracking
- Realtime service for broadcasting events across zones, users, and guilds
- Security layer with input validation, anti-cheat measures, and room access control
- Monitoring and metrics collection for connection counts and performance
- Integration with Express API for realtime statistics and announcements

### Express API Infrastructure (June 30, 2025) 
- Production-ready Express API with enterprise-grade middleware stack
- Comprehensive environment configuration with Joi validation
- Multi-tier rate limiting, security headers, and CORS protection  
- Global error handling with custom error classes and PostgreSQL mapping
- Request validation system with express-validator and game-specific rules
- Standardized response formatting with pagination and helper methods
- Health monitoring endpoints with detailed system metrics
- Swagger/OpenAPI documentation with interactive UI
- Performance monitoring, logging, and graceful shutdown handling

### Database Schema & Migration System (June 30, 2025)
- Implemented comprehensive PostgreSQL migration system with up/down support
- Created 4 core database tables: users, user_security, audit_log, user_sessions
- Built BaseRepository pattern with CRUD operations, pagination, and audit trails
- Added connection pooling, retry logic, and performance monitoring
- Migration CLI tools for database management

### Authentication System (June 30, 2025)
- Complete JWT authentication with Argon2id password hashing
- Dual token system (15min access, 7-day refresh) with Redis storage
- Rate limiting, account locking, and comprehensive security middleware
- 8 authentication API endpoints with production-ready error handling

## Changelog

```
Changelog:
- June 30, 2025. Affinity System Integration completed with combat bonuses (Step 2.6)
- June 30, 2025. Combat System Foundation completed with formula alignment patch (Step 2.5) 
- June 30, 2025. Zone and Movement System implemented (Step 2.4)
- June 30, 2025. Infinite Progression System implemented (Step 2.3)
- June 30, 2025. Character Management System implemented (Step 2.2)
- June 30, 2025. Character System Database Design implemented (Step 2.1)
- June 30, 2025. Caching and Session Management System implemented (Step 1.6)
- June 30, 2025. Real-Time Communication Layer implemented - Socket.io with Redis scaling
- June 30, 2025. Express API Infrastructure implemented (Step 1.4)
- June 30, 2025. Database schema and migration system implemented
- June 30, 2025. JWT authentication system completed
- June 30, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```