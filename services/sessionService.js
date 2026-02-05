const redisClient = require('../config/redis');
const logger = require('../utils/logger');

class SessionService {
  constructor() {
    this.fallbackSessions = new Map(); // Fallback for when Redis is unavailable
    this.sessionTimeout = 1800; // 30 minutes
  }

  // Get or create session with Redis fallback
  async getSession(sessionId, phoneNumber, defaultData = {}) {
    try {
      // Try Redis first
      let session = await redisClient.getSession(sessionId);
      
      if (!session) {
        // Check fallback storage
        session = this.fallbackSessions.get(sessionId);
        
        if (!session) {
          // Create new session
          session = {
            sessionId,
            phoneNumber,
            step: 'main_menu',
            data: defaultData,
            createdAt: new Date(),
            updatedAt: new Date()
          };
          
          await this.setSession(sessionId, session);
        }
      }
      
      return session;
    } catch (error) {
      logger.error('Failed to get session', { sessionId, error });
      
      // Return fallback session or create new one
      let session = this.fallbackSessions.get(sessionId);
      if (!session) {
        session = {
          sessionId,
          phoneNumber,
          step: 'main_menu',
          data: defaultData,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.fallbackSessions.set(sessionId, session);
      }
      
      return session;
    }
  }

  // Update session
  async updateSession(sessionId, updates) {
    try {
      const session = await this.getSession(sessionId);
      if (!session) {
        logger.warn('Attempted to update non-existent session', { sessionId });
        return false;
      }
      
      // Merge updates
      Object.assign(session, updates);
      session.updatedAt = new Date();
      
      return await this.setSession(sessionId, session);
    } catch (error) {
      logger.error('Failed to update session', { sessionId, error });
      return false;
    }
  }

  // Set session in Redis with fallback
  async setSession(sessionId, sessionData) {
    try {
      // Try Redis first
      const redisSuccess = await redisClient.setSession(sessionId, sessionData, this.sessionTimeout);
      
      if (!redisSuccess) {
        // Use fallback storage
        this.fallbackSessions.set(sessionId, sessionData);
        logger.warn('Using fallback session storage', { sessionId });
      }
      
      return true;
    } catch (error) {
      logger.error('Failed to set session', { sessionId, error });
      // Always use fallback as last resort
      this.fallbackSessions.set(sessionId, sessionData);
      return true;
    }
  }

  // Clear session
  async clearSession(sessionId) {
    try {
      // Clear from Redis
      await redisClient.deleteSession(sessionId);
      
      // Clear from fallback
      this.fallbackSessions.delete(sessionId);
      
      logger.info('Session cleared', { sessionId });
      return true;
    } catch (error) {
      logger.error('Failed to clear session', { sessionId, error });
      return false;
    }
  }

  // Get all active sessions (for monitoring)
  async getActiveSessions() {
    try {
      const sessions = [];
      
      // Get from fallback storage
      for (const [sessionId, session] of this.fallbackSessions.entries()) {
        sessions.push({
          sessionId,
          phoneNumber: session.phoneNumber,
          step: session.step,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        });
      }
      
      return sessions;
    } catch (error) {
      logger.error('Failed to get active sessions', error);
      return [];
    }
  }

  // Clean up expired sessions (fallback only)
  cleanupExpiredSessions() {
    try {
      const now = new Date();
      const expiredSessions = [];
      
      for (const [sessionId, session] of this.fallbackSessions.entries()) {
        const sessionAge = (now - new Date(session.updatedAt)) / 1000;
        if (sessionAge > this.sessionTimeout) {
          expiredSessions.push(sessionId);
        }
      }
      
      expiredSessions.forEach(sessionId => {
        this.fallbackSessions.delete(sessionId);
        logger.info('Expired session cleaned up', { sessionId });
      });
      
      return expiredSessions.length;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions', error);
      return 0;
    }
  }

  // Session analytics
  async getSessionStats() {
    try {
      const stats = {
        totalSessions: this.fallbackSessions.size,
        sessionsByStep: {},
        averageSessionDuration: 0
      };
      
      let totalDuration = 0;
      
      for (const session of this.fallbackSessions.values()) {
        // Count by step
        stats.sessionsByStep[session.step] = (stats.sessionsByStep[session.step] || 0) + 1;
        
        // Calculate duration
        const duration = (new Date() - new Date(session.createdAt)) / 1000;
        totalDuration += duration;
      }
      
      if (stats.totalSessions > 0) {
        stats.averageSessionDuration = totalDuration / stats.totalSessions;
      }
      
      return stats;
    } catch (error) {
      logger.error('Failed to get session stats', error);
      return {
        totalSessions: 0,
        sessionsByStep: {},
        averageSessionDuration: 0
      };
    }
  }
}

// Create singleton instance
const sessionService = new SessionService();

// Setup cleanup interval (every 5 minutes)
setInterval(() => {
  sessionService.cleanupExpiredSessions();
}, 5 * 60 * 1000);

module.exports = sessionService;