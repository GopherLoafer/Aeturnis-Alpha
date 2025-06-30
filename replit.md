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
- June 30, 2025. Express API Infrastructure implemented (Step 1.4)
- June 30, 2025. Database schema and migration system implemented
- June 30, 2025. JWT authentication system completed
- June 30, 2025. Initial setup
```

## User Preferences

```
Preferred communication style: Simple, everyday language.
```