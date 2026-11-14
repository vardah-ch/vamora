'use strict';
/**
 * Optional database storage for uploaded media (MEDIA_STORE=db), for hosts
 * without a persistent filesystem. Additive only: creates a new table.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('media_blobs', {
      name: { type: Sequelize.STRING(255), primaryKey: true },
      mime: { type: Sequelize.STRING(100), allowNull: false },
      data: { type: Sequelize.BLOB, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('media_blobs');
  }
};
