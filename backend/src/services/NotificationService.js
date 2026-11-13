'use strict';
const { Op } = require('sequelize');
const db = require('../../models');

/**
 * Notifications. Alerts about a patient go ONLY to people the patient has
 * allowed to receive them (permission `alerts.receive` on an active grant).
 * Previously the first caregiver row received every alert regardless of consent.
 */

async function getDoctorName(doctorUserId) {
  const doctor = await db.Doctor.findOne({ where: { userId: doctorUserId } });
  return doctor?.name || 'Your doctor';
}

async function getPatientName(patientUserId) {
  const patient = await db.Patient.findOne({ where: { userId: patientUserId } });
  return patient?.name || 'Your patient';
}

/** users.id of everyone allowed to receive alerts about this patient. */
async function getAlertRecipients(patientUserId) {
  const grants = await db.AccessGrant.findAll({
    where: { patientUserId, status: 'active', permissions: { [Op.contains]: ['alerts.receive'] } },
    attributes: ['granteeUserId']
  });
  return [...new Set(grants.map(g => g.granteeUserId))];
}

async function createNotification(recipientId, message, type, scheduledFor = null) {
  return db.Notification.create({ userId: recipientId, message, type, scheduledFor });
}

const NotificationService = {
  createNotification,
  getAlertRecipients,

  async sendCheckupNotifications(patientUserId, doctorUserId, checkupDate, title = 'your appointment') {
    const dateObj = new Date(checkupDate);
    const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
    const doctorName = await getDoctorName(doctorUserId);
    await createNotification(patientUserId, `Dr. ${doctorName} scheduled "${title}" for ${dateStr}.`, 'checkup_added');
    const reminder = new Date(dateObj);
    reminder.setHours(8, 0, 0, 0);
    if (reminder > new Date()) {
      await createNotification(patientUserId, `Reminder: You have an appointment today — "${title}".`, 'checkup_reminder', reminder);
    }
  },

  async sendMedicationNotification(patientUserId, { medicationName, dosage, frequency, doctorUserId }) {
    const doctorName = await getDoctorName(doctorUserId);
    const parts = [`Dr. ${doctorName} prescribed ${medicationName}`];
    if (dosage) parts.push(`(${dosage})`);
    if (frequency) parts.push(`— ${frequency}`);
    await createNotification(patientUserId, parts.join(' ') + '.', 'medication_assigned');
  },

  /** Self-reported low mood → permitted caregivers. Never called for unconfirmed camera estimates. */
  async sendMoodAlert(patientUserId, { mood }) {
    const recipients = await getAlertRecipients(patientUserId);
    if (!recipients.length) return 0;
    const patientName = await getPatientName(patientUserId);
    await Promise.all(recipients.map(r => createNotification(r,
      `${patientName} said they are feeling ${mood} and may need your support.`, 'mood_alert')));
    return recipients.length;
  },

  /** The patient asked the assistant for help → permitted caregivers. */
  async sendHelpRequest(patientUserId) {
    const recipients = await getAlertRecipients(patientUserId);
    if (!recipients.length) return 0;
    const patientName = await getPatientName(patientUserId);
    await Promise.all(recipients.map(r => createNotification(r,
      `${patientName} asked for help in VAMORA. Please check in with them.`, 'help_request')));
    return recipients.length;
  }
};

module.exports = NotificationService;
