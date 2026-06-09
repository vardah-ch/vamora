'use strict';
const express = require('express');
const router = express.Router();
const { authenticate } = require('../middlewares/auth');
const NotificationController = require('./NotificationController');

router.get('/',              authenticate, NotificationController.list);
router.patch('/read-all',   authenticate, NotificationController.markAllRead);
router.patch('/:id/read',   authenticate, NotificationController.markRead);

module.exports = router;
