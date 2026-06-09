'use strict';
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const {
  getNotifications,
  markRead,
  markAllRead,
} = require('../controllers/NotificationController');

// GET  /api/v1/notifications          — fetch all notifications for the logged-in user
router.get('/', authenticate, getNotifications);

// PATCH /api/v1/notifications/read-all — must be declared BEFORE /:id/read
// so Express does not treat "read-all" as an :id parameter
router.patch('/read-all', authenticate, markAllRead);

// PATCH /api/v1/notifications/:id/read — mark one notification as read
router.patch('/:id/read', authenticate, markRead);

module.exports = router;
