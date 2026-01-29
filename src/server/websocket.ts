import { WebSocket, WebSocketServer as WSServer } from 'ws';
import { Server as HttpServer } from 'http';
import { createComponentLogger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

const logger = createComponentLogger('WebSocket');

/**
 * WebSocket message structure
 */
export interface WSMessage {
    type: string;
    data?: unknown;
    timestamp: number;
}

/**
 * Connected client with metadata
 */
interface Client {
    id: string;
    socket: WebSocket;
    connectedAt: number;
    lastPing: number;
}

/**
 * WebSocket server for real-time dashboard updates
 */
export class WebSocketServer {
    private wss: WSServer;
    private clients: Map<string, Client> = new Map();
    private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    constructor(server: HttpServer) {
        this.wss = new WSServer({ server, path: '/ws' });
        this.initialize();
    }

    /**
     * Initialize WebSocket server
     */
    private initialize(): void {
        this.wss.on('connection', (socket: WebSocket) => {
            const clientId = uuidv4();

            const client: Client = {
                id: clientId,
                socket,
                connectedAt: Date.now(),
                lastPing: Date.now(),
            };

            this.clients.set(clientId, client);

            logger.info('WebSocket client connected', {
                clientId,
                totalClients: this.clients.size,
            });

            // Send welcome message
            this.sendToClient(clientId, {
                type: 'connected',
                data: { clientId },
                timestamp: Date.now(),
            });

            // Handle incoming messages
            socket.on('message', (data: Buffer) => {
                this.handleMessage(clientId, data);
            });

            // Handle pong responses for heartbeat
            socket.on('pong', () => {
                const c = this.clients.get(clientId);
                if (c) {
                    c.lastPing = Date.now();
                }
            });

            // Handle close
            socket.on('close', () => {
                this.clients.delete(clientId);
                logger.info('WebSocket client disconnected', {
                    clientId,
                    totalClients: this.clients.size,
                });
            });

            // Handle errors
            socket.on('error', (error: Error) => {
                logger.error('WebSocket client error', {
                    clientId,
                    error: error.message,
                });
            });
        });

        // Start heartbeat
        this.startHeartbeat();

        logger.info('WebSocket server initialized');
    }

    /**
     * Handle incoming message from client
     */
    private handleMessage(clientId: string, data: Buffer): void {
        try {
            const message = JSON.parse(data.toString()) as WSMessage;

            logger.debug('WebSocket message received', {
                clientId,
                type: message.type,
            });

            // Handle ping/pong
            if (message.type === 'ping') {
                this.sendToClient(clientId, {
                    type: 'pong',
                    timestamp: Date.now(),
                });
                return;
            }

            // Handle status request
            if (message.type === 'status:request') {
                // Sync engine will emit status update
                // which will be broadcast to all clients
                return;
            }

        } catch (error) {
            logger.warn('Invalid WebSocket message', {
                clientId,
                error: String(error),
            });
        }
    }

    /**
     * Send message to a specific client
     */
    sendToClient(clientId: string, message: WSMessage): boolean {
        const client = this.clients.get(clientId);

        if (!client || client.socket.readyState !== WebSocket.OPEN) {
            return false;
        }

        try {
            client.socket.send(JSON.stringify(message));
            return true;
        } catch (error) {
            logger.error('Failed to send WebSocket message', {
                clientId,
                error: String(error),
            });
            return false;
        }
    }

    /**
     * Broadcast message to all connected clients
     */
    broadcast(message: WSMessage): number {
        let sent = 0;

        for (const [clientId] of this.clients) {
            if (this.sendToClient(clientId, message)) {
                sent++;
            }
        }

        logger.debug('WebSocket broadcast', {
            type: message.type,
            clientCount: sent,
        });

        return sent;
    }

    /**
     * Start heartbeat to detect stale connections
     */
    private startHeartbeat(): void {
        const HEARTBEAT_INTERVAL = 30000; // 30 seconds
        const STALE_THRESHOLD = 60000; // 60 seconds

        this.heartbeatInterval = setInterval(() => {
            const now = Date.now();

            for (const [clientId, client] of this.clients) {
                // Check if client is stale
                if (now - client.lastPing > STALE_THRESHOLD) {
                    logger.warn('Terminating stale WebSocket client', { clientId });
                    client.socket.terminate();
                    this.clients.delete(clientId);
                    continue;
                }

                // Send ping
                if (client.socket.readyState === WebSocket.OPEN) {
                    client.socket.ping();
                }
            }
        }, HEARTBEAT_INTERVAL);
    }

    /**
     * Get connected client count
     */
    getClientCount(): number {
        return this.clients.size;
    }

    /**
     * Close all connections and stop server
     */
    close(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        for (const [, client] of this.clients) {
            client.socket.close(1000, 'Server shutting down');
        }

        this.clients.clear();
        this.wss.close();

        logger.info('WebSocket server closed');
    }
}
