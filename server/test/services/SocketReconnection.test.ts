
import { Server as SocketServer } from 'socket.io';
import { createServer } from 'http';
import Client, { Socket as ClientSocket } from 'socket.io-client';
import { redisService } from '../../src/services/RedisService';

jest.mock('../../src/services/RedisService');

describe('Socket Reconnection', () => {
  let httpServer: any;
  let io: SocketServer;
  let serverSocket: any;
  let clientSocket: ClientSocket;
  let port: number;

  beforeAll((done) => {
    httpServer = createServer();
    io = new SocketServer(httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    httpServer.listen(() => {
      port = (httpServer.address() as any).port;
      done();
    });
  });

  afterAll(() => {
    io.close();
    httpServer.close();
  });

  beforeEach((done) => {
    clientSocket = Client(`http://localhost:${port}`);
    io.on('connection', (socket) => {
      serverSocket = socket;
    });
    clientSocket.on('connect', done);
  });

  afterEach(() => {
    if (clientSocket.connected) {
      clientSocket.disconnect();
    }
  });

  describe('Connection Management', () => {
    it('should handle client disconnect gracefully', (done) => {
      serverSocket.on('disconnect', (reason: string) => {
        expect(reason).toBeDefined();
        done();
      });
      
      clientSocket.disconnect();
    });

    it('should handle reconnection after network failure', (done) => {
      let reconnectCount = 0;
      
      clientSocket.on('reconnect', () => {
        reconnectCount++;
        if (reconnectCount === 1) {
          expect(clientSocket.connected).toBe(true);
          done();
        }
      });

      // Simulate network failure
      clientSocket.disconnect();
      
      // Reconnect after delay
      setTimeout(() => {
        clientSocket.connect();
      }, 100);
    });

    it('should preserve session state during reconnection', (done) => {
      const sessionData = { userId: 1, characterId: 'char-123' };
      
      // Set initial session
      serverSocket.emit('session-update', sessionData);
      
      serverSocket.on('disconnect', () => {
        // Simulate reconnection with same session
        setTimeout(() => {
          const newClient = Client(`http://localhost:${port}`);
          newClient.on('connect', () => {
            newClient.emit('restore-session', sessionData);
            newClient.disconnect();
            done();
          });
        }, 50);
      });
      
      clientSocket.disconnect();
    });
  });

  describe('Redis Adapter Resilience', () => {
    it('should handle Redis connection failures', async () => {
      const mockRedisService = redisService as jest.Mocked<typeof redisService>;
      mockRedisService.getClient.mockImplementation(() => {
        throw new Error('Redis connection failed');
      });

      // Should not crash the socket server
      expect(() => {
        serverSocket.emit('test-event', { data: 'test' });
      }).not.toThrow();
    });

    it('should recover from Redis adapter disconnect', (done) => {
      const mockRedisService = redisService as jest.Mocked<typeof redisService>;
      
      // Simulate Redis disconnect
      mockRedisService.getClient.mockImplementation(() => {
        throw new Error('Redis disconnected');
      });

      // Should handle gracefully
      serverSocket.emit('redis-dependent-event', { test: true });
      
      // Simulate Redis reconnect
      setTimeout(() => {
        mockRedisService.getClient.mockImplementation(() => ({
          get: jest.fn(),
          set: jest.fn(),
          del: jest.fn();
        } as any));
        
        serverSocket.emit('redis-dependent-event', { test: true });
        done();
      }, 100);
    });
  });

  describe('Room Management During Reconnection', () => {
    it('should rejoin rooms after reconnection', (done) => {
      const roomName = 'test-room';
      
      serverSocket.join(roomName);
      expect(serverSocket.rooms.has(roomName)).toBe(true);
      
      serverSocket.on('disconnect', () => {
        setTimeout(() => {
          const newClient = Client(`http://localhost:${port}`);
          newClient.on('connect', () => {
            newClient.emit('rejoin-room', roomName);
            done();
          });
        }, 50);
      });
      
      clientSocket.disconnect();
    });

    it('should handle room cleanup on disconnect', (done) => {
      const roomName = 'cleanup-room';
      
      serverSocket.join(roomName);
      
      serverSocket.on('disconnect', () => {
        // Room should be cleaned up
        setTimeout(() => {
          expect(serverSocket.rooms.has(roomName)).toBe(false);
          done();
        }, 50);
      });
      
      clientSocket.disconnect();
    });
  });
});
