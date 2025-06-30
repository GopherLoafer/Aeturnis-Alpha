# 🗄️ Aeturnis Online Database Schema & Migration System

## Overview

This document outlines the comprehensive PostgreSQL database schema and migration system for Aeturnis Online MMORPG. The system provides a robust foundation for user management, security, auditing, and session handling.

## Database Schema

### Core Tables

#### 1. `users` - Primary User Data
- **Primary Key**: `id` (UUID)
- **Unique Constraints**: `email`, `username`
- **Features**:
  - Email verification system
  - Role-based access control (user, moderator, admin)
  - User status management (active, suspended, banned)
  - JSONB metadata for extensibility
  - Automatic timestamp tracking

#### 2. `user_security` - Security & Authentication
- **Primary Key**: `user_id` (references users.id)
- **Features**:
  - Login attempt tracking
  - Account locking mechanism
  - Two-factor authentication support
  - Recovery codes storage
  - Password change tracking
  - Force password change capability

#### 3. `audit_log` - Comprehensive Audit Trail
- **Primary Key**: `id` (UUID)
- **Features**:
  - User action tracking
  - Resource change logging
  - IP address and user agent capture
  - JSONB change tracking
  - Partitioned by month for performance

#### 4. `user_sessions` - Session Management
- **Primary Key**: `id` (UUID)
- **Features**:
  - Refresh token tracking
  - Session expiration management
  - IP and user agent tracking
  - Last activity monitoring
  - Automatic cleanup functions

## Migration System

### Features

- **Transactional Migrations**: Each migration runs in a transaction with automatic rollback
- **Up/Down Support**: Forward and reverse migrations
- **Migration Tracking**: Automatic tracking of applied migrations
- **Execution Timing**: Performance monitoring for each migration
- **Alphabetical Ordering**: Predictable execution order

### Usage

```bash
# Run all pending migrations
tsx server/src/cli/migrate.ts up

# Check migration status
tsx server/src/cli/migrate.ts status

# Rollback last migration
tsx server/src/cli/migrate.ts down

# Rollback multiple migrations
tsx server/src/cli/migrate.ts down 3
```

## Repository Pattern

### BaseRepository Features

- **Generic CRUD Operations**: Create, read, update, delete with type safety
- **Advanced Filtering**: WHERE, IN, LIKE, NULL checks
- **Pagination Support**: Offset-based pagination with totals
- **Soft Delete**: Optional soft delete functionality
- **Audit Integration**: Automatic audit trail logging
- **Bulk Operations**: Batch create/update/delete
- **Connection Management**: Automatic connection pooling and retry logic

### Repository Pattern Benefits

1. **Type Safety**: Full TypeScript support with generic types
2. **Consistency**: Standardized CRUD operations across all entities
3. **Auditability**: Automatic change tracking for all operations
4. **Performance**: Connection pooling and query optimization
5. **Maintainability**: Clean separation of concerns

## Database Connection

### Features

- **Connection Pooling**: Min 2, Max 20 connections
- **Retry Logic**: Exponential backoff for failed connections
- **Query Logging**: Development mode query logging
- **Slow Query Detection**: Automatic detection of queries >1000ms
- **Health Checks**: Connection health monitoring
- **Graceful Shutdown**: Proper connection cleanup

### Configuration

Environment variables for database connection:
- `DATABASE_URL` - Full connection string
- `PGHOST` - Database host
- `PGPORT` - Database port
- `PGDATABASE` - Database name
- `PGUSER` - Database user
- `PGPASSWORD` - Database password

## Security Features

### Password Security
- Argon2id hashing with secure parameters
- Password change tracking
- Force password change capability

### Session Security
- JWT refresh token storage
- Session expiration management
- Device/IP tracking
- Automatic session cleanup

### Audit Trail
- Comprehensive action logging
- Change tracking with before/after values
- IP address and user agent capture
- Partitioned storage for performance

## Performance Optimizations

### Indexing Strategy
- Email and username case-insensitive indexes
- Composite indexes for common queries
- Partial indexes for filtered queries
- Timestamp indexes for audit queries

### Query Optimization
- Connection pooling for concurrent requests
- Prepared statement caching
- Query execution time monitoring
- Automatic retry with exponential backoff

### Partitioning
- Monthly partitioning for audit_log table
- Automatic partition creation
- Old partition cleanup (future enhancement)

## Development Workflow

### Adding New Tables

1. Create migration file: `00X_create_table_name.sql`
2. Include both UP and DOWN sections
3. Add appropriate indexes and constraints
4. Create repository class extending BaseRepository
5. Run migration: `tsx server/src/cli/migrate.ts up`

### Schema Changes

1. Create new migration file with incremental number
2. Include rollback instructions in DOWN section
3. Test migration and rollback thoroughly
4. Update repository if needed

## Monitoring & Maintenance

### Query Performance
- Slow query logging (>1000ms)
- Connection pool monitoring
- Execution time tracking

### Database Health
- Connection health checks
- Pool statistics monitoring
- Migration status tracking

### Audit Management
- Monthly partition creation
- Change tracking validation
- Cleanup of old audit data

## Future Enhancements

### Planned Features
- Read replicas for improved performance
- Automated backup and recovery
- Database schema versioning
- Advanced query caching
- Real-time monitoring dashboard

### Scalability Considerations
- Horizontal sharding strategy
- Caching layer integration
- Connection pool optimization
- Query optimization analysis

## Troubleshooting

### Common Issues

1. **Migration Failures**: Check database permissions and connection
2. **Connection Errors**: Verify SSL configuration and credentials
3. **Performance Issues**: Monitor slow query logs and connection pool
4. **Audit Growth**: Implement partition cleanup strategy

### Debug Commands

```bash
# Check current migrations
tsx server/src/cli/migrate.ts status

# Test database connection
npm run test:db

# Monitor query performance
tail -f logs/database.log
```

## Conclusion

The Aeturnis Online database schema provides a robust, scalable foundation for the MMORPG backend. The migration system ensures reliable schema evolution, while the repository pattern offers type-safe, auditable data access across the application.