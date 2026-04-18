import { writeFileSync } from 'fs';
writeFileSync('scripts/_test_output.txt', 'SCRIPT RAN AT: ' + new Date().toISOString() + '\n');
console.log('done');

