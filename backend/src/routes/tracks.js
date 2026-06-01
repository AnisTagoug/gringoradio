const express = require('express');
const router = express.Router({ mergeParams: true });
const auth = require('../middleware/auth');
const { uploadTrack, getTracks, deleteTrack } = require('../controllers/tracksController');

router.use(auth);
router.get('/', getTracks);
router.post('/upload', uploadTrack);
router.delete('/:trackId', deleteTrack);

module.exports = router;
