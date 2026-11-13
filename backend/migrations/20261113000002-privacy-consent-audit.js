'use strict';

/**
 * Privacy, consent and audit architecture (audit findings S2–S5, S11, S14).
 *
 * Adds:
 *   • doctor_patient_assignments – explicit clinical care-team membership
 *   • access_grants              – consent-aware, permission-scoped access for
 *                                   caregivers (and optionally doctors for media)
 *   • audit_events               – append-only log (UPDATE/DELETE blocked by trigger)
 *   • patients.consent_mode & representative fields, patients.preferences
 *   • provenance + soft-delete columns on Photos and care_notes
 *   • users.token_version for server-side session revocation
 *
 * Backfill (non-destructive):
 *   • every existing caregiver↔patient relationship → an ACTIVE grant with the
 *     permissions the caregiver functionally had before, basis 'legacy_assignment',
 *     needs_review = true (the patient is prompted to review it);
 *   • patients.created_by_doctor_id → an active doctor assignment;
 *   • doctors linked (caregivers.doctor_id) to a patient's caregiver → assignment.
 */

const LEGACY_CAREGIVER_PERMISSIONS = [
  'memories.view', 'memories.upload', 'mood.view', 'observations.view',
  'observations.create', 'clinical.view', 'alerts.receive'
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const t = await queryInterface.sequelize.transaction();
    try {
      const q = (sql, opts = {}) => queryInterface.sequelize.query(sql, { transaction: t, ...opts });

      // ── users ────────────────────────────────────────────────────────────
      await queryInterface.addColumn('users', 'token_version', {
        type: Sequelize.INTEGER, allowNull: false, defaultValue: 0
      }, { transaction: t });

      // ── patients: consent mode, representative, preferences ─────────────
      await queryInterface.addColumn('patients', 'consent_mode', {
        type: Sequelize.ENUM('self', 'supported', 'representative'),
        allowNull: false, defaultValue: 'self'
      }, { transaction: t });
      await queryInterface.addColumn('patients', 'representative_user_id', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'users', key: 'id' }, onDelete: 'SET NULL'
      }, { transaction: t });
      await queryInterface.addColumn('patients', 'representative_basis', {
        type: Sequelize.TEXT, allowNull: true
      }, { transaction: t });
      await queryInterface.addColumn('patients', 'consent_mode_recorded_by', {
        type: Sequelize.INTEGER, allowNull: true,
        references: { model: 'users', key: 'id' }, onDelete: 'SET NULL'
      }, { transaction: t });
      await queryInterface.addColumn('patients', 'consent_mode_recorded_at', {
        type: Sequelize.DATE, allowNull: true
      }, { transaction: t });
      await queryInterface.addColumn('patients', 'preferences', {
        type: Sequelize.JSONB, allowNull: false, defaultValue: {}
      }, { transaction: t });

      // ── doctor_patient_assignments ──────────────────────────────────────
      await queryInterface.createTable('doctor_patient_assignments', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        patient_user_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE'
        },
        doctor_user_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE'
        },
        status: { type: Sequelize.ENUM('active', 'ended'), allowNull: false, defaultValue: 'active' },
        basis: { type: Sequelize.STRING(64), allowNull: false, defaultValue: 'clinical_assignment' },
        assigned_by_user_id: { type: Sequelize.INTEGER, allowNull: true },
        ended_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      }, { transaction: t });
      await q(`CREATE UNIQUE INDEX dpa_active_unique ON doctor_patient_assignments (patient_user_id, doctor_user_id) WHERE status = 'active'`);
      await queryInterface.addIndex('doctor_patient_assignments', ['doctor_user_id', 'status'], { transaction: t });

      // ── access_grants ───────────────────────────────────────────────────
      await queryInterface.createTable('access_grants', {
        id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
        patient_user_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE'
        },
        grantee_user_id: {
          type: Sequelize.INTEGER, allowNull: false,
          references: { model: 'users', key: 'id' }, onDelete: 'CASCADE'
        },
        permissions: { type: Sequelize.JSONB, allowNull: false, defaultValue: [] },
        status: {
          type: Sequelize.ENUM('pending', 'active', 'revoked', 'declined'),
          allowNull: false, defaultValue: 'pending'
        },
        basis: { type: Sequelize.STRING(64), allowNull: false },
        relationship_label: { type: Sequelize.STRING(100), allowNull: true },
        needs_review: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
        requested_by_user_id: { type: Sequelize.INTEGER, allowNull: true },
        decided_by_user_id: { type: Sequelize.INTEGER, allowNull: true },
        decided_at: { type: Sequelize.DATE, allowNull: true },
        revoked_at: { type: Sequelize.DATE, allowNull: true },
        created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') }
      }, { transaction: t });
      await q(`CREATE UNIQUE INDEX access_grants_open_unique ON access_grants (patient_user_id, grantee_user_id) WHERE status IN ('pending','active')`);
      await queryInterface.addIndex('access_grants', ['grantee_user_id', 'status'], { transaction: t });

      // ── audit_events (append-only) ──────────────────────────────────────
      await queryInterface.createTable('audit_events', {
        id: { type: Sequelize.BIGINT, primaryKey: true, autoIncrement: true },
        occurred_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('NOW') },
        actor_user_id: { type: Sequelize.INTEGER, allowNull: true },
        actor_role: { type: Sequelize.STRING(32), allowNull: true },
        action: { type: Sequelize.STRING(64), allowNull: false },
        resource_type: { type: Sequelize.STRING(48), allowNull: true },
        resource_id: { type: Sequelize.STRING(64), allowNull: true },
        patient_user_id: { type: Sequelize.INTEGER, allowNull: true },
        outcome: { type: Sequelize.ENUM('allowed', 'denied', 'error'), allowNull: false },
        reason: { type: Sequelize.STRING(200), allowNull: true },
        access_basis: { type: Sequelize.STRING(64), allowNull: true },
        grant_id: { type: Sequelize.INTEGER, allowNull: true },
        request_id: { type: Sequelize.STRING(40), allowNull: true }
      }, { transaction: t });
      await queryInterface.addIndex('audit_events', ['patient_user_id', 'occurred_at'], { transaction: t });
      await queryInterface.addIndex('audit_events', ['actor_user_id', 'occurred_at'], { transaction: t });
      await q(`
        CREATE OR REPLACE FUNCTION audit_events_block_mutation() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'audit_events is append-only';
        END; $$ LANGUAGE plpgsql;`);
      await q(`CREATE TRIGGER audit_events_no_update BEFORE UPDATE OR DELETE ON audit_events
               FOR EACH ROW EXECUTE FUNCTION audit_events_block_mutation();`);

      // ── Photos: provenance, soft delete, media metadata ─────────────────
      const photoCols = {
        uploadedByUserId: { type: Sequelize.INTEGER, allowNull: true },
        mimeType: { type: Sequelize.STRING(64), allowNull: true },
        voiceNoteMime: { type: Sequelize.STRING(64), allowNull: true },
        voiceUploadedByUserId: { type: Sequelize.INTEGER, allowNull: true },
        patientConfirmed: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        deletedAt: { type: Sequelize.DATE, allowNull: true },
        deletedByUserId: { type: Sequelize.INTEGER, allowNull: true }
      };
      for (const [col, def] of Object.entries(photoCols)) {
        await queryInterface.addColumn('Photos', col, def, { transaction: t });
      }

      // ── care_notes: category, provenance, retraction ────────────────────
      await queryInterface.addColumn('care_notes', 'category', {
        type: Sequelize.STRING(32), allowNull: false, defaultValue: 'general'
      }, { transaction: t });
      await queryInterface.addColumn('care_notes', 'retracted_at', { type: Sequelize.DATE, allowNull: true }, { transaction: t });
      await queryInterface.addColumn('care_notes', 'retracted_reason', { type: Sequelize.STRING(300), allowNull: true }, { transaction: t });

      // ── Moods: optional model-inference metadata (only when patient confirms) ─
      await queryInterface.addColumn('Moods', 'inference', { type: Sequelize.JSONB, allowNull: true }, { transaction: t });

      // ── ChatMessages: grounding metadata for assistant turns ────────────
      await queryInterface.addColumn('ChatMessages', 'metadata', { type: Sequelize.JSONB, allowNull: true }, { transaction: t });

      // ── Backfill ────────────────────────────────────────────────────────
      await q(`
        INSERT INTO access_grants (patient_user_id, grantee_user_id, permissions, status, basis,
                                   needs_review, decided_at, created_at, updated_at)
        SELECT DISTINCT p.user_id, c.user_id, CAST(:perms AS JSONB), 'active'::"enum_access_grants_status", 'legacy_assignment',
               true, NOW(), NOW(), NOW()
          FROM patient_caregiver_relationships r
          JOIN patients p ON p.id = r.patient_id
          JOIN caregivers c ON c.id = r.caregiver_id`,
      { replacements: { perms: JSON.stringify(LEGACY_CAREGIVER_PERMISSIONS) } });

      await q(`
        INSERT INTO doctor_patient_assignments (patient_user_id, doctor_user_id, basis, created_at, updated_at)
        SELECT p.user_id, p.created_by_doctor_id, 'legacy_creator', NOW(), NOW()
          FROM patients p
          JOIN users d ON d.id = p.created_by_doctor_id AND d.role = 'doctor'
         WHERE p.created_by_doctor_id IS NOT NULL
        ON CONFLICT DO NOTHING`);

      await q(`
        INSERT INTO doctor_patient_assignments (patient_user_id, doctor_user_id, basis, created_at, updated_at)
        SELECT DISTINCT p.user_id, c.doctor_id, 'legacy_caregiver_link', NOW(), NOW()
          FROM patient_caregiver_relationships r
          JOIN patients p ON p.id = r.patient_id
          JOIN caregivers c ON c.id = r.caregiver_id
          JOIN users d ON d.id = c.doctor_id AND d.role = 'doctor'
         WHERE c.doctor_id IS NOT NULL
        ON CONFLICT DO NOTHING`);

      await t.commit();
    } catch (e) {
      await t.rollback();
      throw e;
    }
  },

  async down(queryInterface) {
    const q = (sql) => queryInterface.sequelize.query(sql);
    await queryInterface.removeColumn('ChatMessages', 'metadata');
    await queryInterface.removeColumn('Moods', 'inference');
    for (const c of ['category', 'retracted_at', 'retracted_reason']) await queryInterface.removeColumn('care_notes', c);
    for (const c of ['uploadedByUserId', 'mimeType', 'voiceNoteMime', 'voiceUploadedByUserId', 'patientConfirmed', 'deletedAt', 'deletedByUserId']) {
      await queryInterface.removeColumn('Photos', c);
    }
    await q('DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events');
    await q('DROP FUNCTION IF EXISTS audit_events_block_mutation()');
    await queryInterface.dropTable('audit_events');
    await queryInterface.dropTable('access_grants');
    await queryInterface.dropTable('doctor_patient_assignments');
    for (const c of ['consent_mode', 'representative_user_id', 'representative_basis', 'consent_mode_recorded_by', 'consent_mode_recorded_at', 'preferences']) {
      await queryInterface.removeColumn('patients', c);
    }
    await queryInterface.removeColumn('users', 'token_version');
    await q('DROP TYPE IF EXISTS "enum_patients_consent_mode"');
    await q('DROP TYPE IF EXISTS "enum_doctor_patient_assignments_status"');
    await q('DROP TYPE IF EXISTS "enum_access_grants_status"');
    await q('DROP TYPE IF EXISTS "enum_audit_events_outcome"');
  }
};
