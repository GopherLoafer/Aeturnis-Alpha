# Aeturnis Online

A mobile-first MMORPG backend server built with Node.js, TypeScript, Express, and PostgreSQL.

## 🚀 Features

- **High Performance**: Optimized for mobile bandwidth and low latency
- **Scalable Architecture**: Modular design with clear separation of concerns
- **Security First**: JWT authentication, rate limiting, and comprehensive security middleware
- **Real-time Communication**: WebSocket support for live gameplay
- **Database Integration**: PostgreSQL with connection pooling and Redis caching
- **Type Safety**: Full TypeScript implementation with strict type checking
- **Production Ready**: Comprehensive logging, error handling, and monitoring

## 📁 Project Structure

```
/aeturnis-online
│
├── .replit                 # Replit configuration
├── tsconfig.json          # TypeScript configuration
├── package.json           # Node.js dependencies and scripts
├── .env.example           # Environment variables template
├── README.md              # Project documentation
│
├── /server
│   └── /src
│       ├── /controllers   # HTTP request handlers
│       ├── /services      # Business logic layer
│       ├── /repositories  # Data access layer
│       ├── /middleware    # Express middleware
│       ├── /routes        # API route definitions
│       ├── /database      # Database connections and migrations
│       ├── /types         # TypeScript type definitions
│       ├── /utils         # Utility functions
│       ├── /config        # Configuration files
│       ├── /sockets       # WebSocket handlers
│       └── index.ts       # Main server entry point
│
└── /client (Optional)     # Future frontend implementation
```

## 🛠️ Tech Stack

### Core Technologies
- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.3+
- **Framework**: Express.js 4.18+
- **Database**: PostgreSQL 15+
- **Cache**: Redis (ioredis)

### Security & Authentication
- **JWT**: jsonwebtoken for stateless authentication
- **Password Hashing**: Argon2 (primary) + bcrypt (fallback)
- **Security Headers**: Helmet.js
- **Rate Limiting**: express-rate-limit
- **CORS**: Configurable cross-origin resource sharing

### Development Tools
- **Build Tool**: tsx for development, tsc for production
- **Type Checking**: TypeScript with strict mode
- **Logging**: Winston with multiple transports
- **Environment**: dotenv for configuration management

## 🚀 Quick Start

### Prerequisites
- Node.js 20 or higher
- PostgreSQL 15 or higher
- Redis server (optional but recommended)

### Installation

1. **Clone and Setup**
   ```bash
   git clone <repository-url>
   cd aeturnis-online
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your database and Redis credentials
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Build for Production**
   ```bash
   npm run build
   npm start
   ```

## 📋 Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run start:dev` - Build and start (useful for testing builds)
- `npm run clean` - Remove build artifacts
- `npm run type-check` - Run TypeScript type checking

## 🌐 API Endpoints

### Health & Status
- `GET /health` - Server health check
- `GET /api` - API information and available endpoints

### Authentication (Coming Soon)
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/refresh` - Refresh access token
- `POST /api/auth/logout` - User logout

### Game API (Coming Soon)
- `GET /api/player/profile` - Player profile
- `POST /api/player/create` - Create new character
- `GET /api/world/status` - World server status
- `WebSocket /ws/game` - Real-time game communication

## 🔧 Configuration

### Environment Variables

Key configuration options in `.env`:

```bash
# Server
NODE_ENV=development
PORT=3000

# Database
DATABASE_URL=postgresql://user:pass@host:port/db
REDIS_URL=redis://localhost:6379

# Security
JWT_SECRET=your-secret-key
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Game Settings
GAME_TICK_RATE=30
MAX_CONCURRENT_PLAYERS=1000
```

### TypeScript Paths

The project uses path aliases for clean imports:

```typescript
import { UserController } from '@controllers/UserController';
import { AuthService } from '@services/AuthService';
import { DatabaseConfig } from '@config/database';
```

## 🛡️ Security Features

- **Helmet.js**: Security headers and CSP
- **Rate Limiting**: Configurable per-endpoint limits
- **JWT Authentication**: Stateless token-based auth
- **Password Security**: Argon2 hashing with salt
- **Input Validation**: Zod schema validation
- **CORS Protection**: Configurable origin restrictions

## 📊 Monitoring & Logging

- **Winston Logger**: Structured logging with multiple levels
- **Error Tracking**: Comprehensive error handling and reporting
- **Performance Monitoring**: Request timing and resource usage
- **Health Checks**: Built-in endpoint for load balancer integration

## 🚀 Deployment

### Replit Deployment
The project is configured for Replit Teams with automatic deployment.

### Docker Deployment (Future)
```bash
# Coming soon
docker build -t aeturnis-online .
docker run -p 3000:3000 aeturnis-online
```

### Cloud Deployment
Compatible with major cloud providers:
- **Heroku**: Ready with Procfile
- **Railway**: Zero-config deployment
- **DigitalOcean App Platform**: Auto-detected build
- **AWS/GCP/Azure**: Container or serverless deployment

## 🔄 Development Workflow

1. **Feature Development**
   - Create feature branch
   - Implement in appropriate layer (controller → service → repository)
   - Add TypeScript types
   - Test endpoints

2. **Database Changes**
   - Create migration scripts in `/database`
   - Update TypeScript interfaces
   - Test with sample data

3. **API Development**
   - Define routes in `/routes`
   - Implement controllers in `/controllers`
   - Add business logic in `/services`
   - Create data access in `/repositories`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Report bugs via GitHub Issues
- **Discord**: Join our development community
- **Email**: support@aeturnis-online.com

## 🗺️ Roadmap

### Phase 1: Core Infrastructure ✅
- [x] Project setup and structure
- [x] Basic Express server
- [x] TypeScript configuration
- [x] Security middleware
- [x] Environment configuration

### Phase 2: Authentication & Database
- [ ] PostgreSQL integration
- [ ] Redis caching
- [ ] JWT authentication system
- [ ] User registration/login
- [ ] Password security

### Phase 3: Game Core
- [ ] Player character system
- [ ] Game world basics
- [ ] Real-time WebSocket communication
- [ ] Basic gameplay mechanics

### Phase 4: Advanced Features
- [ ] Guild system
- [ ] PvP combat
- [ ] Quest system
- [ ] Economy and trading
- [ ] Mobile optimization

---

**Aeturnis Online** - Where legends are born in the digital realm.