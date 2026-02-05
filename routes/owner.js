const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../utils/logger');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Joi = require('joi');

// Middleware to verify owner token
const verifyOwnerToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Owner registration
router.post('/register', async (req, res) => {
  try {
    const schema = Joi.object({
      name: Joi.string().required().min(2).max(100),
      email: Joi.string().email().required(),
      phone: Joi.string().required().pattern(/^\+?[1-9]\d{1,14}$/),
      password: Joi.string().required().min(6),
      business_name: Joi.string().required().min(2).max(100),
      business_type: Joi.string().valid('hotel', 'transport', 'event_hall', 'other').required(),
      address: Joi.string().required().min(10).max(500)
    });
    
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const { name, email, phone, password, business_name, business_type, address } = value;
    
    // Check if owner already exists
    const [existing] = await db.execute(
      'SELECT id FROM owners WHERE email = ? OR phone = ?',
      [email, phone]
    );
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Owner already exists with this email or phone' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create owner
    const [result] = await db.execute(`
      INSERT INTO owners 
      (name, email, phone, password, business_name, business_type, address, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
    `, [name, email, phone, hashedPassword, business_name, business_type, address]);
    
    const token = jwt.sign(
      { id: result.insertId, email, role: 'owner' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      success: true,
      message: 'Owner registered successfully',
      token,
      owner: {
        id: result.insertId,
        name,
        email,
        business_name,
        business_type
      }
    });
    
  } catch (error) {
    logger.error('Owner registration error', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Owner login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const [rows] = await db.execute(
      'SELECT * FROM owners WHERE email = ? AND is_active = 1',
      [email]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const owner = rows[0];
    const isValidPassword = await bcrypt.compare(password, owner.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { id: owner.id, email: owner.email, role: 'owner' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      token,
      owner: {
        id: owner.id,
        name: owner.name,
        email: owner.email,
        business_name: owner.business_name,
        business_type: owner.business_type,
        is_verified: owner.is_verified
      }
    });
    
  } catch (error) {
    logger.error('Owner login error', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Get owner dashboard
router.get('/dashboard', verifyOwnerToken, async (req, res) => {
  try {
    const ownerId = req.user.id;
    
    // Get service statistics
    const [serviceStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_services,
        COUNT(CASE WHEN is_active = 1 THEN 1 END) as active_services,
        COUNT(CASE WHEN category = 'stay' THEN 1 END) as stay_services,
        COUNT(CASE WHEN category = 'ride' THEN 1 END) as ride_services,
        COUNT(CASE WHEN category = 'hall' THEN 1 END) as hall_services
      FROM services
      WHERE owner_id = ?
    `, [ownerId]);
    
    // Get booking statistics
    const [bookingStats] = await db.execute(`
      SELECT 
        COUNT(*) as total_bookings,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_bookings,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_bookings,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_bookings,
        COUNT(CASE WHEN DATE(created_at) = CURDATE() THEN 1 END) as today_bookings
      FROM bookings
      WHERE owner_id = ?
    `, [ownerId]);
    
    // Get recent bookings
    const [recentBookings] = await db.execute(`
      SELECT 
        b.id, b.reference, b.phone_number, b.status, b.created_at,
        s.name as service_name, s.category
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE b.owner_id = ?
      ORDER BY b.created_at DESC
      LIMIT 10
    `, [ownerId]);
    
    res.json({
      success: true,
      data: {
        services: serviceStats[0],
        bookings: bookingStats[0],
        recentBookings
      }
    });
    
  } catch (error) {
    logger.error('Owner dashboard error', error);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

// Get owner services
router.get('/services', verifyOwnerToken, async (req, res) => {
  try {
    const ownerId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const [services] = await db.execute(`
      SELECT 
        s.*,
        COUNT(b.id) as booking_count
      FROM services s
      LEFT JOIN bookings b ON s.id = b.service_id
      WHERE s.owner_id = ?
      GROUP BY s.id
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `, [ownerId, limit, offset]);
    
    const [countResult] = await db.execute(
      'SELECT COUNT(*) as total FROM services WHERE owner_id = ?',
      [ownerId]
    );
    
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
    logger.error('Get owner services error', error);
    res.status(500).json({ error: 'Failed to load services' });
  }
});

// Create new service
router.post('/services', verifyOwnerToken, async (req, res) => {
  try {
    const schema = Joi.object({
      name: Joi.string().required().min(2).max(100),
      category: Joi.string().valid('stay', 'ride', 'hall').required(),
      description: Joi.string().max(1000),
      price: Joi.string().required().max(50),
      location: Joi.string().max(200),
      city: Joi.string().max(50),
      state: Joi.string().max(50),
      amenities: Joi.string().max(500),
      contact_info: Joi.string().max(200),
      images: Joi.array().items(Joi.string().uri()).max(5)
    });
    
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const ownerId = req.user.id;
    const {
      name, category, description, price, location, city, state,
      amenities, contact_info, images
    } = value;
    
    const [result] = await db.execute(`
      INSERT INTO services 
      (owner_id, name, category, description, price, location, city, state, 
       amenities, contact_info, images, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      ownerId, name, category, description, price, location, city, state,
      amenities, contact_info, JSON.stringify(images || [])
    ]);
    
    res.status(201).json({
      success: true,
      message: 'Service created successfully',
      service: {
        id: result.insertId,
        name,
        category,
        price
      }
    });
    
  } catch (error) {
    logger.error('Create service error', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// Update service
router.put('/services/:id', verifyOwnerToken, async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;
    
    // Verify service belongs to owner
    const [existing] = await db.execute(
      'SELECT id FROM services WHERE id = ? AND owner_id = ?',
      [id, ownerId]
    );
    
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    
    const schema = Joi.object({
      name: Joi.string().min(2).max(100),
      description: Joi.string().max(1000),
      price: Joi.string().max(50),
      location: Joi.string().max(200),
      city: Joi.string().max(50),
      state: Joi.string().max(50),
      amenities: Joi.string().max(500),
      contact_info: Joi.string().max(200),
      images: Joi.array().items(Joi.string().uri()).max(5),
      is_active: Joi.boolean()
    });
    
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const updates = [];
    const params = [];
    
    Object.keys(value).forEach(key => {
      if (value[key] !== undefined) {
        if (key === 'images') {
          updates.push(`${key} = ?`);
          params.push(JSON.stringify(value[key]));
        } else {
          updates.push(`${key} = ?`);
          params.push(value[key]);
        }
      }
    });
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    params.push(id);
    
    await db.execute(
      `UPDATE services SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    res.json({
      success: true,
      message: 'Service updated successfully'
    });
    
  } catch (error) {
    logger.error('Update service error', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Delete service
router.delete('/services/:id', verifyOwnerToken, async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;
    
    // Check if service has active bookings
    const [bookings] = await db.execute(
      'SELECT COUNT(*) as count FROM bookings WHERE service_id = ? AND status IN ("pending", "confirmed")',
      [id]
    );
    
    if (bookings[0].count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete service with active bookings' 
      });
    }
    
    const [result] = await db.execute(
      'DELETE FROM services WHERE id = ? AND owner_id = ?',
      [id, ownerId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }
    
    res.json({
      success: true,
      message: 'Service deleted successfully'
    });
    
  } catch (error) {
    logger.error('Delete service error', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// Get owner bookings
router.get('/bookings', verifyOwnerToken, async (req, res) => {
  try {
    const ownerId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const status = req.query.status;
    
    let whereClause = 'b.owner_id = ?';
    const params = [ownerId];
    
    if (status) {
      whereClause += ' AND b.status = ?';
      params.push(status);
    }
    
    const [bookings] = await db.execute(`
      SELECT 
        b.*, 
        s.name as service_name, s.category, s.price
      FROM bookings b
      JOIN services s ON b.service_id = s.id
      WHERE ${whereClause}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    const [countResult] = await db.execute(`
      SELECT COUNT(*) as total
      FROM bookings b
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
    logger.error('Get owner bookings error', error);
    res.status(500).json({ error: 'Failed to load bookings' });
  }
});

// Update booking status
router.put('/bookings/:id/status', verifyOwnerToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const ownerId = req.user.id;
    
    const validStatuses = ['confirmed', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const [result] = await db.execute(
      'UPDATE bookings SET status = ?, updated_at = NOW() WHERE id = ? AND owner_id = ?',
      [status, id, ownerId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    res.json({
      success: true,
      message: 'Booking status updated'
    });
    
  } catch (error) {
    logger.error('Update booking status error', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// Get owner profile
router.get('/profile', verifyOwnerToken, async (req, res) => {
  try {
    const ownerId = req.user.id;
    
    const [rows] = await db.execute(
      'SELECT id, name, email, phone, business_name, business_type, address, is_verified, created_at FROM owners WHERE id = ?',
      [ownerId]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Owner not found' });
    }
    
    res.json({
      success: true,
      owner: rows[0]
    });
    
  } catch (error) {
    logger.error('Get owner profile error', error);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// Update owner profile
router.put('/profile', verifyOwnerToken, async (req, res) => {
  try {
    const ownerId = req.user.id;
    
    const schema = Joi.object({
      name: Joi.string().min(2).max(100),
      phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/),
      business_name: Joi.string().min(2).max(100),
      address: Joi.string().min(10).max(500)
    });
    
    const { error, value } = schema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.details[0].message });
    }
    
    const updates = [];
    const params = [];
    
    Object.keys(value).forEach(key => {
      if (value[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(value[key]);
      }
    });
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    updates.push('updated_at = NOW()');
    params.push(ownerId);
    
    await db.execute(
      `UPDATE owners SET ${updates.join(', ')} WHERE id = ?`,
      params
    );
    
    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
    
  } catch (error) {
    logger.error('Update owner profile error', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;