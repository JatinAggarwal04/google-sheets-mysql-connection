import { createComponentLogger } from '../utils/logger.js';
import { ColumnDefinition } from '../mysql/schema-manager.js';

const logger = createComponentLogger('SchemaInferrer');

/**
 * Inferred column type from data analysis
 */
interface InferredColumn extends ColumnDefinition {
    samples: number;
    nullCount: number;
    confidence: number;
}

/**
 * Schema inference result
 */
export interface InferredSchema {
    columns: ColumnDefinition[];
    rowCount: number;
    inferenceReport: Array<{
        columnName: string;
        inferredType: string;
        confidence: number;
        nullPercentage: number;
    }>;
}

/**
 * Infers MySQL column types from Google Sheets data
 */
export class SchemaInferrer {
    /**
     * Infer schema from sheet data
     */
    inferSchema(
        headers: string[],
        rows: Array<{ data: Record<string, unknown> }>
    ): InferredSchema {
        const columnStats = new Map<string, InferredColumn>();

        // Initialize column stats
        for (const header of headers) {
            if (!header) continue;

            columnStats.set(header, {
                name: this.sanitizeColumnName(header),
                type: 'string', // default
                samples: 0,
                nullCount: 0,
                confidence: 0,
            });
        }

        // Analyze each row
        for (const row of rows) {
            for (const header of headers) {
                if (!header) continue;

                const col = columnStats.get(header);
                if (!col) continue;

                const value = row.data[header];
                col.samples++;

                if (value === null || value === undefined || value === '') {
                    col.nullCount++;
                    continue;
                }

                const inferredType = this.inferValueType(value);

                // Update type based on inference rules
                col.type = this.reconcileTypes(col.type, inferredType, col.samples);
            }
        }

        // Calculate confidence and finalize schema
        const columns: ColumnDefinition[] = [];
        const inferenceReport: InferredSchema['inferenceReport'] = [];

        for (const [originalName, col] of columnStats) {
            const nonNullSamples = col.samples - col.nullCount;
            const confidence = nonNullSamples > 0 ? 1 : 0.5;
            const nullPercentage = col.samples > 0 ? (col.nullCount / col.samples) * 100 : 0;

            columns.push({
                name: col.name,
                type: col.type,
                nullable: nullPercentage > 0,
            });

            inferenceReport.push({
                columnName: originalName,
                inferredType: col.type,
                confidence,
                nullPercentage,
            });
        }

        logger.info('Schema inference complete', {
            columnCount: columns.length,
            rowCount: rows.length,
        });

        return {
            columns,
            rowCount: rows.length,
            inferenceReport,
        };
    }

    /**
     * Infer the type of a single value
     */
    private inferValueType(value: unknown): ColumnDefinition['type'] {
        // Already a boolean
        if (typeof value === 'boolean') {
            return 'boolean';
        }

        // Check if boolean-like string
        if (typeof value === 'string') {
            const lower = value.toLowerCase().trim();
            if (['true', 'false', 'yes', 'no', '1', '0'].includes(lower)) {
                return 'boolean';
            }
        }

        // Check if number
        if (typeof value === 'number' && !isNaN(value)) {
            return 'number';
        }

        // Check if numeric string
        if (typeof value === 'string') {
            const trimmed = value.trim();

            // Skip empty strings
            if (!trimmed) {
                return 'string';
            }

            // Check for number
            const num = Number(trimmed);
            if (!isNaN(num) && trimmed !== '') {
                return 'number';
            }

            // Check for date formats
            if (this.isDateString(trimmed)) {
                return 'date';
            }

            // Check if it's long text (> 255 chars)
            if (trimmed.length > 255) {
                return 'text';
            }
        }

        // Check if Date object
        if (value instanceof Date && !isNaN(value.getTime())) {
            return 'date';
        }

        return 'string';
    }

    /**
     * Check if a string looks like a date
     */
    private isDateString(value: string): boolean {
        // Common date patterns
        const datePatterns = [
            /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, // ISO datetime
            /^\d{2}\/\d{2}\/\d{4}$/, // MM/DD/YYYY
            /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
            /^\w{3} \d{1,2}, \d{4}$/, // Jan 1, 2024
        ];

        for (const pattern of datePatterns) {
            if (pattern.test(value)) {
                // Verify it's a valid date
                const date = new Date(value);
                if (!isNaN(date.getTime())) {
                    return true;
                }
            }
        }

        return false;
    }

    /**
     * Reconcile multiple type inferences for the same column
     * Priority: string > text > number > date > boolean
     */
    private reconcileTypes(
        currentType: ColumnDefinition['type'],
        newType: ColumnDefinition['type'],
        samples: number
    ): ColumnDefinition['type'] {
        // First sample, use the inferred type
        if (samples === 1) {
            return newType;
        }

        // If same type, keep it
        if (currentType === newType) {
            return currentType;
        }

        // Type priority for mixed data (fallback to more flexible types)
        const typePriority: Record<ColumnDefinition['type'], number> = {
            text: 5,
            string: 4,
            number: 3,
            date: 2,
            boolean: 1,
        };

        // If we see mixed types, prefer the more flexible one
        return typePriority[currentType] >= typePriority[newType] ? currentType : newType;
    }

    /**
     * Sanitize column name for MySQL compatibility
     */
    private sanitizeColumnName(name: string): string {
        return name
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9_]/g, '_') // Replace non-alphanumeric with underscore
            .replace(/_+/g, '_') // Collapse multiple underscores
            .replace(/^_|_$/g, '') // Remove leading/trailing underscores
            .substring(0, 64); // MySQL column name limit
    }
}

/**
 * Create a schema inferrer instance
 */
export function createSchemaInferrer(): SchemaInferrer {
    return new SchemaInferrer();
}
