'use strict';
const bcrypt = require('bcryptjs');

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('password123', salt);

    const rows = [
      {
        email: 'sarah.md@vamora.com',
        password: hashedPassword,
        role: 'doctor',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        email: 'james.md@vamora.com',
        password: hashedPassword,
        role: 'doctor',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ];
    // Idempotent (audit B2): sarah.md@vamora.com is also created by the demo-users seeder.
    const existing = new Set((await queryInterface.sequelize.query('SELECT email FROM users', { type: queryInterface.sequelize.QueryTypes.SELECT })).map(r => r.email));
    const fresh = rows.filter(r => !existing.has(r.email));
    if (fresh.length) await queryInterface.bulkInsert('users', fresh, {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', {
      email: ['sarah.md@vamora.com', 'james.md@vamora.com']
    }, {});
  }
};
