import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Normalizes whitespace in a string by:
 * 1. Trimming leading/trailing whitespace
 * 2. Collapsing all whitespace runs (spaces, tabs, non-breaking spaces, etc.) to a single normal space
 * 3. Preserving all other characters/case/accents
 */
function normalizeWhitespace(str: string): string {
  if (!str) return '';
  
  // Trim leading/trailing whitespace, then collapse all whitespace runs to single space
  // \s matches all whitespace characters including space, tab, non-breaking space, etc.
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Parses a CSV line handling quoted fields properly
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result;
}

/**
 * Strips UTF-8 BOM (Byte Order Mark) from the beginning of a string if present
 */
function stripBOM(content: string): string {
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1);
  }
  return content;
}

/**
 * Main function to generate damage options from CSV
 */
function generateDamageOptions() {
  // Read the CSV file
  const csvPath = join(__dirname, '..', 'docs', 'Skadetyp, Placering, Position_20251023.csv');
  let content = readFileSync(csvPath, 'utf-8');
  
  // Strip BOM if present
  content = stripBOM(content);
  
  // Parse CSV
  const lines = content.split(/\r?\n/);
  
  // Skip header row and filter empty lines
  const dataLines = lines.slice(1).filter(line => line.trim());
  
  // Build the damage options structure
  const damageOptions: Record<string, Record<string, string[]>> = {};
  
  for (const line of dataLines) {
    // Parse CSV line properly handling quoted fields
    const parts = parseCSVLine(line);
    
    if (parts.length < 3) {
      console.warn(`Skipping malformed line: ${line}`);
      continue;
    }
    
    // Extract and normalize the three columns
    const typ = normalizeWhitespace(parts[0]);
    const placering = normalizeWhitespace(parts[1]);
    const position = normalizeWhitespace(parts[2]);
    
    // Skip if typ or placering is empty
    if (!typ || !placering) {
      continue;
    }
    
    // Initialize typ if not exists
    if (!damageOptions[typ]) {
      damageOptions[typ] = {};
    }
    
    // Initialize placering array if not exists
    if (!damageOptions[typ][placering]) {
      damageOptions[typ][placering] = [];
    }
    
    // Add position if it's not empty and not already in the array
    if (position && !damageOptions[typ][placering].includes(position)) {
      damageOptions[typ][placering].push(position);
    }
  }
  
  // Generate the output
  const csvFileName = csvPath.split('/').pop() || 'CSV file';
  const output = `// Auto-generated from ${csvFileName}
// Generated at: ${new Date().toISOString()}

export const DAMAGE_OPTIONS = ${JSON.stringify(damageOptions, null, 2)} as const;

export const DAMAGE_TYPES = Object.keys(DAMAGE_OPTIONS).sort();
`;
  
  // Write to data directory
  const outputPath = join(__dirname, '..', 'data', 'damage-options.ts');
  writeFileSync(outputPath, output, 'utf-8');
  
  console.log(`✅ Generated damage options successfully!`);
  console.log(`   Input: ${csvPath}`);
  console.log(`   Output: ${outputPath}`);
  console.log(`   Types found: ${Object.keys(damageOptions).length}`);
  console.log(`   Total car parts: ${Object.values(damageOptions).reduce((sum, parts) => sum + Object.keys(parts).length, 0)}`);
}

// Run the generator
generateDamageOptions();
