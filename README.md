# Aeturnis Online Server

A mobile-first MMORPG backend server built with Node.js, TypeScript, Express, PostgreSQL, and Redis.

## 🚀 Project Structure

```
server/
├── src/
│   ├── controllers/    # Request handlers and business logic
│   ├── routes/         # API route definitions
│   ├── services/       # Business services and game logic
│   ├── middleware/     # Express middleware (auth, validation, etc.)
│   ├── database/       # Database connections and schema
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   └── server.ts       # Main server entry point
├── logs/               # Application logs
└── dist/               # Compiled JavaScript (generated)
```

## 🔧 Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/aeturnis_online

# Redis Configuration  
REDIS_URL=redis://localhost:6379

# Authentication
JWT_SECRET=your-super-secure-jwt-secret-key-here

# Server Configuration
PORT=5000
NODE_ENV=development

# Game Configuration
GAME_NAME=Aeturnis Online
GAME_VERSION=1.0.0
MAX_PLAYERS_PER_SERVER=1000
```

## 📦 Installation & Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up the database:**
   ```bash
   # Import the schema
   psql $DATABASE_URL -f server/src/database/schema.sql
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Build for production:**
   ```bash
   npm run build
   npm start
   ```

## 🎮 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new player
- `POST /api/auth/login` - Player login

### Health Check
- `GET /api/health` - Server health status
- `GET /` - Root endpoint with server info

## 🏗️ Database Schema

The database includes the following main tables:

- **players** - Core player information and stats
- **guilds** - Player organizations
- **game_sessions** - Active player sessions
- **player_inventory** - Player items and equipment
- **chat_messages** - In-game chat system
- **player_achievements** - Achievement tracking
- **market_transactions** - Player trading system

## 🔐 Security Features

- **Helmet.js** for security headers
- **CORS** configured for mobile clients
- **Rate limiting** on authentication endpoints
- **JWT** token-based authentication
- **bcrypt** password hashing
- **Input validation** with Zod

## 📱 Mobile-First Design

- Optimized API responses for mobile bandwidth
- Efficient data structures for real-time gameplay
- Support for mobile push notifications (planned)
- WebSocket support for real-time features (planned)

## 🔍 Development

### Type Safety
- Full TypeScript support with strict mode
- Path aliases configured (`@/` for `server/src/`)
- Comprehensive type definitions for all game entities

### Logging
- Winston logger with file and console outputs
- Different log levels for development and production
- Structured JSON logging for production monitoring

### Database
- PostgreSQL with connection pooling
- UUID primary keys for scalability
- Proper indexing for game queries
- Automatic timestamp updates

## 🎯 Game Features (Planned)

- Real-time multiplayer combat
- Guild system with chat and management
- Player vs Player (PvP) combat
- Dungeon instances
- Crafting and trading system
- Achievement and progression system
- In-game marketplace

## 📊 Monitoring & Performance

- Connection health checks for database and Redis
- Request rate limiting and security middleware
- Structured logging for debugging and monitoring
- Graceful shutdown handling

## 🚀 Deployment

The server is configured for cloud deployment with:
- Docker support (planned)
- Environment-based configuration
- Health check endpoints
- Graceful shutdown procedures

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes with proper TypeScript types
4. Add tests for new functionality
5. Submit a pull request

## 📝 License

MIT License - see LICENSE file for details.

---

**Aeturnis Online** - A next-generation mobile MMORPG experience.