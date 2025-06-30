-- UP
-- Chat channels table for organizing chat rooms
CREATE TABLE chat_channels (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    type VARCHAR(20) NOT NULL DEFAULT 'public',
    description TEXT,
    
    -- Access control
    password_hash TEXT,
    max_members INTEGER DEFAULT 100,
    member_count INTEGER DEFAULT 0,
    
    -- Moderation
    is_moderated BOOLEAN DEFAULT false,
    auto_moderate BOOLEAN DEFAULT true,
    
    -- Guild/Zone association
    guild_id INTEGER,
    zone_id VARCHAR(100),
    
    -- Settings
    settings JSONB DEFAULT '{}',
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chat messages table for message history
CREATE TABLE chat_messages (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_id INTEGER REFERENCES characters(id) ON DELETE SET NULL,
    
    -- Message content
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    
    -- Metadata
    edited_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Moderation
    is_flagged BOOLEAN DEFAULT false,
    flagged_reason TEXT,
    flagged_by UUID REFERENCES users(id),
    
    -- Message data
    attachments JSONB DEFAULT '[]',
    mentions JSONB DEFAULT '[]',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Chat channel members table
CREATE TABLE chat_channel_members (
    id SERIAL PRIMARY KEY,
    channel_id INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Member role
    role VARCHAR(20) DEFAULT 'member',
    
    -- Permissions
    can_send_messages BOOLEAN DEFAULT true,
    can_moderate BOOLEAN DEFAULT false,
    
    -- Status
    is_muted BOOLEAN DEFAULT false,
    muted_until TIMESTAMP WITH TIME ZONE,
    
    -- Activity
    last_read_message_id INTEGER,
    last_activity TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(channel_id, user_id)
);

-- Direct messages table for private conversations
CREATE TABLE direct_messages (
    id SERIAL PRIMARY KEY,
    sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Message content
    content TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text',
    
    -- Status
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMP WITH TIME ZONE,
    
    -- Moderation
    is_flagged BOOLEAN DEFAULT false,
    
    -- Message data
    attachments JSONB DEFAULT '[]',
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create default channels
INSERT INTO chat_channels (name, type, description, created_at) VALUES
('global', 'public', 'Global chat channel for all players', CURRENT_TIMESTAMP),
('general', 'public', 'General discussion channel', CURRENT_TIMESTAMP),
('trade', 'public', 'Trading and marketplace discussion', CURRENT_TIMESTAMP),
('help', 'public', 'Help and support channel', CURRENT_TIMESTAMP);

-- Indexes for performance
CREATE INDEX idx_chat_channels_type ON chat_channels(type);
CREATE INDEX idx_chat_channels_zone_id ON chat_channels(zone_id);
CREATE INDEX idx_chat_channels_guild_id ON chat_channels(guild_id);

CREATE INDEX idx_chat_messages_channel_id ON chat_messages(channel_id);
CREATE INDEX idx_chat_messages_user_id ON chat_messages(user_id);
CREATE INDEX idx_chat_messages_character_id ON chat_messages(character_id);
CREATE INDEX idx_chat_messages_created_at ON chat_messages(created_at DESC);
CREATE INDEX idx_chat_messages_flagged ON chat_messages(is_flagged) WHERE is_flagged = true;

CREATE INDEX idx_chat_channel_members_channel ON chat_channel_members(channel_id);
CREATE INDEX idx_chat_channel_members_user ON chat_channel_members(user_id);
CREATE INDEX idx_chat_channel_members_active ON chat_channel_members(last_activity DESC);

CREATE INDEX idx_direct_messages_sender ON direct_messages(sender_id);
CREATE INDEX idx_direct_messages_recipient ON direct_messages(recipient_id);
CREATE INDEX idx_direct_messages_conversation ON direct_messages(sender_id, recipient_id, created_at DESC);
CREATE INDEX idx_direct_messages_unread ON direct_messages(recipient_id, is_read) WHERE is_read = false;

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_chat_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_channels_update_trigger
    BEFORE UPDATE ON chat_channels
    FOR EACH ROW
    EXECUTE FUNCTION update_chat_channels_updated_at();

-- Function to update member count
CREATE OR REPLACE FUNCTION update_channel_member_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE chat_channels 
        SET member_count = member_count + 1 
        WHERE id = NEW.channel_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE chat_channels 
        SET member_count = member_count - 1 
        WHERE id = OLD.channel_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_channel_members_count_trigger
    AFTER INSERT OR DELETE ON chat_channel_members
    FOR EACH ROW
    EXECUTE FUNCTION update_channel_member_count();

-- DOWN
DROP TRIGGER IF EXISTS chat_channel_members_count_trigger ON chat_channel_members;
DROP FUNCTION IF EXISTS update_channel_member_count();
DROP TRIGGER IF EXISTS chat_channels_update_trigger ON chat_channels;
DROP FUNCTION IF EXISTS update_chat_channels_updated_at();

DROP INDEX IF EXISTS idx_direct_messages_unread;
DROP INDEX IF EXISTS idx_direct_messages_conversation;
DROP INDEX IF EXISTS idx_direct_messages_recipient;
DROP INDEX IF EXISTS idx_direct_messages_sender;
DROP INDEX IF EXISTS idx_chat_channel_members_active;
DROP INDEX IF EXISTS idx_chat_channel_members_user;
DROP INDEX IF EXISTS idx_chat_channel_members_channel;
DROP INDEX IF EXISTS idx_chat_messages_flagged;
DROP INDEX IF EXISTS idx_chat_messages_created_at;
DROP INDEX IF EXISTS idx_chat_messages_character_id;
DROP INDEX IF EXISTS idx_chat_messages_user_id;
DROP INDEX IF EXISTS idx_chat_messages_channel_id;
DROP INDEX IF EXISTS idx_chat_channels_guild_id;
DROP INDEX IF EXISTS idx_chat_channels_zone_id;
DROP INDEX IF EXISTS idx_chat_channels_type;

DROP TABLE IF EXISTS direct_messages;
DROP TABLE IF EXISTS chat_channel_members;
DROP TABLE IF EXISTS chat_messages;
DROP TABLE IF EXISTS chat_channels;