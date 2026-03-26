const fs = require('fs');
const path = require('path');
const os = require('os');

const descriptor = {
  name: 'List Folder Sizes',
  description: 'Shows the size of each top-level subfolder within a given directory.',
  category: 'Files',
  requirements: 'Node v18+',
  icon: 'folder-open',
  input_schema: [
    {
      name: 'folder',
      type: 'folderpath',
      label: 'Target Folder',
      description: 'The folder whose top-level subfolders will be measured.',
      required: true,
      default: '',
    },
  ],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total subfolders', type: 'number' },
        { name: 'finished', label: 'Subfolders scanned', type: 'number' },
      ],
    },
  ],
  output_schema: [
    {
      type: 'csv_file',
      label: 'Folder sizes CSV',
    },
  ],
};

const args = process.argv.slice(2);
if (args.includes('--superpowers=describe')) {
  console.log(JSON.stringify(descriptor));
  process.exit(0);
}

// Parse arguments
const parsed = {};
for (const arg of args) {
  const match = arg.match(/^--([^=]+)=(.*)$/s);
  if (match) parsed[match[1]] = match[2];
}

const folder = parsed['folder'];
if (!folder) {
  process.stderr.write('Error: --folder is required\n');
  process.exit(1);
}

if (!fs.existsSync(folder)) {
  process.stderr.write(`Error: folder does not exist: ${folder}\n`);
  process.exit(1);
}

/** Recursively compute the total byte size of a directory. */
function getDirSize(dirPath) {
  let total = 0;
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isSymbolicLink()) {
      continue;
    } else if (entry.isDirectory()) {
      total += getDirSize(full);
    } else {
      try {
        total += fs.statSync(full).size;
      } catch {
        // skip unreadable files
      }
    }
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(2) + ' GB';
  if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(2) + ' MB';
  if (bytes >= 1_024) return (bytes / 1_024).toFixed(2) + ' KB';
  return bytes + ' B';
}

// Gather top-level subfolders
let entries;
try {
  entries = fs.readdirSync(folder, { withFileTypes: true });
} catch (err) {
  process.stderr.write(`Error reading folder: ${err.message}\n`);
  process.exit(1);
}

const subfolders = entries.filter((e) => e.isDirectory()).map((e) => e.name);
const total = subfolders.length;

if (total === 0) {
  process.stderr.write('No subfolders found in the specified directory.\n');
  process.exit(1);
}

// Scan each subfolder
const results = [];
for (let i = 0; i < subfolders.length; i++) {
  const name = subfolders[i];
  const full = path.join(folder, name);
  const bytes = getDirSize(full);
  results.push({ name, bytes, human: formatBytes(bytes) });

  console.log(
    JSON.stringify({
      event: 'progress',
      payload: { total, finished: i + 1 },
    }),
  );
}

// Sort descending by size
results.sort((a, b) => b.bytes - a.bytes);

// Write CSV
const outputPath = path.join(os.tmpdir(), `folder-sizes-${Date.now()}.csv`);
const header = 'Folder,Size (bytes),Size (human)\n';
const rows = results
  .map((r) => `"${r.name.replace(/"/g, '""')}",${r.bytes},"${r.human}"`)
  .join('\n');
fs.writeFileSync(outputPath, header + rows + '\n', 'utf8');

console.log(
  JSON.stringify({
    event: 'output',
    payload: { path: outputPath, type: 'csv_file' },
  }),
);

process.exit(0);
