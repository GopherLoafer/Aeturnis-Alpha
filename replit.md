# Blank Slate Development Environment

## Overview

This is a minimal full-stack development environment built with React (TypeScript) on the frontend and Express.js on the backend. The project provides a clean foundation for building web applications with modern tooling and architecture patterns.

## System Architecture

### Frontend Architecture
- **React 18** with TypeScript for type safety
- **Vite** as the build tool and development server
- **Wouter** for client-side routing (lightweight React Router alternative)
- **TanStack Query** for server state management and API caching
- **shadcn/ui** component library built on Radix UI primitives
- **Tailwind CSS** for styling with CSS variables for theming
- **React Hook Form** with Zod validation for form handling

### Backend Architecture
- **Express.js** server with TypeScript
- **Node.js** ESM modules for modern JavaScript features
- **Modular route registration** system for API endpoints
- **Custom middleware** for request logging and error handling
- **Memory storage** abstraction with interface for easy database swapping

### Database Architecture
- **PostgreSQL** as the primary database (configured via Neon)
- **Drizzle ORM** for type-safe database operations
- **Drizzle Kit** for database migrations and schema management
- **Zod integration** for runtime validation and type inference

## Key Components

### Storage Layer
- **IStorage interface** provides abstraction for CRUD operations
- **MemStorage implementation** for development/testing (in-memory)
- **User management** with username/password fields
- **Type-safe operations** using Drizzle-generated types

### UI Components
- **Complete shadcn/ui component set** including forms, dialogs, tables, charts
- **Responsive design** with mobile-first approach
- **Dark/light theme support** via CSS variables
- **Accessibility-focused** components using Radix UI primitives

### Development Tools
- **Hot Module Replacement** for fast development cycles
- **TypeScript strict mode** for maximum type safety
- **Path mapping** for clean imports (@/, @shared/, etc.)
- **ESBuild** for fast production builds

## Data Flow

1. **Client requests** are made through TanStack Query with custom fetch wrapper
2. **API requests** hit Express routes with `/api` prefix
3. **Route handlers** use the storage interface for data operations
4. **Storage layer** abstracts database operations (currently in-memory)
5. **Responses** are automatically cached by TanStack Query
6. **UI updates** reactively based on query state changes

## External Dependencies

### Core Dependencies
- **@neondatabase/serverless** - PostgreSQL connection via Neon
- **drizzle-orm & drizzle-kit** - Database ORM and migration tools
- **@tanstack/react-query** - Server state management
- **wouter** - Lightweight React routing
- **react-hook-form** - Form state management
- **zod** - Runtime validation and type inference

### UI Dependencies
- **@radix-ui/** - Headless UI primitives for accessibility
- **tailwindcss** - Utility-first CSS framework
- **class-variance-authority** - Type-safe CSS class composition
- **lucide-react** - Icon library

### Development Dependencies
- **vite** - Build tool and dev server
- **typescript** - Type checking and compilation
- **tsx** - TypeScript execution for Node.js

## Deployment Strategy

### Development
- **Vite dev server** serves the frontend with HMR
- **tsx** runs the Express server with auto-restart
- **Concurrent development** with frontend proxy to backend API

### Production Build
1. **Frontend build** - Vite compiles React app to static assets
2. **Backend build** - ESBuild bundles Express server with externals
3. **Static serving** - Express serves built frontend assets
4. **Single deployment** - Both frontend and backend run from one Node.js process

### Database Setup
- **Environment variable** `DATABASE_URL` required for PostgreSQL connection
- **Migration system** using Drizzle Kit for schema changes
- **Development fallback** to in-memory storage if database unavailable

## Changelog
- June 30, 2025: Created blank slate development environment with minimal setup

## User Preferences

Preferred communication style: Simple, everyday language.