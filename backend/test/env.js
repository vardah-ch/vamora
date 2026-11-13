'use strict';
// Environment for every test worker. Real PostgreSQL (embedded) – see globalSetup.js.
const os = require('os');
const path = require('path');

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = process.env.TEST_PG_PORT || '54330';
process.env.DB_USER = 'postgres';
process.env.DB_PASSWORD = 'vamora_test_pw';
process.env.DB_NAME_TEST = 'vamora_test';
process.env.EMBEDDINGS = 'off';            // deterministic, offline tests (dense retrieval is evaluated in eval/)
process.env.GROQ_API_KEY = '';             // never call a real LLM from tests
process.env.REGISTER_RATE_LIMIT = '1000';
process.env.LOGIN_RATE_LIMIT = '10';
process.env.UPLOAD_PATH = path.join(os.tmpdir(), 'vamora-test-uploads');
process.env.BCRYPT_ROUNDS = '4';               // production default is 12
