const express = require('express');
const router = express.Router({ mergeParams: true });
const auth = require('../middleware/auth');
const {
  getBroadcasters, createBroadcaster, updateBroadcaster,
  deleteBroadcaster, getBroadcasterCredentials
} = require('../controllers/broadcastersController');

router.use(auth);
router.get('/', getBroadcasters);
router.post('/', createBroadcaster);
router.patch('/:broadcasterId', updateBroadcaster);
router.delete('/:broadcasterId', deleteBroadcaster);
router.get('/:broadcasterId/credentials', getBroadcasterCredentials);

module.exports = router;
