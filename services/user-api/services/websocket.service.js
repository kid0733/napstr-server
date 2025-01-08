const WebSocket = require('ws');
const { keydb } = require('./keydb.service');

class WebSocketService {
    constructor(server) {
        this.wss = new WebSocket.Server({ server });
        this.rooms = new Map();
        this.setupWebSocket();
    }

    setupWebSocket() {
        this.wss.on('connection', async (ws, req) => {
            const userId = this.getUserIdFromRequest(req);
            if (!userId) {
                ws.close(4001, 'Unauthorized');
                return;
            }

            ws.userId = userId;
            ws.isAlive = true;

            ws.on('pong', () => {
                ws.isAlive = true;
            });

            ws.on('message', async (data) => {
                try {
                    const message = JSON.parse(data);
                    await this.handleMessage(ws, message);
                } catch (error) {
                    console.error('WebSocket message error:', error);
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: 'Invalid message format'
                    }));
                }
            });

            ws.on('close', () => {
                this.handleDisconnect(ws);
            });
        });

        // Heartbeat to keep connections alive
        setInterval(() => {
            this.wss.clients.forEach((ws) => {
                if (!ws.isAlive) {
                    return ws.terminate();
                }
                ws.isAlive = false;
                ws.ping();
            });
        }, 30000);
    }

    async handleMessage(ws, message) {
        const { type, roomId, content } = message;

        switch (type) {
            case 'join_room':
                await this.joinRoom(ws, roomId);
                break;
            case 'leave_room':
                await this.leaveRoom(ws, roomId);
                break;
            case 'share_song':
                await this.handleSongShare(ws, roomId, content);
                break;
            case 'send_gif':
                await this.handleGifMessage(ws, roomId, content);
                break;
            case 'react':
                await this.handleReaction(ws, roomId, content);
                break;
            default:
                ws.send(JSON.stringify({
                    type: 'error',
                    error: 'Unknown message type'
                }));
        }
    }

    async joinRoom(ws, roomId) {
        if (!this.rooms.has(roomId)) {
            this.rooms.set(roomId, new Set());
        }
        this.rooms.get(roomId).add(ws);

        // Subscribe to room in KeyDB for persistence
        const redisClient = keydb.getClient();
        await redisClient.sadd(`chat:room:${roomId}:users`, ws.userId);
    }

    async leaveRoom(ws, roomId) {
        if (this.rooms.has(roomId)) {
            this.rooms.get(roomId).delete(ws);
        }
        const redisClient = keydb.getClient();
        await redisClient.srem(`chat:room:${roomId}:users`, ws.userId);
    }

    async handleSongShare(ws, roomId, content) {
        const message = {
            type: 'song_share',
            sender: ws.userId,
            roomId,
            content,
            timestamp: Date.now()
        };

        // Store in MongoDB for history
        const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
        await new ChatMessage(message).save();

        // Broadcast to room
        this.broadcastToRoom(roomId, message);
    }

    async handleGifMessage(ws, roomId, content) {
        const message = {
            type: 'gif',
            sender: ws.userId,
            roomId,
            content,
            timestamp: Date.now()
        };

        const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
        await new ChatMessage(message).save();
        this.broadcastToRoom(roomId, message);
    }

    async handleReaction(ws, roomId, content) {
        const message = {
            type: 'reaction',
            sender: ws.userId,
            roomId,
            content,
            timestamp: Date.now()
        };

        const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
        await new ChatMessage(message).save();
        this.broadcastToRoom(roomId, message);
    }

    broadcastToRoom(roomId, message) {
        if (this.rooms.has(roomId)) {
            const clients = this.rooms.get(roomId);
            clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify(message));
                }
            });
        }
    }

    getUserIdFromRequest(req) {
        // Extract user ID from auth token in request
        // Implementation depends on your auth strategy
        return req.user?._id;
    }

    handleDisconnect(ws) {
        // Remove from all rooms
        this.rooms.forEach((clients, roomId) => {
            if (clients.has(ws)) {
                this.leaveRoom(ws, roomId);
            }
        });
    }
}

module.exports = WebSocketService;
