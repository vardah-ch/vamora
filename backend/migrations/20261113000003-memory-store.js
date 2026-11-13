'use strict';

/**
 * Typed personal-memory store + retrieval index.
 *
 * memory_items  – written memories, people, places, events and routines.
 *                 `patient_user_id` follows the users.id convention.
 *                 `patient_confirmed` = false for items added by someone other
 *                 than the patient, so the assistant can disclose provenance.
 * memory_index  – cached dense embeddings for retrievable units (photos and
 *                 memory items). Stored as JSONB arrays: corpora are per-patient
 *                 and small (10²–10³ items), so brute-force cosine is adequate
 *                 and avoids requiring the pgvector extension.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('memory_items', {
      id: { type: Sequelize.UUID, primaryKey: true, defaultValue: Sequelize.literal('gen_random_uuid()') },
      patient_user_id: {
        type: Sequelize.INTEGER, allowNull: false,
        references: { model: 'users', key: 'id' }, onDelete: 'CASCADE'
      },
      type: {
        type: Sequelize.ENUM('written', 'person', 'place', 'event', 'routine'),
        allowNull: false, defaultValue: 'written'
      },
      title: { type: Sequelize.STRING(200), allowNull: false },
      content: { type: Sequelize.TEXT, allowNull: true },
      people: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
      place: { type: Sequelize.STRING(200), allowNull: true },
      event_date: { type: Sequelize.DATEONLY, allowNull: true },
      routine_time: { type: Sequelize.STRING(5), allowNull: true }, // "HH:MM" local time
      photo_id: { type: Sequelize.UUID, allowNull: true },
      created_by_user_id: { type: Sequelize.INTEGER, allowNull: true },
      patient_confirmed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      deleted_at: { type: Sequelize.DATE, allowNull: true },
      deleted_by_user_id: { type: Sequelize.INTEGER, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('memory_items', ['patient_user_id', 'type']);

    await queryInterface.createTable('memory_index', {
      id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      patient_user_id: { type: Sequelize.INTEGER, allowNull: false },
      source_type: { type: Sequelize.STRING(16), allowNull: false },
      source_id: { type: Sequelize.STRING(64), allowNull: false },
      content_hash: { type: Sequelize.STRING(64), allowNull: false },
      model: { type: Sequelize.STRING(120), allowNull: false },
      embedding: { type: Sequelize.JSONB, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
    });
    await queryInterface.addIndex('memory_index', ['source_type', 'source_id', 'model'], { unique: true });
    await queryInterface.addIndex('memory_index', ['patient_user_id']);

    // ALTER TYPE … ADD VALUE must run outside a transaction block on older PostgreSQL.
    for (const v of ['help_request', 'access_request', 'access_changed', 'memory_deleted', 'care_team_changed']) {
      await queryInterface.sequelize.query(`ALTER TYPE "enum_Notifications_type" ADD VALUE IF NOT EXISTS '${v}'`);
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('memory_index');
    await queryInterface.dropTable('memory_items');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_memory_items_type"');
    // Enum values on Notifications cannot be removed in PostgreSQL – no-op.
  }
};
