const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');
const { getUsers, createUser, updateUser, deleteUser } = require('../controllers/adminController');

router.use(adminAuth);
router.get('/users', getUsers);
router.post('/users', createUser);
router.patch('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);

module.exports = router;
