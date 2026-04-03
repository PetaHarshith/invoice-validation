import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('./node_modules/xlsx/lib/xlsx.js');

const files = [
  '/Users/harshithpeta/Downloads/Day 1 Post Lunch/Full_Invoice_Register.xlsx',
  '/Users/harshithpeta/Downloads/Day 1 Morning/DisputedInvoicesExport.xlsx',
  '/Users/harshithpeta/Downloads/Day 1 Post Lunch/All_Won_Opportunities_Export.xlsx',
  '/Users/harshithpeta/Downloads/Day 2 Post Lunch/Updated CRM Data.xlsx',
];

for (const f of files) {
  const wb = XLSX.readFile(f);
  const shortName = f.split('/').pop();
  console.log('\n════════════════════════════════════════════════');
  console.log('FILE: ' + shortName);
  console.log('════════════════════════════════════════════════');
  console.log('Sheets: ' + wb.SheetNames.join(', '));

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null });
    if (rows.length === 0) {
      console.log('\n  [' + sheetName + '] — empty');
      continue;
    }
    const cols = Object.keys(rows[0]);
    console.log('\n  [' + sheetName + '] ' + rows.length + ' rows');
    console.log('  Columns: ' + cols.join(' | '));

    // Print first 3 rows
    const preview = rows.slice(0, 3);
    preview.forEach((r, i) => {
      console.log('  row[' + i + ']: ' + JSON.stringify(r));
    });
  }
}

