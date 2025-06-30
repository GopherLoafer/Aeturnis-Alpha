-- Aeturnis Online Database Schema
-- Mobile-first MMORPG Database Structure

-- Enable UUID extension for better ID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Players table - Core player information
CREATE TABLE IF NOT EXISTS players (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(20) NOT NULL UNIQUE,
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    
    -- Character stats
    level INTEGER NOT NULL DEFAULT 1,
    experience BIGINT NOT NULL DEFAULT 0,
    gold BIGINT NOT NULL DEFAULT 100,
    
    -- Vital stats
    health INTEGER NOT NULL DEFAULT 100,
    max_health INTEGER NOT NULL DEFAULT 100,
    mana INTEGER NOT NULL DEFAULT 50,
    max_mana INTEGER NOT NULL DEFAULT 50,
    
    -- Core attributes
    strength INTEGER NOT NULL DEFAULT 10,
    agility INTEGER NOT NULL DEFAULT 10,
    intelligence INTEGER NOT NULL DEFAULT 10,
    vitality INTEGER NOT NULL DEFAULT 10,
    
    -- Location data
    location_x FLOAT NOT NULL DEFAULT 0,
    location_y FLOAT NOT NULL DEFAULT 0,
    location_z FLOAT NOT NULL DEFAULT 0,
    map_id VARCHAR(50) NOT NULL DEFAULT 'starter_town',
    
    -- Guild membership
    guild_id UUID REFERENCES guilds(id) ON DELETE SET NULL,
    
    -- Account status
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_banned BOOLEAN NOT NULL DEFAULT false,
    ban_reason TEXT,
    ban_expires_at TIMESTAMP,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_login TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Guilds table - Player organizations
CREATE TABLE IF NOT EXISTS guilds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(30) NOT NULL UNIQUE,
    description TEXT,
    leader_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 1,
    experience BIGINT NOT NULL DEFAULT 0,
    max_members INTEGER NOT NULL DEFAULT 50,
    
    -- Guild resources
    guild_gold BIGINT NOT NULL DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Game sessions table - Track active player sessions
CREATE TABLE IF NOT EXISTS game_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    socket_id VARCHAR(100),
    is_online BOOLEAN NOT NULL DEFAULT true,
    ip_address INET,
    user_agent TEXT,
    
    -- Session timing
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_activity TIMESTAMP NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP
);

-- Player inventory table - Items owned by players
CREATE TABLE IF NOT EXISTS player_inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    item_id VARCHAR(50) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    item_type VARCHAR(30) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    
    -- Item stats (JSON for flexibility)
    item_stats JSONB,
    
    -- Inventory management
    slot_position INTEGER,
    is_equipped BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    acquired_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    UNIQUE(player_id, slot_position)
);

-- Chat messages table - Game chat system
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    channel_type VARCHAR(20) NOT NULL DEFAULT 'global', -- global, guild, whisper, local
    channel_id VARCHAR(50), -- For guild chat, whisper target, etc.
    message TEXT NOT NULL,
    
    -- Message metadata
    is_system_message BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Player achievements table
CREATE TABLE IF NOT EXISTS player_achievements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    achievement_id VARCHAR(50) NOT NULL,
    achievement_name VARCHAR(100) NOT NULL,
    achievement_description TEXT,
    
    -- Achievement rewards
    reward_experience INTEGER DEFAULT 0,
    reward_gold INTEGER DEFAULT 0,
    
    -- Progress tracking
    progress INTEGER NOT NULL DEFAULT 0,
    max_progress INTEGER NOT NULL DEFAULT 1,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    started_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    
    UNIQUE(player_id, achievement_id)
);

-- Market transactions table - Player trading
CREATE TABLE IF NOT EXISTS market_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    seller_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES players(id) ON DELETE SET NULL,
    
    -- Item details
    item_id VARCHAR(50) NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_per_unit BIGINT NOT NULL,
    total_price BIGINT NOT NULL,
    
    -- Transaction status
    status VARCHAR(20) NOT NULL DEFAULT 'listed', -- listed, sold, cancelled, expired
    
    -- Timestamps
    listed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    sold_at TIMESTAMP,
    expires_at TIMESTAMP NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_players_username ON players(username);
CREATE INDEX IF NOT EXISTS idx_players_email ON players(email);
CREATE INDEX IF NOT EXISTS idx_players_level ON players(level);
CREATE INDEX IF NOT EXISTS idx_players_location ON players(map_id, location_x, location_y);
CREATE INDEX IF NOT EXISTS idx_players_guild ON players(guild_id);
CREATE INDEX IF NOT EXISTS idx_players_last_login ON players(last_login);

CREATE INDEX IF NOT EXISTS idx_guilds_name ON guilds(name);
CREATE INDEX IF NOT EXISTS idx_guilds_leader ON guilds(leader_id);

CREATE INDEX IF NOT EXISTS idx_sessions_player ON game_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON game_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_sessions_online ON game_sessions(is_online);

CREATE INDEX IF NOT EXISTS idx_inventory_player ON player_inventory(player_id);
CREATE INDEX IF NOT EXISTS idx_inventory_item ON player_inventory(item_id);
CREATE INDEX IF NOT EXISTS idx_inventory_equipped ON player_inventory(is_equipped);

CREATE INDEX IF NOT EXISTS idx_chat_player ON chat_messages(player_id);
CREATE INDEX IF NOT EXISTS idx_chat_channel ON chat_messages(channel_type, channel_id);
CREATE INDEX IF NOT EXISTS idx_chat_created ON chat_messages(created_at);

CREATE INDEX IF NOT EXISTS idx_achievements_player ON player_achievements(player_id);
CREATE INDEX IF NOT EXISTS idx_achievements_completed ON player_achievements(is_completed);

CREATE INDEX IF NOT EXISTS idx_market_seller ON market_transactions(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_status ON market_transactions(status);
CREATE INDEX IF NOT EXISTS idx_market_expires ON market_transactions(expires_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for automatic updated_at updates
CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    
CREATE TRIGGER update_guilds_updated_at BEFORE UPDATE ON guilds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();