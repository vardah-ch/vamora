'use strict';
const authService = require('../services/authService');
const { badRequest } = require('../utils/http');

/** Authentication controller. Errors propagate to the central error handler. */

const register = async (req, res) => {
  const { email, password, role, name, dateOfBirth, phone } = req.body;
  const data = await authService.register({ email, password, role, name, dateOfBirth, phone });
  res.status(201).json({ success: true, message: 'User registered successfully', data });
};

const login = async (req, res) => {
  const data = await authService.login(req.body.email, req.body.password, req);
  res.status(200).json({ success: true, message: 'Login successful', data });
};

const getCurrentUser = async (req, res) => {
  res.status(200).json({ success: true, data: await authService.getCurrentUser(req.user.id) });
};

const refresh = async (req, res) => {
  if (!req.body?.refreshToken) throw badRequest('Refresh token is required');
  const data = await authService.refreshAccessToken(req.body.refreshToken);
  res.status(200).json({ success: true, message: 'Token refreshed successfully', data });
};

const logout = async (req, res) => {
  await authService.logout(req.user);
  res.status(200).json({ success: true, message: 'Logout successful' });
};

const forgotPassword = async (req, res) => {
  if (!req.body?.email) throw badRequest('Email is required');
  const result = await authService.requestPasswordReset(req.body.email);
  res.status(200).json({ success: true, ...result });
};

const resetPassword = async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) throw badRequest('Token and new password are required');
  if (String(newPassword).length < 8 || !/\d/.test(newPassword)) {
    throw badRequest('Password must be at least 8 characters long and contain a number');
  }
  const result = await authService.resetPassword(token, newPassword);
  res.status(200).json({ success: true, message: result.message });
};

module.exports = { register, login, getCurrentUser, refresh, logout, forgotPassword, resetPassword };
