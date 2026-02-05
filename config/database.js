const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'visitor_assistance',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  acquireTimeout: 60000,
  timeout: 60000,
  reconnect: true
};

const pool = mysql.createPool(dbConfig);

// Test connection
pool.getConnection()
  .then(connection => {
    logger.info('Database pool created successfully');
    connection.release();
  })
  .catch(err => {
    logger.error('Failed to create database pool:', err);
  });

module.exports = pool;