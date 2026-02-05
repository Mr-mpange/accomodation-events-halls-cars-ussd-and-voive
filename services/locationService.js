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
  async getLocationFromCellTower(cellId, lac, mcc = '636', mnc = '01', networkCode = null) {
    try {
      // Check if API key is configured
      if (!this.openCellIdApiKey || this.openCellIdApiKey === 'your_opencellid_key') {
        logger.warn('OpenCellID API key not configured, using fallback location detection');
        return this.getFallbackLocationFromCellTower(cellId, lac, mcc, mnc, networkCode);
      }

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
      
      // Fallback to approximate location
      return this.getFallbackLocationFromCellTower(cellId, lac, mcc, mnc, networkCode);
    }
  }

  // Fallback location detection based on network codes
  getFallbackLocationFromCellTower(cellId, lac, mcc, mnc, networkCode = null) {
    try {
      // Basic location estimation based on MCC/MNC codes and network codes
      const networkLocations = {
        // Nigeria MCC = 636
        '636': {
          '01': { city: 'Lagos', state: 'Lagos', latitude: 6.5244, longitude: 3.3792 }, // MTN
          '02': { city: 'Abuja', state: 'FCT', latitude: 9.0765, longitude: 7.3986 }, // Airtel
          '03': { city: 'Port Harcourt', state: 'Rivers', latitude: 4.8156, longitude: 7.0498 }, // Glo
          '04': { city: 'Kano', state: 'Kano', latitude: 12.0022, longitude: 8.5920 } // 9mobile
        },
        // Alternative network code patterns
        '62101': { city: 'Lagos', state: 'Lagos', latitude: 6.5244, longitude: 3.3792 }, // MTN
        '62102': { city: 'Abuja', state: 'FCT', latitude: 9.0765, longitude: 7.3986 }, // Airtel
        '62103': { city: 'Port Harcourt', state: 'Rivers', latitude: 4.8156, longitude: 7.0498 }, // Glo
        '62104': { city: 'Kano', state: 'Kano', latitude: 12.0022, longitude: 8.5920 }, // 9mobile
        '62120': { city: 'Lagos', state: 'Lagos', latitude: 6.5244, longitude: 3.3792 }, // MTN variant
        '62130': { city: 'Abuja', state: 'FCT', latitude: 9.0765, longitude: 7.3986 }, // Airtel variant
      };

      let location = null;

      // Try networkCode first if provided
      if (networkCode && networkLocations[networkCode]) {
        location = networkLocations[networkCode];
        logger.info('Location detected from networkCode', { networkCode, location });
      }
      
      // Try MCC/MNC combination if networkCode didn't work
      if (!location) {
        location = networkLocations[mcc]?.[mnc];
        if (location) {
          logger.info('Location detected from MCC/MNC', { mcc, mnc, location });
        }
      }
      
      // Try direct network code lookup as fallback
      if (!location && networkCode) {
        const networkCodeVariant = `${mcc}${mnc}`;
        location = networkLocations[networkCodeVariant];
        if (location) {
          logger.info('Location detected from MCC+MNC variant', { networkCodeVariant, location });
        }
      }

      if (location) {
        logger.info('Using fallback location detection', { cellId, lac, mcc, mnc, networkCode, location });
        return {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: 5000, // 5km accuracy for fallback
          city: location.city,
          state: location.state,
          fallback: true
        };
      }

      // Default to Lagos if no match
      logger.info('Using default location (Lagos)', { cellId, lac, mcc, mnc, networkCode });
      return {
        latitude: 6.5244,
        longitude: 3.3792,
        accuracy: 10000,
        city: 'Lagos',
        state: 'Lagos',
        fallback: true,
        default: true
      };
    } catch (error) {
      logger.error('Fallback location detection failed', error);
      return null;
    }
  }

  // Get approximate city/area from coordinates
  async getCityFromCoordinates(latitude, longitude) {
    try {
      // Check if API key is configured
      if (!process.env.OPENCAGE_API_KEY || process.env.OPENCAGE_API_KEY === 'your_opencage_key') {
        logger.warn('OpenCage API key not configured, using fallback city detection');
        return this.getFallbackCityFromCoordinates(latitude, longitude);
      }

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
      
      // Fallback to approximate city detection
      return this.getFallbackCityFromCoordinates(latitude, longitude);
    }
  }

  // Fallback city detection based on coordinates
  getFallbackCityFromCoordinates(latitude, longitude) {
    try {
      // Major Nigerian cities with approximate boundaries
      const cities = [
        { name: 'Lagos', state: 'Lagos', lat: 6.5244, lng: 3.3792, radius: 0.5 },
        { name: 'Abuja', state: 'FCT', lat: 9.0765, lng: 7.3986, radius: 0.3 },
        { name: 'Kano', state: 'Kano', lat: 12.0022, lng: 8.5920, radius: 0.3 },
        { name: 'Ibadan', state: 'Oyo', lat: 7.3775, lng: 3.9470, radius: 0.3 },
        { name: 'Port Harcourt', state: 'Rivers', lat: 4.8156, lng: 7.0498, radius: 0.3 },
        { name: 'Benin City', state: 'Edo', lat: 6.3350, lng: 5.6037, radius: 0.2 },
        { name: 'Maiduguri', state: 'Borno', lat: 11.8311, lng: 13.1510, radius: 0.2 },
        { name: 'Zaria', state: 'Kaduna', lat: 11.0804, lng: 7.7076, radius: 0.2 },
        { name: 'Aba', state: 'Abia', lat: 5.1066, lng: 7.3667, radius: 0.2 },
        { name: 'Jos', state: 'Plateau', lat: 9.8965, lng: 8.8583, radius: 0.2 }
      ];

      // Find closest city
      let closestCity = null;
      let minDistance = Infinity;

      for (const city of cities) {
        const distance = Math.sqrt(
          Math.pow(latitude - city.lat, 2) + Math.pow(longitude - city.lng, 2)
        );
        
        if (distance < city.radius && distance < minDistance) {
          minDistance = distance;
          closestCity = city;
        }
      }

      if (closestCity) {
        logger.info('Fallback city detection successful', { 
          coordinates: { latitude, longitude },
          detectedCity: closestCity.name 
        });
        
        return {
          city: closestCity.name,
          state: closestCity.state,
          country: 'Nigeria',
          formatted: `${closestCity.name}, ${closestCity.state}, Nigeria`,
          fallback: true
        };
      }

      // Default to Lagos if no match
      logger.info('Using default city (Lagos) for coordinates', { latitude, longitude });
      return {
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
        formatted: 'Lagos, Lagos, Nigeria',
        fallback: true,
        default: true
      };
    } catch (error) {
      logger.error('Fallback city detection failed', error);
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