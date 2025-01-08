require('dotenv').config();
const mongoose = require('mongoose');

async function checkDatabase() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected successfully to MongoDB');

        // Check songs collection
        const songs = mongoose.connection.db.collection('songs');
        const songCount = await songs.countDocuments();
        console.log(`Total songs in database: ${songCount}`);

        if (songCount > 0) {
            const sampleSong = await songs.findOne();
            console.log('Sample song:', JSON.stringify(sampleSong, null, 2));
        }

        // Check lyrics collection
        const lyrics = mongoose.connection.db.collection('lyrics');
        const lyricsCount = await lyrics.countDocuments();
        console.log(`Total lyrics in database: ${lyricsCount}`);

        if (lyricsCount > 0) {
            const sampleLyrics = await lyrics.findOne();
            console.log('Sample lyrics:', JSON.stringify(sampleLyrics, null, 2));
        }

        // List all collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Available collections:', collections.map(c => c.name));

    } catch (error) {
        console.error('Database check error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkDatabase();
