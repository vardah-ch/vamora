require('dotenv').config({ quiet: true });

// Hosted Postgres (Neon, Vercel, Render…) usually provides one connection string.
const DB_URL_VAR = ['DATABASE_URL', 'POSTGRES_URL'].find(k => process.env[k]);

module.exports = {
  development: {
    username: process.env.DB_USER || 'vamora_user',
    password: process.env.DB_PASSWORD || 'vamora_secure_password_2026',
    database: process.env.DB_NAME || 'vamora_db',
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  },
  test: {
    username: process.env.DB_USER || 'vamora_user',
    password: process.env.DB_PASSWORD || 'vamora_secure_password_2026',
    database: process.env.DB_NAME_TEST || (process.env.DB_NAME ? `${process.env.DB_NAME}_test` : 'vamora_db_test'),
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
  },
  production: {
    ...(DB_URL_VAR ? { use_env_variable: DB_URL_VAR } : {}),
    // Explicit driver so serverless bundlers include it.
    dialectModule: require('pg'),
    // Record which seeders have run, so `db:seed:all` is safe to repeat on deploy.
    seederStorage: 'sequelize',
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres',
    logging: false,
    // TLS is required for hosted databases; DB_SSL=false only for a local rehearsal.
    dialectOptions: process.env.DB_SSL === 'false' ? {} : {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  }
};
