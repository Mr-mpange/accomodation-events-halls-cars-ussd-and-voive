const redis = require('redis');
const logger = require('../utils/logger');

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = redis.createClient({
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.REDIS_DB || 0,
        retry_strategy: (options) => {
          if (options.error && options.error.code === 'ECONNREFUSED') {
            logger.error('Redis connection refused');
            return new Error('Redis connection refused');
          }
          if (options.total_retry_time > 1000 * 60 * 60) {
            logger.error('Redis retry time exhausted');
            return new Error('Retry time exhausted');
          }
          if (options.attempt > 10) {
            logger.error('Redis max attempts reached');
            return undefined;
          }
          return Math.min(options.attempt * 100, 3000);
        }
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error', err);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        logger.info('Redis client disconnected');
        this.isConnected = false;
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
    }
  }

  // Session management methods
  async setSession(sessionId, sessionData, ttl = 1800) { // 30 minutes default
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, using fallback storage');
        return false;
      }
      
      await this.client.setEx(
        `session:${sessionId}`, 
        ttl, 
        JSON.stringify(sessionData)
      );
      return true;
    } catch (error) {
      logger.error('Failed to set session in Redis', { sessionId, error });
      return false;
    }
  }

  async getSession(sessionId) {
    try {
      if (!this.isConnected) {
        return null;
      }
      
      const data = await this.client.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get session from Redis', { sessionId, error });
      return null;
    }
  }

  async deleteSession(sessionId) {
    try {
      if (!this.isConnected) {
        return false;
      }
      
      await this.client.del(`session:${sessionId}`);
      return true;
    } catch (error) {
      logger.error('Failed to delete session from Redis', { sessionId, error });
      return false;
    }
  }

  // Cache management methods
  async set(key, value, ttl = 3600) {
    try {
      if (!this.isConnected) {
        return false;
      }
      
      await this.client.setEx(key, ttl, JSON.stringify(value));
      return true;
    } catch (error) {
      logger.error('Failed to set cache in Redis', { key, error });
      return false;
    }
  }

  async get(key) {
    try {
      if (!this.isConnected) {
        return null;
      }
      
      const data = await this.client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error('Failed to get cache from Redis', { key, error });
      return null;
    }
  }

  async del(key) {
    try {
      if (!this.isConnected) {
        return false;
      }
      
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Failed to delete cache from Redis', { key, error });
      return false;
    }
  }

  // Analytics methods
  async incrementCounter(key, ttl = 86400) { // 24 hours default
    try {
      if (!this.isConnected) {
        return 0;
      }
      
      const count = await this.client.incr(key);
      if (count === 1) {
        await this.client.expire(key, ttl);
      }
      return count;
    } catch (error) {
      logger.error('Failed to increment counter in Redis', { key, error });
      return 0;
    }
  }

  async getCounter(key) {
    try {
      if (!this.isConnected) {
        return 0;
      }
      
      const count = await this.client.get(key);
      return count ? parseInt(count) : 0;
    } catch (error) {
      logger.error('Failed to get counter from Redis', { key, error });
      return 0;
    }
  }
}

// Create singleton instance
const redisClient = new RedisClient();

module.exports = redisClient;