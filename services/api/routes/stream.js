const express = require('express');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();
const router = express.Router();

// GET /api/v1/stream/download/:trackId - Get permanent download URL
router.get('/download/:trackId', async (req, res) => {
    try {
        console.log('Download URL request for track:', req.params.trackId);
        
        // Get song details from MongoDB
        const song = await req.app.locals.models.Song.findOne({ track_id: req.params.trackId });
        if (!song) {
            console.log('Song not found in MongoDB');
            return res.status(404).json({ error: 'Song not found' });
        }
        console.log('Found song in MongoDB:', song.title);

        // Use Cloudflare URL from environment variable
        const permanentUrl = `${process.env.CLOUDFLARE_URL}/songs/${song.track_id}.${song.audio_format}`;
        
        // Add caching headers for CDN optimization
        res.set({
            'Cache-Control': 'public, max-age=31536000',
            'CDN-Cache-Control': 'public, max-age=31536000',
            'Cloudflare-CDN-Cache-Control': 'public, max-age=31536000',
            'X-Content-Type-Options': 'nosniff',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD',
            'Access-Control-Allow-Headers': 'Range',
            'Access-Control-Expose-Headers': 'Content-Length, Content-Range'
        });
        
        res.json({ 
            url: permanentUrl,
            filename: `${song.title}.${song.audio_format}`,
            content_type: `audio/${song.audio_format}`
        });

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/v1/stream/:trackId - Stream audio file
router.get('/:trackId', async (req, res) => {
    try {
        console.log('Stream request for track:', req.params.trackId);
        
        // Get song details from MongoDB
        const song = await req.app.locals.models.Song.findOne({ track_id: req.params.trackId });
        if (!song) {
            console.log('Song not found in MongoDB');
            return res.status(404).json({ error: 'Song not found' });
        }
        console.log('Found song in MongoDB:', song.title);

        // Debug log the configuration
        console.log('B2 Config:', {
            endpoint: process.env.B2_ENDPOINT,
            keyId: process.env.B2_KEY_ID ? 'present' : 'missing',
            appKey: process.env.B2_APP_KEY ? 'present' : 'missing',
            bucket: process.env.B2_BUCKET
        });

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

        const key = `songs/${song.track_id}.${song.audio_format}`;
        console.log('Looking for file in B2:', key);
        
        const range = req.headers.range;
        console.log('Range header:', range);

        try {
            if (range) {
                console.log('Processing range request');
                const command = new GetObjectCommand({
                    Bucket: process.env.B2_BUCKET,
                    Key: key,
                    Range: range
                });

                const { Body, ContentLength, ContentRange } = await s3Client.send(command);
                console.log('Got range response:', { ContentLength, ContentRange });
                
                res.writeHead(206, {
                    'Content-Type': `audio/${song.audio_format}`,
                    'Content-Length': ContentLength,
                    'Content-Range': ContentRange,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=31536000',
                    'CDN-Cache-Control': 'public, max-age=31536000',
                    'Cloudflare-CDN-Cache-Control': 'public, max-age=31536000',
                    'X-Content-Type-Options': 'nosniff',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD',
                    'Access-Control-Allow-Headers': 'Range',
                    'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
                    'Vary': 'Range'
                });

                Body.pipe(res);
            } else {
                console.log('Processing full download request');
                const command = new GetObjectCommand({
                    Bucket: process.env.B2_BUCKET,
                    Key: key
                });

                const { Body, ContentLength } = await s3Client.send(command);
                console.log('Got full file response:', { ContentLength });

                res.writeHead(200, {
                    'Content-Type': `audio/${song.audio_format}`,
                    'Content-Length': ContentLength,
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=31536000',
                    'CDN-Cache-Control': 'public, max-age=31536000',
                    'Cloudflare-CDN-Cache-Control': 'public, max-age=31536000',
                    'X-Content-Type-Options': 'nosniff',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD',
                    'Access-Control-Allow-Headers': 'Range',
                    'Access-Control-Expose-Headers': 'Content-Length, Content-Range'
                });

                Body.pipe(res);
            }
        } catch (s3Error) {
            console.error('B2/S3 error:', s3Error);
            res.status(500).json({ error: `B2 error: ${s3Error.message}` });
        }

    } catch (error) {
        console.error('Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
