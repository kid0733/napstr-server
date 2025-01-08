require('dotenv').config();
const mongoose = require('mongoose');

const mongoOptions = {
    serverApi: {
        version: '1',
        strict: true,
        deprecationErrors: true,
    }
};

async function checkUsers() {
    try {
        console.log('Connecting to user database...');
        const userDb = await mongoose.createConnection(process.env.MONGO_USER_URI, {
            ...mongoOptions,
            dbName: process.env.USER_DB_NAME
        });

        console.log('Connected to database:', userDb.name);
        
        // Get the User model
        const userSchema = require('./models/user');
        const User = userDb.model('User', userSchema, 'users');

        // Find all users
        const users = await User.find({}).select('_id username email tokens');
        
        console.log('\nFound users:', users.length);
        users.forEach(user => {
            console.log('\nUser:', {
                _id: user._id,
                username: user.username,
                email: user.email,
                tokensCount: user.tokens?.length || 0
            });
        });

        await userDb.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkUsers();
