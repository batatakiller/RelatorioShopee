const fs = require('fs');

const fileContent = fs.readFileSync('/Users/daniel/Chat Shopee/webshoping_adwords_bill_2026-06-30 (2).csv', 'utf8');
const lines = fileContent.split('\n');

const list = [];
for (let i = 7; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  const parts = line.split(',');
  if (parts.length < 4) continue;
  const date = parts[1];
  const qty = parseFloat(parts[3]);
  if (qty < 0) {
    const [d, m, y] = date.split('/');
    const isoDate = `${y}-${m}-${d}`;
    list.push({ date: isoDate, amount: Math.abs(qty) });
  }
}

// Sort chronologically
list.sort((a, b) => a.date.localeCompare(b.date));

// Print total sum for different starting dates
const uniqueDates = Array.from(new Set(list.map(x => x.date)));
uniqueDates.sort();

console.log('Total entries:', list.length);
uniqueDates.forEach(startDate => {
  const sum = list.filter(x => x.date >= startDate).reduce((acc, x) => acc + x.amount, 0);
  console.log(`Date >= ${startDate} -> Sum: ${sum.toFixed(2)}`);
});
