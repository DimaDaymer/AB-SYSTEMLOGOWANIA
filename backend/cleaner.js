const fs = require('fs');
const path = require('path');

const inputPath = path.join(__dirname, '100k-most-used-passwords-NCSC.txt');
const outputPath = path.join(__dirname, 'common_passwords.json');

try {
    const rawData = fs.readFileSync(inputPath, 'utf8');
    const allLines = rawData.split(/\r?\n/);

    console.log(`Całkowita liczba linii w pliku: ${allLines.length}`);

    const filtered = allLines
        .map(p => p.trim())
        .filter(p => p.length >= 12);

    const unique = [...new Set(filtered.map(p => p.toLowerCase()))];

    fs.writeFileSync(outputPath, JSON.stringify(unique, null, 2));

    console.log(`Zakończono!`);
    console.log(`- Przeanalizowano: ${allLines.length} haseł`);
    console.log(`- Znaleziono haseł o długości 12+: ${filtered.length}`);
    console.log(`- Po usunięciu duplikatów zostało: ${unique.length}`);

} catch (err) {
    console.error('Błąd:', err);
}