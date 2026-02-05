#!/usr/bin/env node

/**
 * Voice/IVR Flow Testing Script
 * Tests the complete voice flow with various scenarios
 */

const axios = require('axios');
const readline = require('readline');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_PHONE = process.env.TEST_PHONE || '+2348123456789';

class VoiceTester {
  constructor() {
    this.sessionId = `voice_test_${Date.now()}`;
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async makeVoiceRequest(endpoint, data = {}) {
    try {
      const response = await axios.post(`${BASE_URL}/voice/${endpoint}`, {
        sessionId: this.sessionId,
        phoneNumber: TEST_PHONE,
        isActive: true,
        ...data
      });

      return response.data;
    } catch (error) {
      console.error(`❌ Voice request to ${endpoint} failed:`, error.message);
      return null;
    }
  }

  parseVoiceXML(xml) {
    // Simple XML parser for voice responses
    const sayMatches = xml.match(/<Say[^>]*>(.*?)<\/Say>/g) || [];
    const getDigi