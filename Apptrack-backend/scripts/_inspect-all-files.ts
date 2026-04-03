import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const require = createRequire(import.meta.url);
// @ts-ignore
const XLSX = require('xlsx');

function excelDateToISO(serial: number): string {
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  const date_info = new Date(utc_value * 1000);
  return date_info.toISOString().split('T')[0];
}

const lines: string[] = [];

// ── 1. Full Invoice Register — billing contacts & invoice dates ─────────────
const irWb = XLSX.readFile('/Users/harshithpeta/Downloads/Day 1 Post Lunch/Full_Invoice_Register.xlsx');
const irRows: any[] = XLSX.utils.sheet_to_json(irWb.Sheets['Invoice Register'], { defval: null });
lines.push('=== Full_Invoice_Register: ' + irRows.length + ' rows ===');
const irWithBilling = irRows.filter((r: any) => r['Billing_Contact_Name']);
lines.push('Rows WITH billing contact: ' + irWithBilling.length);
irWithBilling.forEach((r: any) => {
  const date = r['Invoice_Date'] ? excelDateToISO(r['Invoice_Date']) : null;
  lines.push('  ' + r['Opportunity_ID'] + ' | ' + r['Account_Name'] +
    ' | billing: ' + r['Billing_Contact_Name'] + ' <' + r['Billing_Contact_Email'] + '>' +
    ' | invoiceDate: ' + date + ' | terms: ' + r['Payment_Terms']);
});

// Also show ALL rows with invoice dates (for contract_start_date)
const irWithDate = irRows.filter((r: any) => r['Invoice_Date']);
lines.push('\nAll rows with Invoice_Date: ' + irWithDate.length);
irWithDate.slice(0, 10).forEach((r: any) => {
  lines.push('  ' + r['Opportunity_ID'] + ' | ' + r['Account_Name'] + ' | date: ' + excelDateToISO(r['Invoice_Date']));
});

// ── 2. DisputedInvoicesExport — all 6 rows ──────────────────────────────────
const diWb = XLSX.readFile('/Users/harshithpeta/Downloads/Day 1 Morning/DisputedInvoicesExport.xlsx');
const diRows: any[] = XLSX.utils.sheet_to_json(diWb.Sheets['Sheet1'], { defval: null });
lines.push('\n=== DisputedInvoicesExport: ' + diRows.length + ' rows ===');
diRows.forEach((r: any, i: number) => {
  lines.push('row[' + i + ']: ' + r['Opportunity_ID'] + ' | ' + r['Account_Name'] +
    ' | billing: ' + r['Billing_Contact_Name'] + ' <' + r['Billing_Contact_Email'] + '>' +
    ' | date: ' + (r['Invoice_Date'] ? excelDateToISO(r['Invoice_Date']) : null));
});

// ── 3. Updated CRM Data — closed won rows, extra fields ─────────────────────
const crmWb = XLSX.readFile('/Users/harshithpeta/Downloads/Day 2 Post Lunch/Updated CRM Data.xlsx');
const crmRows: any[] = XLSX.utils.sheet_to_json(crmWb.Sheets['All Opportunities'], { defval: null });
const crmWon = crmRows.filter((r: any) => (r['Opp_Stage'] || '').trim() === 'Closed Won');
lines.push('\n=== Updated CRM Data: ' + crmRows.length + ' total, ' + crmWon.length + ' Closed Won ===');
lines.push('Extra columns vs All_Opps_Final: Opportunity_Notes | Opportunity_Name | Opportunity_Source | Opportunity_Close_Reason | Account_Industry | Account_Size');
crmWon.slice(0, 5).forEach((r: any) => {
  lines.push('  ' + r['Opportunity_ID'] + ' | ' + r['Account_Name'] + ' | name: ' + r['Opportunity_Name'] + ' | notes: ' + r['Opportunity_Notes']);
});

const outPath = 'scripts/_inspect_result.txt';
writeFileSync(outPath, lines.join('\n'));
console.log('Written to ' + outPath);

