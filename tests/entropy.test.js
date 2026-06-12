const calculateEntropy = (pwd) => {
    let charsetSize = 0;
    if (/[a-z]/.test(pwd)) charsetSize += 26;
    if (/[A-Z]/.test(pwd)) charsetSize += 26;
    if (/[0-9]/.test(pwd)) charsetSize += 10;
    if (/[^a-zA-Z0-9]/.test(pwd)) charsetSize += 32;
    return Math.round(pwd.length * (charsetSize > 0 ? Math.log2(charsetSize) : 0));
};

describe('Wskaźnik Siły Hasła (Entropia)', () => {
    test('Hasło złożone powinno mieć wyższą entropię niż proste', () => {
        const weak = calculateEntropy("123456789012");
        const strong = calculateEntropy("P@ssw0rd2024!");

        expect(strong).toBeGreaterThan(weak);
        console.log(`Entropia silnego hasła: ${strong} bitów`);
    });
});