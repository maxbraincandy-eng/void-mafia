const express = require('express');
const router = express.Router();
const Room = require('../models/Room');

router.get('/', async (req, res) => {
  const activeRooms = await Room.find({ status: 'waiting' });
  res.json(activeRooms);
});

module.exports = router;
