const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../utils/logger');
const Joi = require('joi');

// Get customer booking history
router.get('/bookings/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const { page = 1, limit = 10, status } = req.query;
    
    // Validate phone number
    const phoneSchema = Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required();
    const { error } = 