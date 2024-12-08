const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);
let database;

// Initialize R2 client
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Connect to MongoDB once at startup
async function connectToDatabase() {
  try {
    await client.connect();
    console.log('Connected to MongoDB');
    database = client.db(process.env.DB_NAME);
    
    // Test database connection by listing collections
    const collections = await database.listCollections().toArray();
    console.log('Available collections:', collections.map(c => c.name));
    
    // Test if we can access the songs collection
    const songsCount = await database.collection('songs').countDocuments();
    console.log(`Found ${songsCount} songs in the collection`);
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

// Ping endpoint for connection testing
app.get('/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Get all songs
app.get('/api/songs', async (req, res) => {
  try {
    if (!database) {
      throw new Error('Database connection not established');
    }
    
    console.log('Attempting to fetch songs from database:', process.env.DB_NAME);
    const collection = database.collection('songs');
    
    const songs = await collection.find({}).sort({ added_at: -1 }).toArray();
    
    console.log(`Found ${songs.length} songs`);
    if (songs.length === 0) {
      console.log('No songs found. Checking collection existence...');
      const collections = await database.listCollections().toArray();
      console.log('Available collections:', collections.map(c => c.name));
    } else {
      console.log('First song:', songs[0].title);
    }
    
    res.json(songs);
    
  } catch (error) {
    console.error('Error fetching songs:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch songs',
      details: error.toString()
    });
  }
});

// Get a single song by ID
app.get('/api/songs/:id', async (req, res) => {
  try {
    if (!database) {
      throw new Error('Database connection not established');
    }
    
    const collection = database.collection('songs');
    const song = await collection.findOne({ track_id: req.params.id });
    
    if (!song) {
      return res.status(404).json({ error: 'Song not found' });
    }
    
    console.log('Found song:', song.title);
    res.json(song);
    
  } catch (error) {
    console.error('Error fetching song:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch song',
      details: error.toString()
    });
  }
});

// Get a random track
app.get('/api/random-track', async (req, res) => {
  try {
    if (!database) {
      throw new Error('Database connection not established');
    }
    
    const collection = database.collection('songs');
    const [randomTrack] = await collection.aggregate([
      { $sample: { size: 1 } }
    ]).toArray();
    
    if (!randomTrack) {
      throw new Error('No tracks found in database');
    }
    
    console.log('Found track:', randomTrack.title);
    res.json(randomTrack);
    
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to fetch track',
      details: error.toString()
    });
  }
});

// Streaming endpoint
app.get('/api/stream/:trackId', async (req, res) => {
  try {
    const { trackId } = req.params;
    console.log('=== Streaming Request Debug ===');
    console.log('1. Track ID:', trackId);
    
    // First, verify the track exists in MongoDB
    if (!database) {
      throw new Error('Database connection not established');
    }
    
    const collection = database.collection('songs');
    const song = await collection.findOne({ track_id: trackId });
    
    if (!song) {
      console.error('Track not found in database:', trackId);
      return res.status(404).json({ error: 'Track not found' });
    }
    
    console.log('2. Found track in database:', {
      title: song.title,
      artist: song.artists.join(', '),
      id: song.track_id
    });
    
    // Generate pre-signed URL with specific headers
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: `tracks/${trackId}.mp3`,
      ResponseContentType: 'audio/mpeg',
      ResponseContentDisposition: 'inline',
    });
    
    console.log('3. Generating pre-signed URL with headers');
    const url = await getSignedUrl(r2, command, { 
      expiresIn: 3600,
      signableHeaders: new Set(['host']),
    });
    
    console.log('4. Generated URL successfully');
    
    // Send the URL to the client
    res.json({ 
      url,
      track: {
        title: song.title,
        artist: song.artists.join(', '),
        duration: song.duration_ms
      }
    });
  } catch (error) {
    console.error('Error generating streaming URL:', error);
    console.error('Error details:', error.stack);
    res.status(500).json({ 
      error: 'Failed to generate streaming URL',
      details: error.message 
    });
  }
});

const PORT = process.env.PORT || 3000;

// Initialize database connection before starting server
connectToDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Database Name:', process.env.DB_NAME);
  });
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', async () => {
  try {
    await client.close();
    console.log('MongoDB connection closed.');
    process.exit(0);
  } catch (err) {
    console.error('Error closing MongoDB connection:', err);
    process.exit(1);
  }
});