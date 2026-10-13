const fs = require('fs');

const schema = fs.readFileSync('prisma/schema.prisma', 'utf8');
const baseline = fs.readFileSync('prisma/baseline/0_init/migration.sql', 'utf8');

const schemaEnumRegex = /enum\s+([A-Za-z0-9_]+)\s*\{/g;
const schemaEnums = [];
let m;
while ((m = schemaEnumRegex.exec(schema)) !== null) {
  schemaEnums.push(m[1]);
}

const schemaModelRegex = /model\s+([A-Za-z0-9_]+)\s*\{/g;
const schemaModels = [];
while ((m = schemaModelRegex.exec(schema)) !== null) {
  schemaModels.push(m[1]);
}

const baselineEnumRegex = /CREATE TYPE "([^"]+)" AS ENUM/g;
const baselineEnums = [];
while ((m = baselineEnumRegex.exec(baseline)) !== null) {
  baselineEnums.push(m[1]);
}

const baselineTableRegex = /CREATE TABLE "([^"]+)"/g;
const baselineTables = [];
while ((m = baselineTableRegex.exec(baseline)) !== null) {
  baselineTables.push(m[1]);
}

console.log('=== ENUM PARITY ===');
console.log('Schema Enums count:', schemaEnums.length);
console.log('Baseline Enums count:', baselineEnums.length);
const missingEnums = schemaEnums.filter(e => !baselineEnums.includes(e));
console.log('Missing Enums in baseline:', missingEnums.length === 0 ? 'NONE (100% Match)' : missingEnums);

console.log('\n=== MODEL / TABLE PARITY ===');
console.log('Schema Models count:', schemaModels.length);
console.log('Baseline Tables count:', baselineTables.length);
const missingModels = schemaModels.filter(mod => !baselineTables.includes(mod));
console.log('Missing Tables in baseline:', missingModels.length === 0 ? 'NONE (100% Match)' : missingModels);

// Compare Indexes and Constraints
const schemaIndexMatches = (schema.match(/@@index/g) || []).length;
const schemaUniqueMatches = (schema.match(/@@unique/g) || []).length;
const baselineIndexMatches = (baseline.match(/CREATE INDEX/g) || []).length;
const baselineUniqueMatches = (baseline.match(/CREATE UNIQUE INDEX/g) || []).length;
const baselineFkMatches = (baseline.match(/ADD CONSTRAINT ".*" FOREIGN KEY/g) || []).length;

console.log('\n=== INDEXES & CONSTRAINTS PARITY ===');
console.log('Schema @@index count:', schemaIndexMatches);
console.log('Baseline CREATE INDEX count:', baselineIndexMatches);
console.log('Schema @@unique count:', schemaUniqueMatches);
console.log('Baseline CREATE UNIQUE INDEX count:', baselineUniqueMatches);
console.log('Baseline Foreign Keys count:', baselineFkMatches);
