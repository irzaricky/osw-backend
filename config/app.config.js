require('dotenv').config();

const config = {
  site: {
    title: process.env.SITE_TITLE || 'Order System Warehouse',
    url: process.env.SITE_URL || 'http://localhost:3000'
  },
  debug: process.env.DEBUG === 'true',
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'password',
    database: process.env.DB_NAME || 'osw_backend',
    port: parseInt(process.env.DB_PORT, 10) || 5432
  }
};

module.exports = config;
