const express = require('express');
const router = express.Router();
const { login, me } = require('../controllers/authController');
const auth = require('../middleware/auth');

// Public register endpoint is DISABLED — users are created by admin only
// router.post('/register', register);  ← removed

router.post('/login', login);
router.get('/me', auth, me);

module.exports = router;
