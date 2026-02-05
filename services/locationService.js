const axios = require('axios');
const logger = require('../utils/logger');
const db = require('../config/database');

class LocationService {
  constructor() {
    this.openCellIdApiKey = process.env.OPENCELLID_API_KEY;
    this.openCellIdBaseUrl = 'https://opencellid.org/cell/get';
  }

  // Extract location from Africa's Talking metadata
  extractLocationFromMetadata(sessionId, phoneNumber, networkCode, cellId, lac) {
    logger.info('Extracting location from metadata', {
      sessionId,
      phoneNumber,
      networkCode,
      cellId,
      lac
    });

    return {
      sessionId,
      phoneNumber,
      networkCode,
      cellId,
      lac,
      timestamp: new Date()
    };
  }

  // Get location from OpenCellID
  async getLocationFromCellTower(cellId, lac, mcc = '636', mnc = '01') {
    try {
      const response = await axios.get(this.openCellIdBaseUrl, {
        params: {
          key: this.openCellIdApiKey,
          mcc: mcc, // Mobile Country Code for Nigeria
          mnc: mnc, // Mobile Network Code
          lac: lac,
          cellid: cellId,
          format: 'json'
        }
      });

      if (response.data && response.data.lat && response.data.lon) {
        const location = {
          latitude: response.data.lat,
          longitude: response.data.lon,
          accuracy: response.data.range || 1000,
          address: response.data.address || null
        };

        logger.info('Location retrieved from OpenCellID', location);
        return location;
      }

      return null;
    } catch (error) {
      logger.error('Failed to get location from OpenCellID', {
        cellId,
        lac,
        error: error.message
      });
      return null;
    }
  }

  // Get approximate city/area from coordinates
  async getCityFromCoordinates(latitude, longitude) {
    try {
      // Using a reverse geocoding service (you can replace with your preferred service)
      const response = await axios.get(
        `https://api.opencagedata.com/geocode/v1/json`,
        {
          params: {
            q: `${latitude},${longitude}`,
            key: process.env.OPENCAGE_API_KEY, // You'll need to add this to .env
            limit: 1,
            no_annotations: 1
          }
        }
      );

      if (response.data.results && response.data.results.length > 0) {
        const result = response.data.results[0];
        return {
          city: result.components.city || result.components.town || result.components.village,
          state: result.components.state,
          country: result.components.country,
          formatted: result.formatted
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to get city from coordinates', {
        latitude,
        longitude,
        error: error.message
      });
      return null;
    }
  }

  // Get predefined locations for manual selection
  async getPredefinedLocations() {
    try {
      const [rows] = await db.execute(`
        SELECT id, name, city, state, latitude, longitude 
        FROM locations 
        WHERE is_active = 1 
        ORDER BY city, name
      `);

      return rows;
    } catch (error) {
      logger.error('Failed to get predefined locations', error);
      throw error;
    }
  }

  // Get locations by city
  async getLocationsByCity(city) {
    try {
      const [rows] = await db.execute(`
        SELECT id, name, city, state, latitude, longitude 
        FROM locations 
        WHERE city LIKE ? AND is_active = 1 
        ORDER BY name
      `, [`%${city}%`]);

      return rows;
    } catch (error) {
      logger.error('Failed to get locations by city', { city, error });
      throw error;
    }
  }

  // Save user location session
  async saveLocationSession(sessionId, phoneNumber, locationData) {
    try {
      await db.execute(`
        INSERT INTO location_sessions 
        (session_id, phone_number, cell_id, lac, latitude, longitude, city, state, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE
        cell_id = VALUES(cell_id),
        lac = VALUES(lac),
        latitude = VALUES(latitude),
        longitude = VALUES(longitude),
        city = VALUES(city),
        state = VALUES(state),
        updated_at = NOW()
      `, [
        sessionId,
        phoneNumber,
        locationData.cellId || null,
        locationData.lac || null,
        locationData.latitude || null,
        locationData.longitude || null,
        locationData.city || null,
        locationData.state || null
      ]);

      logger.info('Location session saved', { sessionId, phoneNumber });
    } catch (error) {
      logger.error('Failed to save location session', { sessionId, error });
      throw error;
    }
  }

  // Get user's last known location
  async getUserLastLocation(phoneNumber) {
    try {
      const [rows] = await db.execute(`
        SELECT * FROM location_sessions 
        WHERE phone_number = ? 
        ORDER BY updated_at DESC 
        LIMIT 1
      `, [phoneNumber]);

      return rows[0] || null;
    } catch (error) {
      logger.error('Failed to get user last location', { phoneNumber, error });
      throw error;
    }
  }
}

module.exports = new LocationService();