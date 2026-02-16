import dotenv from 'dotenv';
dotenv.config();

export const config = {
  site: {
    title: process.env.SITE_TITLE || 'Order System Warehouse',
    url: process.env.SITE_URL || 'http://localhost:3000',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
  },
  debug: (process.env.APP_DEBUG || '').trim() === 'true',
  port: parseInt(process.env.PORT, 10) || 3000,
  database: {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT, 10) || 5432
  }
};

const sequelizeConfig = {
  development: {
    username: config.database.user,
    password: config.database.password,
    database: config.database.database,
    host: config.database.host,
    port: config.database.port,
    dialect: 'postgres'
  },
  test: {
    username: config.database.user,
    password: config.database.password,
    database: config.database.database + '_test',
    host: config.database.host,
    port: config.database.port,
    dialect: 'postgres'
  },
  production: {
    username: config.database.user,
    password: config.database.password,
    database: config.database.database,
    host: config.database.host,
    port: config.database.port,
    dialect: 'postgres'
  }
};

export default sequelizeConfig;
