import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

export class EncryptionService {
    private readonly key: Buffer;

    constructor(secretKey: string) {
        // Ensure key is 32 bytes (256 bits)
        // We hash the secret key to ensure it's exactly 32 bytes
        this.key = crypto.createHash('sha256').update(secretKey).digest();
    }

    encrypt(text: string): { encryptedData: string; iv: string; authTag: string } {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');

        const authTag = cipher.getAuthTag();

        return {
            encryptedData: encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    decrypt(encryptedData: string, iv: string, authTag: string): string {
        const decipher = crypto.createDecipheriv(
            ALGORITHM,
            this.key,
            Buffer.from(iv, 'hex')
        );

        decipher.setAuthTag(Buffer.from(authTag, 'hex'));

        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}
