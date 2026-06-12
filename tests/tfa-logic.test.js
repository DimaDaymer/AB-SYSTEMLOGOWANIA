const speakeasy = require('speakeasy');

describe('Logika 2FA (TOTP)', () => {
    test('Powinien wygenerować poprawny sekret i zweryfikować token', () => {
        const secret = speakeasy.generateSecret({ length: 20 });

        const token = speakeasy.totp({
            secret: secret.base32,
            encoding: 'base32'
        });

        const verified = speakeasy.totp.verify({
            secret: secret.base32,
            encoding: 'base32',
            token: token,
            window: 1
        });

        expect(verified).toBe(true);
        expect(secret.base32.length).toBeGreaterThan(10);
    });
});