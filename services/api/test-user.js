require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/user');

async function testUserModel() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected successfully to MongoDB');

        // Create test user
        const testUser = new User({
            username: 'testuser',
            email: 'test@example.com',
            password: 'password123',
            profile: {
                displayName: 'Test User'
            }
        });

        // Save user
        await testUser.save();
        console.log('Test user created:', testUser);

        // Test password comparison
        const isMatch = await testUser.comparePassword('password123');
        console.log('Password match:', isMatch);

        // Clean up
        await User.deleteOne({ _id: testUser._id });
        console.log('Test user cleaned up');

    } catch (error) {
        console.error('Test error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

testUserModel();
