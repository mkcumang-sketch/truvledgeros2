const fs = require('fs');
const content = fs.readFileSync('prisma/baseline/0_init/migration.sql', 'utf8');

const enumRegex = /CREATE TYPE "([^"]+)" AS ENUM/g;
const enums = [];
let m;
while ((m = enumRegex.exec(content)) !== null) {
  enums.push(m[1]);
}

const tableRegex = /CREATE TABLE "([^"]+)"/g;
const tables = [];
while ((m = tableRegex.exec(content)) !== null) {
  tables.push(m[1]);
}

const fkRegex = /ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" FOREIGN KEY \("([^"]+)"\) REFERENCES "([^"]+)"\("([^"]+)"\) ON DELETE ([A-Z ]+) ON UPDATE ([A-Z ]+);/g;
const foreignKeys = [];
while ((m = fkRegex.exec(content)) !== null) {
  foreignKeys.push({
    table: m[1],
    constraint: m[2],
    column: m[3],
    targetTable: m[4],
    targetColumn: m[5],
    onDelete: m[6].trim(),
    onUpdate: m[7].trim()
  });
}

const uqRegex = /CREATE UNIQUE INDEX "([^"]+)" ON "([^"]+)"\(([^)]+)\);/g;
const uniqueIndexes = [];
while ((m = uqRegex.exec(content)) !== null) {
  uniqueIndexes.push({ index: m[1], table: m[2], columns: m[3] });
}

const idxRegex = /CREATE INDEX "([^"]+)" ON "([^"]+)"\(([^)]+)\);/g;
const secondaryIndexes = [];
while ((m = idxRegex.exec(content)) !== null) {
  secondaryIndexes.push({ index: m[1], table: m[2], columns: m[3] });
}

console.log('=== ENUMS (' + enums.length + ') ===');
console.log(enums.join(', '));

console.log('\n=== TABLES (' + tables.length + ') ===');
console.log(tables.join(', '));

console.log('\n=== KEY MODELS VERIFICATION ===');
console.log('Session table created:', tables.includes('Session'));
console.log('PasswordResetToken table created:', tables.includes('PasswordResetToken'));

console.log('\n=== MONETARY & NUMERIC COLUMNS (DECIMAL) ===');
const decRegex = /"([^"]+)"\s+(DECIMAL\([0-9]+,\s*[0-9]+\))/gi;
const decimalCols = [];
while ((m = decRegex.exec(content)) !== null) {
  decimalCols.push({ col: m[1], type: m[2] });
}
console.log('Total DECIMAL column definitions found:', decimalCols.length);
decimalCols.forEach(c => console.log('  ' + c.col + ' -> ' + c.type));

const doubleRegex = /"([^"]+)"\s+(DOUBLE PRECISION)/gi;
const doubleCols = [];
while ((m = doubleRegex.exec(content)) !== null) {
  doubleCols.push({ col: m[1], type: m[2] });
}
console.log('\nTotal DOUBLE PRECISION column definitions found:', doubleCols.length);
doubleCols.forEach(c => console.log('  ' + c.col + ' -> ' + c.type));

console.log('\n=== CONSTRAINTS & INDEXES SUMMARY ===');
console.log('Foreign key constraints:', foreignKeys.length);
console.log('Unique indexes:', uniqueIndexes.length);
console.log('Secondary indexes:', secondaryIndexes.length);

console.log('\n=== DESTRUCTIVE STATEMENTS AUDIT ===');
const dropRegex = /\bDROP\b/gi;
const drops = [];
while ((m = dropRegex.exec(content)) !== null) drops.push(m[0]);
console.log('DROP statements:', drops.length);

const truncRegex = /\bTRUNCATE\b/gi;
const truncs = [];
while ((m = truncRegex.exec(content)) !== null) truncs.push(m[0]);
console.log('TRUNCATE statements:', truncs.length);

const alterDropRegex = /\bALTER\s+TABLE\s+.*\bDROP\b/gi;
const alterDrops = [];
while ((m = alterDropRegex.exec(content)) !== null) alterDrops.push(m[0]);
console.log('ALTER TABLE ... DROP statements:', alterDrops.length);
