const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  multipleStatements: true
};

async function createDatabase() {
  const connection = await mysql.createConnection(dbConfig);
  
  try {
    await connection.execute(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'visitor_assistance'}`);
    console.log('Database created successfully');
  } catch (error) {
    console.error('Error creating database:', error);
  } finally {
    await connection.end();
  }
}

async function runMigrations() {
  const connection = await mysql.createConnection({
    ...dbConfig,
    database: process.env.DB_NAME || 'visitor_assistance'
  });

  try {
    // Create admins table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT PRIMARY KEY AUTO_INCREMENT,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create owners table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS owners (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        business_name VARCHAR(100) NOT NULL,
        business_type ENUM('hotel', 'transport', 'event_hall', 'other') NOT NULL,
        address TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        is_verified BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create locations table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS locations (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        city VARCHAR(50) NOT NULL,
        state VARCHAR(50) NOT NULL,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_city (city),
        INDEX idx_state (state)
      )
    `);

    // Create services table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS services (
        id INT PRIMARY KEY AUTO_INCREMENT,
        owner_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        category ENUM('stay', 'ride', 'hall') NOT NULL,
        description TEXT,
        price VARCHAR(50) NOT NULL,
        location VARCHAR(200),
        city VARCHAR(50),
        state VARCHAR(50),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        amenities TEXT,
        contact_info VARCHAR(200),
        images JSON,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
        INDEX idx_category (category),
        INDEX idx_city (city),
        INDEX idx_active (is_active)
      )
    `);

    // Create location_sessions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS location_sessions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        session_id VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        cell_id VARCHAR(20),
        lac VARCHAR(20),
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8),
        city VARCHAR(50),
        state VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_session (session_id),
        INDEX idx_phone (phone_number),
        INDEX idx_updated (updated_at)
      )
    `);

    // Create voice_sessions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS voice_sessions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        phone_number VARCHAR(20) NOT NULL,
        service_id INT,
        session_data JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL,
        INDEX idx_phone (phone_number),
        INDEX idx_created (created_at)
      )
    `);

    // Create bookings table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INT PRIMARY KEY AUTO_INCREMENT,
        reference VARCHAR(20) UNIQUE NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        service_id INT NOT NULL,
        owner_id INT NOT NULL,
        location_data JSON,
        location_recording VARCHAR(500),
        status ENUM('pending', 'confirmed', 'completed', 'cancelled') DEFAULT 'pending',
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
        FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE,
        INDEX idx_reference (reference),
        INDEX idx_phone (phone_number),
        INDEX idx_status (status),
        INDEX idx_created (created_at)
      )
    `);

    // Create system_logs table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        level ENUM('error', 'warn', 'info', 'debug') NOT NULL,
        message TEXT NOT NULL,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_level (level),
        INDEX idx_created (created_at)
      )
    `);

    // Create ussd_analytics table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS ussd_analytics (
        id INT PRIMARY KEY AUTO_INCREMENT,
        session_id VARCHAR(100) NOT NULL,
        phone_number VARCHAR(20) NOT NULL,
        step VARCHAR(50) NOT NULL,
        input VARCHAR(100),
        response_time_ms INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session (session_id),
        INDEX idx_phone (phone_number),
        INDEX idx_step (step),
        INDEX idx_created (created_at)
      )
    `);

    console.log('All tables created successfully');

  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

async function main() {
  try {
    console.log('Starting database migration...');
    await createDatabase();
    await runMigrations();
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { createDatabase, runMigrations };