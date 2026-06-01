/**
 * Drive import routes
 * GET  /api/stations/:stationId/drive/folder  — list station's Drive sub-folder
 * POST /api/stations/:stationId/drive/import  — import selected files as tracks
 */
const express  = require('express');
const router   = express.Router({ mergeParams: true });
const auth     = require('../middleware/auth');
const { getFolderContents, importTracks } = require('../controllers/driveImportController');

router.use(auth);
router.get('/folder',  getFolderContents);
router.post('/import', importTracks);

module.exports = router;
