/**
 * Socket.io Monitoring System
 * Real-time monitoring and metrics collection for Socket.io connections
 */

import { Server as SocketIOServer } from 'socket.io';
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../utils/errorUtils';

export interface ConnectionMetrics {
  totalConnections: number;
  activeConnections: number;
  authenticatedConnections: number;
  connectionsPerMinute: number;
  averageConnectionDuration: number;
  roomCounts: Record<string, number>;
  eventCounts: Record<string, number>;
  errorCounts: Record<string, number>;
}

export class SocketMonitoringService {
  private io: SocketIOServer;
  private metrics: ConnectionMetrics;
  private connectionStartTimes: Map<string, number>;
  private eventCounts: Map<string, number>;
  private errorCounts: Map<string, number>;
  private connectionHistory: number[];
  private metricsInterval: NodeJS.Timeout | null = null;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.connectionStartTimes = new Map();
    this.eventCounts = new Map();
    this.errorCounts = new Map();
    this.connectionHistory = [];
    
    this.metrics = {
      totalConnections: 0,
      activeConnections: 0,
      authenticatedConnections: 0,
      connectionsPerMinute: 0,
      averageConnectionDuration: 0,
      roomCounts: {},
      eventCounts: {},
      errorCounts: {},
    };

    this.setupMonitoring();
  }

  private setupMonitoring(): void {
    // Track connections
    this.io.on('connection', (socket: any) => {
      this.metrics.totalConnections++;
      this.metrics.activeConnections++;
      this.connectionStartTimes.set(socket.id, Date.now());
      
      logger.info('Socket connected for monitoring', {
        socketId: socket.id,
        totalConnections: this.metrics.totalConnections,
        activeConnections: this.metrics.activeConnections,
      });

      // Track disconnections
      socket.on('disconnect', () => {
        this.metrics.activeConnections--;
        const startTime = this.connectionStartTimes.get(socket.id);
        if (startTime) {
          const duration = Date.now() - startTime;
          this.connectionStartTimes.delete(socket.id);
          this.updateAverageConnectionDuration(duration);
        }

        logger.info('Socket disconnected for monitoring', {
          socketId: socket.id,
          activeConnections: this.metrics.activeConnections,
        });
      });

      // Track all events
      const originalEmit = socket.emit;
      const originalOn = socket.on;

      socket.emit = (...args: any[]) => {
        const eventName = args[0];
        this.incrementEventCount(`emit:${eventName}`);
        return originalEmit.apply(socket, args);
      };

      socket.on = (event: string, listener: any) => {
        const wrappedListener = (...args: any[]) => {
          this.incrementEventCount(`receive:${event}`);
          try {
            return listener(...args);
          } catch (error) {
            this.incrementErrorCount(event);
            logger.error('Socket event error', {
              socketId: socket.id,
              event,
              error: error instanceof Error ? getErrorMessage(error) : error,
            });
            throw error;
          }
        };
        return originalOn.call(socket, event, wrappedListener);
      };
    });

    // Start periodic metrics collection
    this.startMetricsCollection();
  }

  private incrementEventCount(eventName: string): void {
    const current = this.eventCounts.get(eventName) || 0;
    this.eventCounts.set(eventName, current + 1);
  }

  private incrementErrorCount(eventName: string): void {
    const current = this.errorCounts.get(eventName) || 0;
    this.errorCounts.set(eventName, current + 1);
  }

  private updateAverageConnectionDuration(duration: number): void {
    // Simple moving average calculation
    const currentAvg = this.metrics.averageConnectionDuration;
    const totalConnections = this.metrics.totalConnections;
    this.metrics.averageConnectionDuration = 
      ((currentAvg * (totalConnections - 1)) + duration) / totalConnections;
  }

  private startMetricsCollection(): void {
    this.metricsInterval = setInterval(() => {
      this.updateMetrics();
      this.logMetrics();
    }, 60000); // Every minute
  }

  private updateMetrics(): void {
    // Update connections per minute
    this.connectionHistory.push(this.metrics.totalConnections);
    if (this.connectionHistory.length > 60) {
      this.connectionHistory.shift();
    }
    
    if (this.connectionHistory.length >= 2) {
      const recent = this.connectionHistory[this.connectionHistory.length - 1];
      const previous = this.connectionHistory[this.connectionHistory.length - 2];
      this.metrics.connectionsPerMinute = recent - previous;
    }

    // Update room counts
    const rooms = this.io.sockets.adapter.rooms;
    this.metrics.roomCounts = {};
    rooms.forEach((sockets, roomName) => {
      if (!roomName.includes(':')) return; // Skip socket.id rooms
      this.metrics.roomCounts[roomName] = sockets.size;
    });

    // Update event and error counts
    this.metrics.eventCounts = Object.fromEntries(this.eventCounts);
    this.metrics.errorCounts = Object.fromEntries(this.errorCounts);

    // Count authenticated connections
    let authenticatedCount = 0;
    this.io.sockets.sockets.forEach((socket: any) => {
      if (socket.userId) {
        authenticatedCount++;
      }
    });
    this.metrics.authenticatedConnections = authenticatedCount;
  }

  private logMetrics(): void {
    logger.info('Socket.io metrics', {
      activeConnections: this.metrics.activeConnections,
      authenticatedConnections: this.metrics.authenticatedConnections,
      connectionsPerMinute: this.metrics.connectionsPerMinute,
      averageConnectionDuration: Math.round(this.metrics.averageConnectionDuration / 1000), // seconds
      totalRooms: Object.keys(this.metrics.roomCounts).length,
      totalEvents: Object.values(this.metrics.eventCounts).reduce((a, b) => a + b, 0),
      totalErrors: Object.values(this.metrics.errorCounts).reduce((a, b) => a + b, 0),
    });
  }

  public getMetrics(): ConnectionMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  public getRoomStats(): Record<string, number> {
    const rooms = this.io.sockets.adapter.rooms;
    const roomStats: Record<string, number> = {};
    
    rooms.forEach((sockets, roomName) => {
      if (!roomName.includes(':')) return; // Skip socket.id rooms
      roomStats[roomName] = sockets.size;
    });
    
    return roomStats;
  }

  public getTopEvents(limit: number = 10): Array<{ event: string; count: number }> {
    return Array.from(this.eventCounts.entries())
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  public getErrorStats(): Array<{ event: string; errors: number }> {
    return Array.from(this.errorCounts.entries())
      .map(([event, errors]) => ({ event, errors }))
      .sort((a, b) => b.errors - a.errors);
  }

  public stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }
}