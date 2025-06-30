
import { RealtimeService } from '../../src/services/RealtimeService';
import { Server as SocketIOServer } from 'socket.io';
import { createServer } from 'http';
import { logger } from '../../src/utils/logger';

jest.mock('../../src/utils/logger');

describe('RealtimeService', () => {
  let realtimeService: RealtimeService;
  let mockIo: jest.Mocked<SocketIOServer>;
  let mockSocket: any;

  beforeEach(() => {
    const httpServer = createServer();
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      engine: { clientsCount: 5 },
      sockets: {
        adapter: {
          rooms: new Map([
            ['zone:forest', new Set(['socket1', 'socket2'])],
            ['user:123', new Set(['socket1'])],
            ['combat:session1', new Set(['socket1', 'socket2', 'socket3'])]
          ])
        },
        sockets: new Map([
          ['socket1', { 
            join: jest.fn().mockResolvedValue(undefined),
            leave: jest.fn().mockResolvedValue(undefined);
          }]
        ])
      }
    } as any;

    mockSocket = {
      join: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined);
    };

    realtimeService = new RealtimeService(mockIo);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Zone Broadcasting', () => {
    it('should broadcast to zone successfully', async () => {
      await realtimeService.broadcastToZone('forest', 'player:joined', { playerId: 123 });

      expect(mockIo.to).toHaveBeenCalledWith('zone:forest');
      expect(mockIo.emit).toHaveBeenCalledWith('player:joined', { playerId: 123 });
    });

    it('should handle zone broadcast errors', async () => {
      mockIo.to.mockImplementation(() => {
        throw new Error('Network error');
      });

      await expect(realtimeService.broadcastToZone('forest', 'test', {}))
        .rejects.toThrow('Network error');
    });
  });

  describe('User Broadcasting', () => {
    it('should broadcast to specific user', async () => {
      await realtimeService.broadcastToUser('123', 'notification', { message: 'Hello' });

      expect(mockIo.to).toHaveBeenCalledWith('user:123');
      expect(mockIo.emit).toHaveBeenCalledWith('notification', { message: 'Hello' });
    });

    it('should handle user broadcast errors', async () => {
      mockIo.emit.mockImplementation(() => {
        throw new Error('Socket error');
      });

      await expect(realtimeService.broadcastToUser('123', 'test', {}))
        .rejects.toThrow('Socket error');
    });
  });

  describe('Character Broadcasting', () => {
    it('should broadcast to character', async () => {
      await realtimeService.broadcastToCharacter('char123', 'stat:update', { hp: 100 });

      expect(mockIo.to).toHaveBeenCalledWith('character:char123');
      expect(mockIo.emit).toHaveBeenCalledWith('stat:update', { hp: 100 });
    });
  });

  describe('Guild Broadcasting', () => {
    it('should broadcast to guild when guild exists', async () => {
      // Mock verifyGuildExists to return true
      jest.spyOn(realtimeService as any, 'verifyGuildExists').mockResolvedValue(true);

      await realtimeService.broadcastToGuild('guild123', 'guild:message', { text: 'Hello guild' });

      expect(mockIo.to).toHaveBeenCalledWith('guild:guild123');
      expect(mockIo.emit).toHaveBeenCalledWith('guild:message', { text: 'Hello guild' });
    });

    it('should skip broadcast when guild does not exist', async () => {
      jest.spyOn(realtimeService as any, 'verifyGuildExists').mockResolvedValue(false);

      await realtimeService.broadcastToGuild('nonexistent', 'test', {});

      expect(mockIo.to).not.toHaveBeenCalled();
      expect(mockIo.emit).not.toHaveBeenCalled();
    });
  });

  describe('Combat Broadcasting', () => {
    it('should broadcast to combat session', async () => {
      await realtimeService.broadcastToCombat('session123', 'combat:action', { 
        action: 'attack', 
        damage: 50 
      });

      expect(mockIo.to).toHaveBeenCalledWith('combat:session123');
      expect(mockIo.emit).toHaveBeenCalledWith('combat:action', { 
        action: 'attack', 
        damage: 50 
      });
    });
  });

  describe('Global Broadcasting', () => {
    it('should broadcast globally', async () => {
      await realtimeService.broadcastGlobal('server:announcement', { 
        message: 'Server maintenance' 
      });

      expect(mockIo.to).toHaveBeenCalledWith('global:events');
      expect(mockIo.emit).toHaveBeenCalledWith('server:announcement', { 
        message: 'Server maintenance' 
      });
    });
  });

  describe('Announcements', () => {
    it('should send announcement with default priority', async () => {
      await realtimeService.sendAnnouncement('Welcome to the game!');

      expect(mockIo.to).toHaveBeenCalledWith('global:events');
      expect(mockIo.emit).toHaveBeenCalledWith('system:announcement', 
        expect.objectContaining({
          message: 'Welcome to the game!',
          priority: 'medium',
          type: 'announcement'
        });
      );
    });

    it('should send high priority announcement', async () => {
      await realtimeService.sendAnnouncement('Critical update!', 'high');

      expect(mockIo.emit).toHaveBeenCalledWith('system:announcement', 
        expect.objectContaining({
          message: 'Critical update!',
          priority: 'high'
        });
      );
    });
  });

  describe('Bulk User Notifications', () => {
    it('should notify multiple users', async () => {
      const userIds = ['user1', 'user2', 'user3'];
      
      await realtimeService.notifyUsers(userIds, 'event:test', { data: 'test' });

      expect(mockIo.to).toHaveBeenCalledTimes(3);
      expect(mockIo.emit).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures in bulk notifications', async () => {
      const userIds = ['user1', 'user2'];
      mockIo.emit.mockImplementationOnce(() => {
        throw new Error('Failed for user1');
      }).mockImplementationOnce(() => {
        // Success for user2
      });

      // Should not throw, uses Promise.allSettled
      await expect(realtimeService.notifyUsers(userIds, 'test', {}))
        .resolves.not.toThrow();
    });
  });

  describe('Game State Updates', () => {
    it('should send game state update to zone', async () => {
      const updates = { npcs: [{ id: 1, position: { x: 10, y: 20 } }] };
      
      await realtimeService.sendGameStateUpdate('forest', updates);

      expect(mockIo.to).toHaveBeenCalledWith('zone:forest');
      expect(mockIo.emit).toHaveBeenCalledWith('game:state_update', 
        expect.objectContaining({
          updates,
          timestamp: expect.any(Number);
        })
      );
    });
  });

  describe('Combat Room Management', () => {
    it('should join combat room successfully', async () => {
      mockIo.sockets.sockets.set('socket1', mockSocket);

      await realtimeService.joinCombatRoom('socket1', 'session123');

      expect(mockSocket.join).toHaveBeenCalledWith('combat:session123');
    });

    it('should handle join combat room when socket not found', async () => {
      await realtimeService.joinCombatRoom('nonexistent', 'session123');

      // Should not throw
      expect(mockSocket.join).not.toHaveBeenCalled();
    });

    it('should leave combat room successfully', async () => {
      mockIo.sockets.sockets.set('socket1', mockSocket);

      await realtimeService.leaveCombatRoom('socket1', 'session123');

      expect(mockSocket.leave).toHaveBeenCalledWith('combat:session123');
    });

    it('should handle leave combat room errors', async () => {
      mockSocket.leave.mockRejectedValue(new Error('Leave failed'));
      mockIo.sockets.sockets.set('socket1', mockSocket);

      await expect(realtimeService.leaveCombatRoom('socket1', 'session123'))
        .rejects.toThrow('Leave failed');
    });
  });

  describe('Metrics and Statistics', () => {
    it('should return metrics', () => {
      const metrics = realtimeService.getMetrics();
      expect(metrics).toEqual({});
    });

    it('should reset metrics', () => {
      realtimeService.resetMetrics();
      const metrics = realtimeService.getMetrics();
      expect(metrics).toEqual({});
    });

    it('should return connected count', () => {
      const count = realtimeService.getConnectedCount();
      expect(count).toBe(5);
    });

    it('should return rooms info', () => {
      const roomsInfo = realtimeService.getRoomsInfo();
      
      expect(roomsInfo).toEqual([
        { roomName: 'zone:forest', clientCount: 2 },
        { roomName: 'user:123', clientCount: 1 },
        { roomName: 'combat:session1', clientCount: 3 }
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should log and rethrow errors appropriately', async () => {
      const error = new Error('Test error');
      mockIo.to.mockImplementation(() => {
        throw error;
      });

      await expect(realtimeService.broadcastToZone('test', 'event', {}))
        .rejects.toThrow('Test error');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to broadcast to zone',
        expect.objectContaining({
          zoneName: 'test',
          event: 'event',
          error: 'Test error'
        });
      );
    });
  });
});
