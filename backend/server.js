'use strict';
const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('============================================');
  console.log('  VAMORA - Backend API');
  console.log('============================================');
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Server running on: http://localhost:${PORT}`);
  console.log(`  Health check: http://localhost:${PORT}/health`);
  console.log(`  AI companion: ${process.env.GROQ_API_KEY ? 'LLM + retrieval' : 'retrieval-only (no GROQ_API_KEY)'}`);
  console.log('============================================\n');
});

module.exports = app;
