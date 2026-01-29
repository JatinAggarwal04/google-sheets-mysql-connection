/**
 * Type declarations for @rodrigogs/mysql-events
 */
declare module '@rodrigogs/mysql-events' {
    import { EventEmitter } from 'events';

    interface MySQLEventsOptions {
        startAtEnd?: boolean;
        excludedSchemas?: Record<string, boolean>;
    }

    interface MySQLConnectionOptions {
        host: string;
        port: number;
        user: string;
        password: string;
    }

    interface TriggerOptions {
        name: string;
        expression: string;
        statement: string;
        onEvent: (event: MySQLEvents.Event) => void;
    }

    class MySQLEvents extends EventEmitter {
        static EVENTS: {
            CONNECTION_ERROR: string;
            ZONGJI_ERROR: string;
        };

        static STATEMENTS: {
            ALL: string;
            INSERT: string;
            UPDATE: string;
            DELETE: string;
        };

        constructor(options: MySQLConnectionOptions, config?: MySQLEventsOptions);
        start(): Promise<void>;
        stop(): Promise<void>;
        addTrigger(trigger: TriggerOptions): void;
        removeTrigger(options: { name: string; expression: string }): void;
    }

    namespace MySQLEvents {
        interface Event {
            type: string;
            schema: string;
            table?: string;
            affectedRows?: Array<{
                before?: Record<string, unknown>;
                after?: Record<string, unknown>;
            }>;
            affectedColumns?: string[];
            timestamp: number;
            nextPosition: number;
        }
    }

    export = MySQLEvents;
}
