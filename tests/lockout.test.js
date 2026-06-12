describe('Mechanizm Account Lockout', () => {
    let failedAttempts = 0;
    const MAX_ATTEMPTS = 5;

    test('Powinien zablokować dostęp po 5 nieudanych próbach', () => {
        const loginAttempt = (isPasswordCorrect) => {
            if (!isPasswordCorrect) {
                failedAttempts++;
            }
            return failedAttempts >= MAX_ATTEMPTS;
        };

        loginAttempt(false);
        loginAttempt(false);
        loginAttempt(false);
        loginAttempt(false);
        const isLocked = loginAttempt(false);

        expect(failedAttempts).toBe(5);
        expect(isLocked).toBe(true);
    });
});