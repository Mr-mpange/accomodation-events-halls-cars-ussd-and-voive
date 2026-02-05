const express = require('express');
const router = express.Router();
const ussdService = require('../services/ussdService');
const logger = require('../utils/logger');

// Main USSD endpoint
router.post('/callback', async (req, res) => {
  try {
    const {
      sessionId,
      phoneNumber,
      text,
      networkCode,
      serviceCode
    } = req.body;

    // Extract cell tower information from Africa's Talking metadata
    const cellId = req.body.cellId || req.headers['x-cell-id'];
    const lac = req.body.lac || req.headers['x-lac'];

    logger.info('USSD request received', {
      sessionId,
      phoneNumber,
      text,
      networkCode,
      cellId,
      lac
    });

    const response = await ussdService.handleUSSDRequest(
      sessionId,
      phoneNumber,
      text,
      networkCode,
      cellId,
      lac
    );

    res.set('Content-Type', 'text/plain');
    res.send(response);

  } catch (error) {
    logger.error('USSD callback error', error);
    res.set('Content-Type', 'text/plain');
    res.send('END Service temporarily unavailable. Please try again later.');
  }
});

// Test endpoint for USSD simulation
router.post('/test', async (req, res) => {
  try {
    const {
      phoneNumber = '+2348123456789',
      text = '',
      sessionId = `test_${Date.now()}`,
      networkCode = '62120',
      cellId = '12345',
      lac = '678'
    } = req.body;

    const response = await ussdService.handleUSSDRequest(
      sessionId,
      phoneNumber,
      text,
      networkCode,
      cellId,
      lac
    );

    res.json({
      success: true,
      response,
      sessionId,
      phoneNumber
    });

  } catch (error) {
    logger.error('USSD test error', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get session status
router.get('/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = ussdService.sessions.get(sessionId);
    
    if (session) {
      res.json({
        success: true,
        session: {
          sessionId: session.sessionId,
          phoneNumber: session.phoneNumber,
          step: session.step,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }
  } catch (error) {
    logger.error('Session status error', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear session (for testing)
router.delete('/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    ussdService.clearSession(sessionId);
    
    res.json({
      success: true,
      message: 'Session cleared'
    });
  } catch (error) {
    logger.error('Session clear error', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;