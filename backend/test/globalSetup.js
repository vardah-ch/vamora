'use strict';
/**
 * Starts a throw-away PostgreSQL 16 server (embedded-postgres: real PostgreSQL
 * binaries, not a mock), creates the test database and applies ALL
 * migrations with sequelize-cli – the same path used in production.
 */
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

module.exports = async () => {
  require('./env');
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const dataDir = path.join(os.tmpdir(), `vamora-pg-${process.pid}`);
  fs.rmSync(dataDir, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir, user: 'postgres', password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT), persistent: false, onLog: () => {}, onError: () => {}
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(process.env.DB_NAME_TEST);
  await pg.createDatabase('vamora_migration_test');
  globalThis.__VAMORA_PG__ = pg;

  try {
    execSync('npx sequelize-cli db:migrate', {
      cwd: path.join(__dirname, '..'), env: { ...process.env }, stdio: 'pipe'
    });
  } catch (e) {
    await pg.stop();
    throw new Error(`Migrations failed:\n${e.stdout}\n${e.stderr}`);
  }
};
