const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
require('dotenv').config();

const logger = require('./utils/logger');
const db = require('./config/database');
const redisClient = require('./config/redis');

// Route imports
const ussdRoutes = require('./routes/ussd');
const voiceRoutes = require('./routes/voice');
const adminRoutes = require('./routes/admin');
const ownerRoutes = require('./routes/owner');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Redis connection
async function initializeRedis() {
  try {
    await redisClient.connect();
    logger.info('Redis connected successfully');
  } catch (error) {
    logger.warn('Redis connection failed, using fallback storage', error);
  }
}

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Body parsing middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body
  });
  next();
});

// Routes
app.use('/ussd', ussdRoutes);
app.use('/voice', voiceRoutes);
app.use('/admin', adminRoutes);
app.use('/owner', ownerRoutes);

// Health check endpoint
app.get('/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    services: {
      database: 'unknown',
      redis: redisClient.isConnected ? 'connected' : 'disconnected'
    }
  };

  // Check database connection
  try {
    await db.execute('SELECT 1');
    health.services.database = 'connected';
  } catch (error) {
    health.services.database = 'disconnected';
    health.status = 'DEGRADED';
  }

  const statusCode = health.status === 'OK' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Analytics endpoint
app.get('/analytics/summary', async (req, res) => {
  try {
    // Get basic analytics
    const [bookingStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_bookings
      FROM bookings
    `);

    const [serviceStats] = await db.execute(`
      SELECT 
        category,
        COUNT(*) as count
      FROM services 
      WHERE is_active = 1
      GROUP BY category
    `);

    const [ussdStats] = await db.execute(`
      SELECT 
        step,
        COUNT(*) as count
      FROM ussd_analytics 
      WHERE DATE(created_at) = CURDATE()
      GROUP BY step
    `);

    res.json({
      success: true,
      data: {
        bookings: bookingStats[0] || {},
        services: serviceStats,
        ussd_usage: ussdStats
      }
    });

  } catch (error) {
    logger.error('Analytics summary error', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics'
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  try {
    await redisClient.disconnect();
    await db.end();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  try {
    await redisClient.disconnect();
    await db.end();
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', error);
    process.exit(1);
  }
});

// Scheduled tasks
// Clean up expired sessions every hour
cron.schedule('0 * * * *', () => {
  logger.info('Running scheduled session cleanup');
  // Session cleanup is handled by sessionService automatically
});

// Send booking reminders every day at 9 AM
cron.schedule('0 9 * * *', async () => {
  try {
    logger.info('Running daily booking reminders');
    
    const [bookings] = await db.execute(`
      SELECT b.*, s.name as service_name
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.status = 'confirmed' 
      AND DATE(b.created_at) = CURDATE()
    `);

    const notificationService = require('./services/notificationService');
    
    for (const booking of bookings) {
      await notificationService.sendBookingReminder(booking, {
        name: booking.service_name
      });
    }
    
    logger.info(`Sent ${bookings.length} booking reminders`);
  } catch (error) {
    logger.error('Failed to send booking reminders', error);
  }
});

// Start server
async function startServer() {
  try {
    // Initialize Redis
    await initializeRedis();
    
    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`Visitor Assistance USSD + Voice System started on port ${PORT}`);
      logger.info('System ready to handle USSD and voice requests');
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

startServer();
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  
  // Test database connection
  db.getConnection()
    .then(connection => {
      logger.info('Database connected successfully');
      connection.release();
    })
    .catch(err => {
      logger.error('Database connection failed:', err);
    });
});

module.exports = app;