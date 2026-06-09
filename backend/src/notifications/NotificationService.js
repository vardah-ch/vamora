'use strict';
const db = require('../../models');

const NotificationService = {
  async _create(userId, type, message, scheduledFor = null) {
    return db.Notification.create({ userId, type, message, scheduledFor });
  },

  /**
   * Call when a doctor assigns a medication to a patient.
   * @param {number} patientUserId - the patient's users.id
   * @param {string} medicationName
   * @param {string} doctorName
   */
  async notifyMedicationAssigned(patientUserId, medicationName, doctorName) {
    const message = `Dr. ${doctorName} has prescribed ${medicationName} for you.`;
    return this._create(patientUserId, 'medication_assigned', message);
  },

  /**
   * Call when a checkup / appointment is added.
   * Creates an immediate notification and a day-of reminder at 08:00.
   * @param {number} patientUserId - the patient's users.id
   * @param {string} checkupTitle
   * @param {string|Date} appointmentDate
   */
  async notifyCheckupAdded(patientUserId, checkupTitle, appointmentDate) {
    const dateObj = new Date(appointmentDate);
    const dateStr = dateObj.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    });

    await this._create(
      patientUserId,
      'checkup_added',
      `Appointment scheduled: "${checkupTitle}" on ${dateStr}.`
    );

    const reminder = new Date(dateObj);
    reminder.setHours(8, 0, 0, 0);
    if (reminder > new Date()) {
      await this._create(
        patientUserId,
        'checkup_reminder',
        `Reminder: You have an appointment today — "${checkupTitle}".`,
        reminder
      );
    }
  },

  /**
   * Call when a patient logs an alarming mood (sad, anxious, frustrated).
   * Notifies the assigned caregiver.
   * @param {number} caregiverUserId - the caregiver's users.id
   * @param {string} patientName
   * @param {string} mood
   */
  async notifyMoodAlert(caregiverUserId, patientName, mood) {
    const message = `${patientName} is feeling ${mood} today and may need your support.`;
    return this._create(caregiverUserId, 'mood_alert', message);
  },
};

module.exports = NotificationService;
