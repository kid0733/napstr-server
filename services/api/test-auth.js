require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('./models/user');

async function testAuth() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected successfully to MongoDB');

        // Test registration data
        const userData = {
            username: 'testuser2',
            email: 'test2@example.com',
            password: 'password123',
            profile: {
                displayName: 'Test User 2'
            }
        };

        // Create test user
        const user = new User(userData);
        await user.save();
        console.log('Test user created:', user);

        // Test JWT generation
        const token = jwt.sign(
            { userId: user._id },
            process.env.USER_JWT_SECRET,
            { expiresIn: process.env.USER_JWT_EXPIRE }
        );
        console.log('User JWT Token generated:', token);

        // Test token verification
        const decoded = jwt.verify(token, process.env.USER_JWT_SECRET);
        console.log('Token verified:', decoded);
        console.log('Token expiry:', new Date(decoded.exp * 1000).toISOString());

        // Test password comparison
        const isMatch = await user.comparePassword('password123');
        console.log('Password match:', isMatch);

        // Clean up
        await User.deleteOne({ _id: user._id });
        console.log('Test user cleaned up');

    } catch (error) {
        console.error('Test error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

testAuth();
