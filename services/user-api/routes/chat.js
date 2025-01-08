const express = require('express');
const expressWs = require('express-ws');
const router = express.Router();
const { keydb } = require('../services/keydb.service');

// Enable WebSocket
expressWs(router);

// Store active connections and user states
const connections = new Map();
const userStates = new Map();

// Get online users endpoint (before WebSocket route)
router.get('/online', (req, res) => {
    const onlineUsers = Array.from(userStates.entries())
        .filter(([_, state]) => state.online)
        .map(([userId, state]) => ({
            userId,
            lastSeen: state.lastSeen,
            typing: state.typing,
            currentRoom: state.currentRoom
        }));
    
    res.json(onlineUsers);
});

// Get chat history
router.get('/history/:roomId', async (req, res) => {
    try {
        const { roomId } = req.params;
        const messages = await keydb.getClient().lrange(`chat:messages:${roomId}`, 0, -1);
        res.json(messages.map(msg => JSON.parse(msg)));
    } catch (error) {
        console.error('Error fetching chat history:', error);
        res.status(500).json({ error: 'Failed to fetch chat history' });
    }
});

// WebSocket endpoint
router.ws('/ws', async (ws, req) => {
    try {
        const clientId = req.query.userId || `anon-${Math.random().toString(36).substr(2, 9)}`;
        connections.set(clientId, ws);
        
        // Initialize user state
        userStates.set(clientId, {
            online: true,
            typing: false,
            lastSeen: Date.now(),
            currentRoom: null
        });

        console.log(`Client connected: ${clientId}`);

        // Send welcome message
        ws.send(JSON.stringify({
            type: 'system',
            message: 'Connected to chat server'
        }));

        ws.on('message', async (msg) => {
            try {
                const data = JSON.parse(msg);
                const state = userStates.get(clientId);

                switch (data.type) {
                    case 'message':
                        const messageData = {
                            ...data,
                            timestamp: Date.now(),
                            senderId: clientId
                        };
                        
                        // Store message in KeyDB
                        await keydb.getClient().lpush(
                            `chat:messages:${data.roomId}`, 
                            JSON.stringify(messageData)
                        );

                        // Broadcast to all clients
                        connections.forEach((client, id) => {
                            if (client.readyState === 1) {
                                client.send(JSON.stringify({
                                    type: 'message',
                                    ...messageData
                                }));
                            }
                        });
                        break;

                    case 'typing':
                        // Update typing state
                        state.typing = data.isTyping;
                        state.currentRoom = data.roomId;
                        userStates.set(clientId, state);
                        
                        // Broadcast typing status
                        connections.forEach((client, id) => {
                            if (client.readyState === 1 && id !== clientId) {
                                client.send(JSON.stringify({
                                    type: 'typing',
                                    userId: clientId,
                                    isTyping: data.isTyping,
                                    roomId: data.roomId
                                }));
                            }
                        });
                        break;
                }
            } catch (error) {
                console.error('Error processing message:', error);
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Error processing message',
                    details: error.message
                }));
            }
        });

        ws.on('close', () => {
            console.log(`Client disconnected: ${clientId}`);
            
            // Update user state
            const state = userStates.get(clientId);
            if (state) {
                state.online = false;
                state.lastSeen = Date.now();
                userStates.set(clientId, state);
            }

            // Clean up
            connections.delete(clientId);
        });

    } catch (error) {
        console.error('WebSocket connection error:', error);
        ws.close();
    }
});

module.exports = router;
