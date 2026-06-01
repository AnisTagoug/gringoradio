const bcrypt = require('bcryptjs');
const { pool } = require('../config/db');

// GET /api/admin/users — list all users with their station info
const getUsers = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT u.id, u.username, u.email, u.is_admin, u.created_at,
             s.id as station_id, s.name as station_name,
             s.status as station_status, s.stream_url
      FROM users u
      LEFT JOIN stations s ON s.user_id = u.id
      ORDER BY u.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// POST /api/admin/users — create a new user
const createUser = async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'username, email and password are required' });

  try {
    const existing = await pool.query(
      'SELECT id FROM users WHERE email=$1 OR username=$2',
      [email, username]
    );
    if (existing.rows.length > 0)
      return res.status(409).json({ error: 'Email or username already taken' });

    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1,$2,$3) RETURNING id,username,email,created_at',
      [username, email, hash]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PATCH /api/admin/users/:id — update username, email, or reset password
const updateUser = async (req, res) => {
  const { username, email, password } = req.body;
  try {
    let hash = null;
    if (password) hash = await bcrypt.hash(password, 12);

    const result = await pool.query(`
      UPDATE users SET
        username = COALESCE($1, username),
        email    = COALESCE($2, email),
        password_hash = COALESCE($3, password_hash),
        updated_at = NOW()
      WHERE id = $4
      RETURNING id, username, email, is_admin, created_at
    `, [username || null, email || null, hash, req.params.id]);

    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// DELETE /api/admin/users/:id — delete user and all their data
const deleteUser = async (req, res) => {
  // Prevent admin from deleting themselves
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'You cannot delete your own account' });
  try {
    const result = await pool.query('DELETE FROM users WHERE id=$1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

module.exports = { getUsers, createUser, updateUser, deleteUser };
