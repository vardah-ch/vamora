'use strict';
const { Op } = require('sequelize');
const db = require('../../models');

const NotificationController = {
  // GET /api/v1/notifications
  async list(req, res) {
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
      res.json({ status: 'success', data: { notifications, unreadCount } });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  },

  // PATCH /api/v1/notifications/read-all
  async markAllRead(req, res) {
    try {
      await db.Notification.update(
        { isRead: true },
        { where: { userId: req.user.id, isRead: false } }
      );
      res.json({ status: 'success', message: 'All notifications marked as read.' });
    } catch (err) {
      res.status(500).json({ status: 'error', message: err.message });
    }
  },

  // PATCH /api/v1/notifications/:id/read
  async markRead(req, res) {
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
  },
};

module.exports = NotificationController;
