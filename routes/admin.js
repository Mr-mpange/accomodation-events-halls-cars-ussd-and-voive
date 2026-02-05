const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Middleware to verify admin token
const verifyAdminToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const [rows] = await db.execute(
      'SELECT * FROM admins WHERE username = ? AND is_active = 1',
      [username]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const admin = rows[0];
    const isValidPassword = await bcrypt.compare(password, admin.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: admin.id, username: admin.username, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name
      }
    });
    
  } catch (error) {
    logger.error('Admin login error', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get dashboard statistics
router.get('/dashboard', verifyAdminToken, async (req, res) => {
  try {
    // Get booking statistics
    const [bookingStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_bookings
      FROM bookings
    `);
    
    // Get service statistics
    const [serviceStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_services,
        COUNT(CASE WHEN category = 'stay' THEN 1 END) as stay_services,
        COUNT(CASE WHEN category = 'ride' THEN 1 END) as ride_services,
        COUNT(CASE WHEN category = 'hall' THEN 1 END) as hall_services,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_services
      FROM services
    `);
    
    // Get owner statistics
    const [ownerStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_owners,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_owners,
        COUNT(CASE WHEN is_verified = 1 THEN 1 END) as verified_owners
      FROM owners
    `);
    
    // Get recent bookings
    const [recentBookings] = await db.execute(`
      SELECT 
        b.id, b.reference, b.phone_number, b.status, b.created_at,
        s.name as service_name, s.category,
        o.name as owner_name
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN owners o ON b.owner_id = o.id
      ORDER BY b.created_at DESC
      LIMIT 10
    `);
    
    res.json({
      success: true,
      data: {
        bookings: bookingStats[0],
        services: serviceStats[0],
        owners: ownerStats[0],
        recentBookings
      }
    });
    
  } catch (error) {
    logger.error('Dashboard stats error', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// Get all bookings with pagination
router.get('/bookings', verifyAdminToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    const category = req.query.category;
    
    let whereClause = '1=1';
    const params = [];
    
    if (status) {
      whereClause += ' AND b.status = ?';
      params.push(status);
    }
    
    if (category) {
      whereClause += ' AND s.category = ?';
      params.push(category);
    }
    
    const [bookings] = await db.execute(`
      SELECT 
        b.*, 
        s.name as service_name, s.category, s.price,
        o.name as owner_name, o.phone as owner_phone
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      JOIN owners o ON b.owner_id = o.id
      WHERE ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    const [countResult] = await db.execute(`
      SELECT COUNT(*) as total
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE ${whereClause}
    `, params);
    
    res.json({
      success: true,
      data: {
        bookings,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
    
  } catch (error) {
    logger.error('Get bookings error', error);
    res.status(500).json({ error: 'Failed to load bookings' });
  }
});

// Update booking status
router.put('/bookings/:id/status', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const validStatuses = ['pending', 'confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    await db.execute(
      'UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
    
    res.json({
      success: true,
      message: 'Booking status updated'
    });
    
  } catch (error) {
    logger.error('Update booking status error', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// Get all owners
router.get('/owners', verifyAdminToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const [owners] = await db.execute(`
      SELECT 
        o.*,
        COUNT(s.id) as service_count,
        COUNT(b.id) as booking_count
      FROM owners o
      LEFT JOIN services s ON o.id = s.owner_id
      LEFT JOIN bookings b ON o.id = b.owner_id
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    const [countResult] = await db.execute('SELECT COUNT(*) as total FROM owners');
    
    res.json({
      success: true,
      data: {
        owners,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
    
  } catch (error) {
    logger.error('Get owners error', error);
    res.status(500).json({ error: 'Failed to load owners' });
  }
});

// Verify/unverify owner
router.put('/owners/:id/verify', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_verified } = req.body;
    
    await db.execute(
      'UPDATE owners SET is_verified = ?, updated_at = NOW() WHERE id = ?',
      [is_verified ? 1 : 0, id]
    );
    
    res.json({
      success: true,
      message: `Owner ${is_verified ? 'verified' : 'unverified'}`
    });
    
  } catch (error) {
    logger.error('Verify owner error', error);
    res.status(500).json({ error: 'Failed to update owner' });
  }
});

// Get all services
router.get('/services', verifyAdminToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const category = req.query.category;
    
    let whereClause = '1=1';
    const params = [];
    
    if (category) {
      whereClause += ' AND s.category = ?';
      params.push(category);
    }
    
    const [services] = await db.execute(`
      SELECT 
        s.*,
        o.name as owner_name, o.phone as owner_phone,
        COUNT(b.id) as booking_count
      FROM services s
      JOIN owners o ON s.owner_id = o.id
      LEFT JOIN bookings b ON s.id = b.service_id
      WHERE ${whereClause}
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    const [countResult] = await db.execute(`
      SELECT COUNT(*) as total FROM services s WHERE ${whereClause}
    `, params);
    
    res.json({
      success: true,
      data: {
        services,
        pagination: {
          page,
          limit,
          total: countResult[0].total,
          pages: Math.ceil(countResult[0].total / limit)
        }
      }
    });
    
  } catch (error) {
    logger.error('Get services error', error);
    res.status(500).json({ error: 'Failed to load services' });
  }
});

// Toggle service active status
router.put('/services/:id/toggle', verifyAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    await db.execute(`
      UPDATE services 
      SET is_active = NOT is_active, updated_at = NOW() 
      WHERE id = ?
    `, [id]);
    
    res.json({
      success: true,
      message: 'Service status updated'
    });
    
  } catch (error) {
    logger.error('Toggle service error', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Get system logs
router.get('/logs', verifyAdminToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const level = req.query.level;
    
    // This would typically read from your log files or log database
    // For now, return a placeholder response
    res.json({
      success: true,
      data: {
        logs: [],
        pagination: {
          page,
          limit,
          total: 0,
          pages: 0
        }
      },
      message: 'Log viewing feature to be implemented based on your logging setup'
    });
    
  } catch (error) {
    logger.error('Get logs error', error);
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

module.exports = router;