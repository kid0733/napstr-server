const mongoose = require('mongoose');

const albumSchema = new mongoose.Schema({
    album_id: { type: String, required: true },
    title: { type: String, required: true },
    artists: [{ type: String }],
    release_date: { type: String },
    album_art: { type: String },
    total_tracks: { type: Number },
    spotify_id: { type: String },
    spotify_url: { type: String },
    popularity: { type: Number },
    added_at: { type: Date, default: Date.now },
    featured: { type: Boolean, default: false }
}, {
    timestamps: {
        createdAt: 'created_at',
        updatedAt: 'updated_at'
    },
    collection: 'albums'
});

// Create indexes
albumSchema.index({ album_id: 1 }, { unique: true });
albumSchema.index({ added_at: -1 });
albumSchema.index({ popularity: -1 });
albumSchema.index({ title: 1 });
albumSchema.index({ artists: 1 });
albumSchema.index({ featured: 1 });

const Album = mongoose.model('Album', albumSchema);
module.exports = { Album, albumSchema }; 