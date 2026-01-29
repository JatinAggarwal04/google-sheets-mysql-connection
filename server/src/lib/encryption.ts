// ===========================================
// Credential Vault - AES-256-GCM Encryption
// ===========================================

import crypto from 'crypto';
import { getEnv } from '../config/env.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 32;

interface EncryptedData {
    encrypted: string;
    iv: string;
    authTag: string;
    salt: string;
}

/**
 * Derives a key from the master encryption key using PBKDF2
 */
function deriveKey(salt: Buffer): Buffer {
    const env = getEnv();
    const masterKey = Buffer.from(env.ENCRYPTION_KEY, 'hex');
    return crypto.pbkdf2Sync(masterKey, salt, 100000, 32, 'sha256');
}

/**
 * Encrypts sensitive data using AES-256-GCM
 */
export function encrypt(plaintext: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const key = deriveKey(salt);
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    const data: EncryptedData = {
        encrypted,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        salt: salt.toString('base64'),
    };

    return Buffer.from(JSON.stringify(data)).toString('base64');
}

/**
 * Decrypts data encrypted with AES-256-GCM
 */
export function decrypt(encryptedPayload: string): string {
    try {
        const data: EncryptedData = JSON.parse(
            Buffer.from(encryptedPayload, 'base64').toString('utf8')
        );

        const salt = Buffer.from(data.salt, 'base64');
        const key = deriveKey(salt);
        const iv = Buffer.from(data.iv, 'base64');
        const authTag = Buffer.from(data.authTag, 'base64');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(data.encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (error) {
        throw new Error('Failed to decrypt data: Invalid or corrupted payload');
    }
}

/**
 * Encrypts credentials object (tokens, passwords, etc.)
 */
export function encryptCredentials(credentials: Record<string, unknown>): string {
    return encrypt(JSON.stringify(credentials));
}

/**
 * Decrypts credentials object
 */
export function decryptCredentials<T = Record<string, unknown>>(encryptedPayload: string): T {
    return JSON.parse(decrypt(encryptedPayload)) as T;
}
