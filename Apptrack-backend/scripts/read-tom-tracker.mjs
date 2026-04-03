import { readFileSync } from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const wb = XLSX.readFile('/Users/harshithpeta/Downloads/Toms Deal Tracker.xlsx');

// Read Closed Won 2026 - skip header rows
const cwRaw = XLSX.utils.sheet_to_json(wb.Sheets['Closed Won 2026'], { defval: null, header: 1 });
console.log('=== Tom Closed Won 2026 (all rows) ===');
cwRaw.forEach((r, i) => console.log(`Row ${i}:`, JSON.stringify(r)));

console.log('\n=== Tom Open Deals (all rows) ===');
const odRaw = XLSX.utils.sheet_to_json(wb.Sheets['Open Deals'], { defval: null, header: 1 });
odRaw.forEach((r, i) => console.log(`Row ${i}:`, JSON.stringify(r)));

