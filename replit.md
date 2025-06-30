# Aeturnis Online Server - Replit Project Guide

## Overview

This is a mobile-first MMORPG backend server built with Node.js, TypeScript, Express, PostgreSQL, and Redis. The project implements a comprehensive game server architecture with authentication, player management, real-time features, and scalable database design.

## System Architecture

### Backend Structure
- **Express.js** server with TypeScript
- **PostgreSQL** database with connection pooling
- **Redis** for caching and session management (optional)
- **JWT** authentication with bcrypt password hashing
- **Winston** logging with file and console outputs

### Project Structure
```
server/src/
├── controllers/    # Request handlers (authController.ts)
├── routes/         # API routes (auth.ts, index.ts)
├── services/       # Business logic services
├── middleware/     # Auth and validation middleware
├── database/       # Connections and schema
├── types/          # TypeScript definitions
├── utils/          # Helper functions
└── server.ts       # Main application entry
```

## Key Components

### Authentication System
- User registration and login with rate limiting
- JWT token-based authentication
- Password hashing with bcrypt
- Protected routes with middleware

### Database Schema
- **players** table with character stats and location
- **guilds** table for player organizations
- **game_sessions** for tracking online players
- **player_inventory** for items and equipment
- **chat_messages** for in-game communication
- **player_achievements** for progression tracking
- **market_transactions** for player trading

### Security Features
- Helmet.js security headers
- CORS configuration for mobile clients
- Rate limiting on authentication endpoints
- Input validation with Zod schemas

## Data Flow

1. **Client Authentication**: Mobile client authenticates via `/api/auth/login`
2. **JWT Token**: Server returns JWT token for session management
3. **Protected Requests**: Subsequent API calls include Bearer token
4. **Database Operations**: Controllers interact with PostgreSQL via connection pool
5. **Real-time Features**: Redis caching for session data and real-time updates

## External Dependencies

### Core Dependencies
- express, cors, helmet - Web server framework and security
- pg - PostgreSQL database client
- ioredis - Redis client for caching
- jsonwebtoken, bcryptjs - Authentication and security
- winston - Logging framework
- zod - Runtime type validation
- tsx, typescript - TypeScript execution and compilation

### Development Tools
- tsc-alias - Path alias resolution for builds
- express-rate-limit - API rate limiting

## Environment Configuration

Required environment variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string (optional)
- `JWT_SECRET` - Secret key for JWT signing
- `PORT` - Server port (default: 5000)
- `NODE_ENV` - Environment mode
- `GAME_VERSION` - Application version

## Development Workflow

### Current Setup Status
- ✅ Project structure created
- ✅ TypeScript configuration established
- ✅ Database schema defined
- ✅ Authentication system implemented
- ✅ Middleware and security setup
- ✅ Logging system configured
- ⏳ Development workflow configuration

### Next Steps
- Set up development script workflow
- Initialize database with schema
- Test authentication endpoints
- Implement game-specific controllers
- Add WebSocket support for real-time features

## Deployment Strategy

The server is designed for cloud deployment with:
- Environment-based configuration
- Health check endpoints (`/api/health`)
- Graceful shutdown procedures
- Connection pooling for scalability
- Structured logging for monitoring

## Recent Changes

- June 30, 2025: **Phase 1, Step 1.2 Completed**
  - Enhanced authentication system with Argon2 password hashing
  - Implemented dual token architecture (access + refresh tokens)
  - Created comprehensive JWT-based authentication with token rotation
  - Added strict password validation (8+ chars, mixed case, numbers)
  - Built complete registration, login, refresh, and logout endpoints
  - Enhanced middleware for token validation and security
  - Added rate limiting for authentication endpoints
  - Created fallback mechanisms for Redis unavailability
  - Implemented comprehensive error handling and validation
  - Added complete database schema with security features

## User Preferences

```
Communication style: Simple, everyday language
Technical approach: Mobile-first MMORPG development
Security focus: Authentication and player data protection
```

---

**Project Status**: Phase 1, Step 1.2 Complete - Enhanced authentication system with Argon2 hashing, dual token architecture, and comprehensive security features implemented and tested.