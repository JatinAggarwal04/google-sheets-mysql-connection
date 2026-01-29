import crypto from 'crypto';
import { createComponentLogger } from './logger.js';

const logger = createComponentLogger('Crypto');

// Master key should be 32 bytes (64 hex chars)
const algorithm = 'aes-256-gcm';
const secretKey = process.env.ENCRYPTION_KEY
    ? Buffer.from(process.env.ENCRYPTION_KEY, 'hex')
    : crypto.randomBytes(32); // Fallback for dev (warn logs)

// Warn if using random key (data won't survive restart)
if (!process.env.ENCRYPTION_KEY) {
    logger.warn('WARNING: No ENCRYPTION_KEY found in env. Using random key. Encrypted data will be unreadable after restart.');
}

export interface EncryptedData {
    iv: string;
    content: string;
    authTag: string; // Append to content or store separately. usually append.
    // simpler: return "iv:authTag:content" string
}

export function encrypt(text: string): string {
    const iv = crypto.randomBytes(12); // standard for GCM
    const cipher = crypto.createCipheriv(algorithm, secretKey, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    // Format: iv:authTag:content
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decrypt(hash: string): string {
    const parts = hash.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted string format');
    }

    const [ivHex, authTagHex, contentHex] = parts;

    const decipher = crypto.createDecipheriv(
        algorithm,
        secretKey,
        Buffer.from(ivHex || '', 'hex')
    );

    decipher.setAuthTag(Buffer.from(authTagHex || '', 'hex'));

    let decrypted = decipher.update(contentHex || '', 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}
