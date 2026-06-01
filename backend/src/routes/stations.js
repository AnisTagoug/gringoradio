const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  getMyStations, getStation, createStation,
  updateStation, deleteStation, getCredentials,
} = require('../controllers/stationsController');

router.use(auth);
router.get('/', getMyStations);
router.get('/:id', getStation);
router.post('/', createStation);
router.patch('/:id', updateStation);
router.delete('/:id', deleteStation);
router.get('/:id/credentials', getCredentials);

module.exports = router;
