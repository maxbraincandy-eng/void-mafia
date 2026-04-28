const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  // აქ ჩაიწერება პაროლის შემოწმების და JWT-ის გენერაციის ლოგიკა
  // რომელიც შემდეგ გადაეცემა socket.io-ს
});

module.exports = router;
