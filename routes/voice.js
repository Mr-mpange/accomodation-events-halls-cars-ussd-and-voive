const express = require('express');
const router = express.Router();
const voiceService = require('../services/voiceService');
const logger = require('../utils/logger');

// Main voice callback endpoint
router.post('/callback', async (req, res) => {
  try {
    const {
      sessionId,
      phoneNumber,
      isActive,
      dtmfDigits,
      recordingUrl,
      durationInSeconds
    } = req.body;

    logger.info('Voice callback received', {
      sessionId,
      phoneNumber,
      isActive,
      dtmfDigits,
      recordingUrl,
      durationInSeconds
    });

    const response = await voiceService.handleIncomingCall(
      sessionId,
      phoneNumber,
      isActive
    );

    res.set('Content-Type', 'application/xml');
    res.send(response);

  } catch (error) {
    logger.error('Voice callback error', error);
    res.set('Content-Type', 'application/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="woman">Sorry, we encountered an error. Please try again later.</Say>
        <Hangup/>
      </Response>`);
  }
});

// Main menu selection handler
router.post('/main-menu', async (req, res) => {
  try {
    const { sessionId, phoneNumber, dtmfDigits } = req.body;

    logger.info('Voice main menu selection', {
      sessionId,
      phoneNumber,
      dtmfDigits
    });

    const response = await voiceService.handleMainMenuSelection(
      sessionId,
      phoneNumber,
      dtmfDigits
    );

    res.set('Content-Type', 'application/xml');
    res.send(response);

  } catch (error) {
    logger.error('Voice main menu error', error);
    res.set('Content-Type', 'application/xml');
    res.send(voiceService.generateErrorResponse());
  }
});

// Service selection handler
router.post('/service-selection', async (req, res) => {
  try {
    const { sessionId, phoneNumber, dtmfDigits } = req.body;

    logger.info('Voice service selection', {
      sessionId,
      phoneNumber,
      dtmfDigits
    });

    const response = await voiceService.handleServiceSelection(
      sessionId,
      phoneNumber,
      dtmfDigits
    );

    res.set('Content-Type', 'application/xml');
    res.send(response);

  } catch (error) {
    logger.error('Voice service selection error', error);
    res.set('Content-Type', 'application/xml');
    res.send(voiceService.generateErrorResponse());
  }
});

// Service action handler (book, details, back)
router.post('/service-action', async (req, res) => {
  try {
    const { sessionId, phoneNumber, dtmfDigits } = req.body;

    logger.info('Voice service action', {
      sessionId,
      phoneNumber,
      dtmfDigits
    });

    const response = await voiceService.handleServiceAction(
      sessionId,
      phoneNumber,
      dtmfDigits
    );

    res.set('Content-Type', 'application/xml');
    res.send(response);

  } catch (error) {
    logger.error('Voice service action error', error);
    res.set('Content-Type', 'application/xml');
    res.send(voiceService.generateErrorResponse());
  }
});

// Location recording handler
router.post('/location-recording', async (req, res) => {
  try {
    const { sessionId, phoneNumber, recordingUrl } = req.body;

    logger.info('Voice location recording', {
      sessionId,
      phoneNumber,
      recordingUrl
    });

    const response = await voiceService.handleLocationRecording(
      sessionId,
      phoneNumber,
      recordingUrl
    );

    res.set('Content-Type', 'application/xml');
    res.send(response);

  } catch (error) {
    logger.error('Voice location recording error', error);
    res.set('Content-Type', 'application/xml');
    res.send(voiceService.generateErrorResponse());
  }
});

// Collect location digits handler
router.post('/collect-location', async (req, res) => {
  try {
    const { sessionId, phoneNumber, dtmfDigits } = req.body;

    logger.info('Voice location collection', {
      sessionId,
      phoneNumber,
      dtmfDigits
    });

    // For now, just acknowledge and proceed to recording
    const response = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say voice="woman">Thank you. Now please describe your exact location after the beep, then press hash.</Say>
        <Record timeout="30" trimSilence="true" callbackUrl="${process.env.VOICE_CALLBACK_URL}/location-recording"/>
      </Response>`;

    res.set('Content-Type', 'application/xml');
    res.send(response);

  } catch (error) {
    logger.error('Voice location collection error', error);
    res.set('Content-Type', 'application/xml');
    res.send(voiceService.generateErrorResponse());
  }
});

// Voice status endpoint
router.get('/status/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = voiceService.voiceSessions.get(sessionId);
    
    if (session) {
      res.json({
        success: true,
        session: {
          sessionId,
          phoneNumber: session.phoneNumber,
          step: session.step,
          category: session.category
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Voice session not found'
      });
    }
  } catch (error) {
    logger.error('Voice status error', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test voice endpoint
router.post('/test', async (req, res) => {
  try {
    const {
      phoneNumber = '+2348123456789',
      sessionId = `voice_test_${Date.now()}`,
      isActive = true
    } = req.body;

    const response = await voiceService.handleIncomingCall(
      sessionId,
      phoneNumber,
      isActive
    );

    res.json({
      success: true,
      response,
      sessionId,
      phoneNumber
    });

  } catch (error) {
    logger.error('Voice test error', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;