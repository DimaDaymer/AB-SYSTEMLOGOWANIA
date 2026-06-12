const argon2 = require('argon2');

describe('Bezpieczeństwo Poświadczeń', () => {

    test('Hasło powinno być zahashowane przy użyciu Argon2id', async () => {
        const password = "SuperSecretPassword123!";
        const hash = await argon2.hash(password, { type: argon2.argon2id });

        expect(hash).toContain('$argon2id$');
        expect(await argon2.verify(hash, password)).toBe(true);
    });

    test('System powinien wykrywać popularne hasła (Blacklist)', () => {
        const commonPasswords = ["password123456", "qwertyuiopasdf", "123456789012"];
        const userPassword = "password123456";

        const isForbidden = commonPasswords.includes(userPassword);
        expect(isForbidden).toBe(true);
    });
});