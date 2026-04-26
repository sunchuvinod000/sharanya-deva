import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as userModel from '../models/user.model.js';

const router = Router();

function signRefresh(userId) {
  return jwt.sign({ id: userId }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }
    const user = await userModel.findByEmail(String(email).trim());
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    const safe = { id: user.id, email: user.email, name: user.name, role: user.role };
    const accessToken = jwt.sign(safe, process.env.JWT_SECRET, { expiresIn: '24h' });
    const refreshToken = signRefresh(user.id);
    return res.json({
      accessToken,
      refreshToken,
      user: safe,
    });
  } catch (err) {
    console.error('[POST /auth/login]', err?.message ?? err);
    return res.status(500).json({ message: 'Server error during login.' });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body ?? {};
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required.' });
    }
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      return res.status(401).json({ message: 'Invalid or expired refresh token.' });
    }
    const user = await userModel.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found.' });
    }
    const safe = { id: user.id, email: user.email, name: user.name, role: user.role };
    const accessToken = jwt.sign(safe, process.env.JWT_SECRET, { expiresIn: '24h' });
    return res.json({ accessToken });
  } catch (err) {
    console.error('[POST /auth/refresh]', err?.message ?? err);
    return res.status(500).json({ message: 'Server error during refresh.' });
  }
});

export default router;
