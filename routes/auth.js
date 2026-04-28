const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// საიდუმლო გასაღები - რეალურ პროექტში გამოიყენე process.env.JWT_SECRET
const SECRET = "void_secret_key_2026";

// რეგისტრაციის ენდპოინტი (ახალი ოპერატორების დასამატებლად)
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        let user = await User.findOne({ username });
        if (user) return res.status(400).json({ msg: "OPERATOR_ALREADY_EXISTS" });

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        user = new User({
            username,
            passwordHash,
            role: 'user',
            stats: { gamesPlayed: 0, wins: 0, losses: 0 }
        });

        await user.save();
        res.json({ msg: "OPERATOR_REGISTERED_IN_SYSTEM" });
    } catch (err) {
        res.status(500).json({ msg: "SERVER_ERROR", error: err.message });
    }
});

// შესვლის (Login) ენდპოინტი
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // მომხმარებლის მოძებნა
        const user = await User.findOne({ username });
        if (!user) return res.status(400).json({ msg: "INVALID_OPERATOR_CREDENTIALS" });

        // პაროლის შედარება
        const isMatch = await bcrypt.compare(password, user.passwordHash);
        if (!isMatch) return res.status(400).json({ msg: "INVALID_OPERATOR_CREDENTIALS" });

        // JWT ტოკენის გენერაცია 24 საათით
        const token = jwt.sign(
            { id: user._id, username: user.username, role: user.role },
            SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user._id,
                username: user.username,
                role: user.role
            }
        });
    } catch (err) {
        res.status(500).json({ msg: "SERVER_ERROR" });
    }
});

module.exports = router;
