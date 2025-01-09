const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const auth = require('../middleware/auth');
const { OAuth2Client } = require('google-auth-library');

// Create clients for each platform
const VALID_CLIENT_IDS = [
    process.env.GOOGLE_CLIENT_ID_IOS,    // iOS client ID
    process.env.GOOGLE_CLIENT_ID_ANDROID // Android client ID
];

// Create OAuth clients for each platform
const clients = VALID_CLIENT_IDS.map(clientId => new OAuth2Client(clientId));

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
        const { email, username, password } = req.body;
        const identifier = email || username;

        if (!identifier) {
            return res.status(400).json({
                error: 'Email or username is required'
            });
        }

        console.log('Login attempt with identifier:', identifier);

        // Use the static findByCredentials method
        const user = await req.app.locals.models.User.findByCredentials(identifier, password);
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

// Google Sign-In
router.post('/google', async (req, res) => {
    try {
        const { idToken, platform } = req.body;
        
        if (!idToken) {
            console.log('Google auth attempt without ID token');
            return res.status(400).json({ error: 'ID token is required' });
        }

        console.log('Verifying Google ID token for platform:', platform);
        
        // Try to verify with all clients
        let ticket;
        let verificationError;
        
        for (const client of clients) {
            try {
                ticket = await client.verifyIdToken({
                    idToken,
                    audience: VALID_CLIENT_IDS // Accept any of our client IDs
                });
                if (ticket) break; // If verification succeeds, exit the loop
            } catch (error) {
                verificationError = error;
                continue; // Try next client if this one fails
            }
        }

        if (!ticket) {
            console.error('Token verification failed:', verificationError);
            return res.status(401).json({ error: 'Invalid Google token' });
        }
        
        const payload = ticket.getPayload();
        const { email, name, picture, sub: googleId } = payload;
        
        console.log('Google auth payload received:', { email, name, googleId, platform });

        // Check if user exists
        let user = await req.app.locals.models.User.findOne({
            $or: [
                { email },
                { 'googleAuth.id': googleId }
            ]
        });
        
        if (!user) {
            console.log('Creating new user from Google auth');
            const username = email.split('@')[0] + '_' + Math.random().toString(36).slice(2, 7);
            
            user = new req.app.locals.models.User({
                username,
                email,
                password: Math.random().toString(36) + Math.random().toString(36),
                profile: {
                    displayName: name,
                    avatar: picture
                },
                googleAuth: {
                    id: googleId,
                    email
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
            console.log('New user created:', { username, email, platform });
        } else if (!user.googleAuth) {
            console.log('Linking existing user to Google account:', user.email);
            user.googleAuth = {
                id: googleId,
                email
            };
            if (!user.profile.avatar && picture) {
                user.profile.avatar = picture;
            }
            await user.save();
            console.log('Google account linked successfully');
        } else {
            console.log('Existing user logged in with Google:', user.email);
        }
        
        // Generate authentication token
        const token = await user.generateAuthToken();
        console.log('Auth token generated for user:', user.email);
        
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
        console.error('Google authentication error:', error);
        
        if (error.message.includes('audience mismatch')) {
            return res.status(401).json({ error: 'Invalid client ID' });
        }
        
        if (error.message.includes('Token used too late')) {
            return res.status(401).json({ error: 'Token expired' });
        }
        
        res.status(401).json({ error: 'Invalid Google token' });
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

// Verify token
router.post('/verify', async (req, res) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }

        // Verify token and get decoded data
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            console.error('JWT verification error:', error);
            if (error.name === 'JsonWebTokenError') {
                return res.status(401).json({ error: 'Invalid token' });
            }
            if (error.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
            }
            throw error;
        }

        if (!decoded._id) {
            return res.status(401).json({ error: 'Invalid token format' });
        }
        
        // Find user with this token
        const user = await req.app.locals.models.User.findOne({ 
            _id: decoded._id,
            'tokens.token': token 
        }).select('-password -tokens');

        if (!user) {
            return res.status(401).json({ error: 'Invalid token' });
        }

        // Update last active timestamp
        user.lastActive = new Date();
        await user.save();

        // Return user data
        res.json({
            user: {
                id: user._id,
                username: user.username,
                email: user.email,
                profile: user.profile,
                preferences: user.preferences
            }
        });
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(500).json({ 
            error: 'Internal Server Error',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
