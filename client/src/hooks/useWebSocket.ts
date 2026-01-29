import { useState, useEffect, useCallback, useRef } from 'react';
import type { WebSocketMessage } from '../types';

interface UseWebSocketOptions {
    onMessage?: (message: WebSocketMessage) => void;
    onConnect?: () => void;
    onDisconnect?: () => void;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
    const [isConnected, setIsConnected] = useState(false);
    const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimeoutRef = useRef<number | null>(null);

    const {
        onMessage,
        onConnect,
        onDisconnect,
        reconnectInterval = 3000,
        maxReconnectAttempts = 10,
    } = options;

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        try {
            wsRef.current = new WebSocket(wsUrl);

            wsRef.current.onopen = () => {
                // console.log('[WebSocket] Connected');
                setIsConnected(true);
                reconnectAttemptsRef.current = 0;
                onConnect?.();
            };

            wsRef.current.onclose = () => {
                // console.log('[WebSocket] Disconnected');
                setIsConnected(false);
                onDisconnect?.();

                // Attempt to reconnect
                if (reconnectAttemptsRef.current < maxReconnectAttempts) {
                    reconnectAttemptsRef.current++;
                    // console.log(`[WebSocket] Reconnecting in ${reconnectInterval}ms (attempt ${reconnectAttemptsRef.current})`);
                    reconnectTimeoutRef.current = window.setTimeout(connect, reconnectInterval);
                }
            };

            wsRef.current.onerror = (error) => {
                console.error('[WebSocket] Error:', error);
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const message: WebSocketMessage = JSON.parse(event.data);
                    setLastMessage(message);
                    onMessage?.(message);
                } catch (e) {
                    console.error('[WebSocket] Failed to parse message:', e);
                }
            };
        } catch (error) {
            console.error('[WebSocket] Failed to connect:', error);
        }
    }, [onConnect, onDisconnect, onMessage, reconnectInterval, maxReconnectAttempts]);

    const disconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectAttemptsRef.current = maxReconnectAttempts; // Prevent reconnection
        wsRef.current?.close();
    }, [maxReconnectAttempts]);

    const send = useCallback((data: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    useEffect(() => {
        connect();
        return () => disconnect();
    }, [connect, disconnect]);

    return { isConnected, lastMessage, send, connect, disconnect };
}
