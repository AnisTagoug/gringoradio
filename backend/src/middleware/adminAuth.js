const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// Middleware: must be logged in AND have is_admin=true in DB
const adminAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const result = await pool.query('SELECT id, username, is_admin FROM users WHERE id=$1', [decoded.id]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'User not found' });
    if (!result.rows[0].is_admin) return res.status(403).json({ error: 'Admin access required' });
    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = adminAuth;
