const express = require('express');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();
const router = express.Router();

// GET /api/v1/lyrics/:trackId - Get lyrics for a track
router.get('/:trackId', async (req, res) => {
    try {
        const trackId = req.params.trackId;
        console.log('Looking for lyrics with track_id:', trackId);

        // First verify if the song exists
        const song = await req.app.locals.models.Song
            .findOne({ track_id: trackId })
            .lean();

        if (!song) {
            return res.status(404).json({ error: 'Song not found' });
        }

        try {
            // Initialize S3 client for each request
            const s3Client = new S3Client({
                endpoint: process.env.B2_ENDPOINT,
                credentials: {
                    accessKeyId: process.env.B2_KEY_ID,
                    secretAccessKey: process.env.B2_APP_KEY
                },
                region: 'us-west-004',
                forcePathStyle: true
            });

            const key = `lyrics/${trackId}.lrc`;
            console.log('Fetching from B2:', key);
            console.log('Using endpoint:', process.env.B2_ENDPOINT);
            
            const command = new GetObjectCommand({
                Bucket: process.env.B2_BUCKET,
                Key: key
            });

            const { Body } = await s3Client.send(command);
            
            // Convert the readable stream to text
            let lyrics = '';
            for await (const chunk of Body) {
                lyrics += chunk.toString();
            }

            console.log('Successfully fetched lyrics');
            res.set('Content-Type', 'text/plain');
            res.send(lyrics);
        } catch (error) {
            console.error('B2 Error:', error);
            if (error.name === 'NoSuchKey') {
                console.log('No lyrics file found for track_id:', trackId);
                return res.status(404).json({ error: 'Lyrics not found' });
            }
            throw error;
        }
    } catch (error) {
        console.error('Get lyrics error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
