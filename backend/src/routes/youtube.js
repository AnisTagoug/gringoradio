const express = require('express');
const router = express.Router({ mergeParams: true });
const auth = require('../middleware/auth');
const { addYouTubeTrack, refreshYouTubeTrack } = require('../controllers/youtubeController');

router.use(auth);
router.post('/', addYouTubeTrack);
router.post('/:trackId/refresh', refreshYouTubeTrack);

module.exports = router;
