const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');

// Validation middleware
const validateRegistration = [
    body('username').trim().isLength({ min: 3, max: 30 }),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
];

// Register new user
router.post('/register', validateRegistration, async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username, email, password } = req.body;
        
        // Check if user exists
        const existingUser = await req.app.locals.models.User.findOne({
            $or: [{ email }, { username }]
        });

        if (existingUser) {
            return res.status(400).json({
                error: 'User already exists'
            });
        }

        // Create new user with default profile
        const user = new req.app.locals.models.User({
            username,
            email,
            password,
            profile: {
                displayName: username
            },
            preferences: {
                theme: 'system',
                language: 'en',
                notifications: {
                    email: true,
                    push: true
                }
            }
        });

        await user.save();

        // Generate token using the user's generateAuthToken method
        const token = await user.generateAuthToken();

        res.status(201).json({
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                profile: user.profile,
                preferences: user.preferences
            },
            token
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email) {
            return res.status(400).json({
                error: 'Email is required'
            });
        }

        // Use the static findByCredentials method
        const user = await req.app.locals.models.User.findByCredentials(email.toLowerCase(), password);
        const token = await user.generateAuthToken();

        res.json({
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                profile: user.profile,
                preferences: user.preferences
            },
            token
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

// Get current user profile
router.get('/me', auth, async (req, res) => {
    try {
        const user = await req.app.locals.models.User
            .findById(req.user._id)
            .select('-password -tokens');
        res.json(user);
    } catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Update user preferences
router.patch('/preferences', auth, async (req, res) => {
    try {
        const allowedUpdates = ['theme', 'language', 'notifications'];
        const updates = {};
        
        for (const [key, value] of Object.entries(req.body)) {
            if (allowedUpdates.includes(key)) {
                updates[`preferences.${key}`] = value;
            }
        }

        const user = await req.app.locals.models.User
            .findByIdAndUpdate(
                req.user._id,
                { $set: updates },
                { new: true }
            )
            .select('-password -tokens');

        res.json(user);
    } catch (error) {
        console.error('Update preferences error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
