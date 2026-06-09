'use strict';
const db = require('../../models');

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getDoctorName(doctorUserId) {
  const doctor = await db.Doctor.findOne({ where: { userId: doctorUserId } });
  return doctor?.name || 'Your doctor';
}

async function getPatientName(patientUserId) {
  const patient = await db.Patient.findOne({ where: { userId: patientUserId } });
  return patient?.name || 'Your patient';
}

/**
 * Find the caregiver's users.id for a given patient's users.id.
 * Returns null if no caregiver is assigned.
 */
async function getCaregiverUserIdForPatient(patientUserId) {
  const patient = await db.Patient.findOne({ where: { userId: patientUserId } });
  if (!patient) return null;

  const [rows] = await db.sequelize.query(
    `SELECT c.user_id
       FROM patient_caregiver_relationships pcr
       JOIN caregivers c ON c.id = pcr.caregiver_id
      WHERE pcr.patient_id = :patientId
      LIMIT 1`,
    { replacements: { patientId: patient.id } }
  );
  return rows.length ? rows[0].user_id : null;
}

// ─── Core create helper ───────────────────────────────────────────────────────

/**
 * Persist a single notification row.
 *
 * @param {number}      recipientId  - users.id of the person who will see it
 * @param {string}      message      - human-readable text
 * @param {string}      type         - one of the ENUM values on the model
 * @param {string|null} entityId     - optional reference id (stored for future filtering)
 * @param {Date|null}   scheduledFor - if set, hidden until this datetime
 */
async function createNotification(recipientId, message, type, entityId = null, scheduledFor = null) {
  return db.Notification.create({ userId: recipientId, message, type, scheduledFor });
  // NOTE: to persist entityId add a migration that adds the column, then include it above.
}

// ─── Public API ───────────────────────────────────────────────────────────────

const NotificationService = {
  createNotification,

  /**
   * Call when a doctor creates an appointment for a patient.
   *
   * Sends:
   *   • an immediate "appointment scheduled" notification to the patient
   *   • a day-of reminder at 08:00 on the appointment date
   *
   * @param {number} patientUserId  - patient's users.id
   * @param {number} doctorUserId   - doctor's users.id  (= req.user.id in the route)
   * @param {string|Date} checkupDate
   * @param {string} [title]        - appointment title, optional
   */
  async sendCheckupNotifications(patientUserId, doctorUserId, checkupDate, title = 'your appointment') {
    const dateObj = new Date(checkupDate);
    const dateStr = dateObj.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });
    const doctorName = await getDoctorName(doctorUserId);

    // Immediate notification to patient
    await createNotification(
      patientUserId,
      `Dr. ${doctorName} scheduled "${title}" for ${dateStr}.`,
      'checkup_added',
      null
    );

    // Day-of reminder — visible only from 08:00 on the appointment date
    const reminder = new Date(dateObj);
    reminder.setHours(8, 0, 0, 0);
    if (reminder > new Date()) {
      await createNotification(
        patientUserId,
        `Reminder: You have an appointment today — "${title}".`,
        'checkup_reminder',
        null,
        reminder
      );
    }
  },

  /**
   * Call when a doctor prescribes a medication.
   *
   * @param {number} patientUserId      - patient's users.id
   * @param {object} medicationDetails  - { medicationName, dosage, frequency, doctorUserId }
   */
  async sendMedicationNotification(patientUserId, medicationDetails) {
    const { medicationName, dosage, frequency, doctorUserId } = medicationDetails;
    const doctorName = await getDoctorName(doctorUserId);

    const parts = [`Dr. ${doctorName} prescribed ${medicationName}`];
    if (dosage)     parts.push(`(${dosage})`);
    if (frequency)  parts.push(`— ${frequency}`);

    await createNotification(
      patientUserId,
      parts.join(' ') + '.',
      'medication_assigned',
      null
    );
  },

  /**
   * Call when a patient logs an alarming mood.
   * Automatically resolves the assigned caregiver from the patient's userId
   * so the caller does not need to look it up.
   *
   * @param {number} patientUserId - patient's users.id  (= req.user.id in moodRoutes)
   * @param {object} moodDetails   - { mood }
   */
  async sendMoodAlert(patientUserId, moodDetails) {
    const { mood } = moodDetails;
    const caregiverUserId = await getCaregiverUserIdForPatient(patientUserId);
    if (!caregiverUserId) return; // no caregiver assigned — nothing to do

    const patientName = await getPatientName(patientUserId);
    await createNotification(
      caregiverUserId,
      `${patientName} is feeling ${mood} today and may need your support.`,
      'mood_alert',
      String(patientUserId)
    );
  },
};

module.exports = NotificationService;
