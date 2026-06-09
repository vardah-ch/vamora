'use strict';
const { Op } = require('sequelize');
const db = require('../../models');

/**
 * GET /api/v1/notifications
 * Returns all visible notifications for the authenticated user,
 * sorted newest-first. Scheduled reminders are hidden until their
 * scheduledFor time has passed.
 */
const getNotifications = async (req, res) => {
  try {
    const notifications = await db.Notification.findAll({
      where: {
        userId: req.user.id,
        [Op.or]: [
          { scheduledFor: null },
          { scheduledFor: { [Op.lte]: new Date() } },
        ],
      },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    const unreadCount = notifications.filter(n => !n.isRead).length;

    res.json({
      status: 'success',
      data: { notifications, unreadCount },
    });
  } catch (err) {
    console.error('GET NOTIFICATIONS ERROR:', err.message);
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * PATCH /api/v1/notifications/:id/read
 * Marks a single notification as read. Scoped to req.user.id so
 * a user can never mark another user's notifications.
 */
const markRead = async (req, res) => {
  try {
    const notification = await db.Notification.findOne({
      where: { id: req.params.id, userId: req.user.id },
    });

    if (!notification) {
      return res.status(404).json({ status: 'error', message: 'Notification not found.' });
    }

    await notification.update({ isRead: true });
    res.json({ status: 'success', data: notification });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

/**
 * PATCH /api/v1/notifications/read-all
 * Marks every unread notification for the user as read.
 */
const markAllRead = async (req, res) => {
  try {
    await db.Notification.update(
      { isRead: true },
      { where: { userId: req.user.id, isRead: false } }
    );
    res.json({ status: 'success', message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
};

module.exports = { getNotifications, markRead, markAllRead };
