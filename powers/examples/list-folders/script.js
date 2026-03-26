const fs = require('fs');
const path = require('path');
const os = require('os');

const descriptor = {
  name: 'List Folders',
  description:
    'Recursively lists all subfolders in a given folder and exports the results as a CSV.',
  category: 'Files',
  requirements: 'Node v18+',
  icon: 'folder-tree',
  input_schema: [
    {
      name: 'folder',
      type: 'folderpath',
      label: 'Folder',
      description: 'The folder to list subfolders from',
      required: true,
      default: '',
    },
    {
      name: 'recursive',
      type: 'boolean',
      label: 'Recursive',
      description: 'Whether to list folders in subdirectories',
      required: false,
      default: 'true',
    },
  ],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total folders', type: 'number' },
        { name: 'finished', label: 'Folders processed', type: 'number' },
      ],
    },
  ],
  output_schema: [
    {
      type: 'csv_file',
      label: 'Folder listing CSV',
    },
  ],
};

const args = process.argv.slice(2);

if (args.includes('--superpowers=describe')) {
  console.log(JSON.stringify(descriptor));
  process.exit(0);
}

// Parse --name=value arguments
function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/s);
    if (match) {
      result[match[1]] = match[2];
    }
  }
  return result;
}

const params = parseArgs(args);

const folder = params['folder'];
if (!folder) {
  process.stderr.write('Error: --folder is required\n');
  process.exit(1);
}

if (!fs.existsSync(folder)) {
  process.stderr.write(`Error: folder does not exist: ${folder}\n`);
  process.exit(1);
}

const stat = fs.statSync(folder);
if (!stat.isDirectory()) {
  process.stderr.write(`Error: path is not a directory: ${folder}\n`);
  process.exit(1);
}

const recursive = params['recursive'] !== 'false';

// Collect all subfolders
function collectFolders(dir, recursive) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const folders = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const fullPath = path.join(dir, entry.name);
      folders.push(fullPath);
      if (recursive) {
        folders.push(...collectFolders(fullPath, recursive));
      }
    }
  }
  return folders;
}

let allFolders;
try {
  allFolders = collectFolders(folder, recursive);
} catch (err) {
  process.stderr.write(`Error reading folder: ${err.message}\n`);
  process.exit(1);
}

const total = allFolders.length;

// Build CSV rows
const csvRows = ['name,modified_at,relative_path,absolute_path'];
let finished = 0;

const escapeCsv = (val) => {
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
};

for (const folderPath of allFolders) {
  let modifiedAt = '';
  try {
    const s = fs.statSync(folderPath);
    modifiedAt = s.mtime.toISOString();
  } catch (_) {
    // skip stat errors
  }

  const relative = path.relative(folder, folderPath);
  const name = path.basename(folderPath);

  csvRows.push(
    [escapeCsv(name), escapeCsv(modifiedAt), escapeCsv(relative), escapeCsv(folderPath)].join(','),
  );

  finished++;
  process.stdout.write(JSON.stringify({ event: 'progress', payload: { total, finished } }) + '\n');
}

// Write output CSV
const outputPath = path.join(os.tmpdir(), `list-folders-${Date.now()}.csv`);
try {
  fs.writeFileSync(outputPath, csvRows.join('\n'), 'utf8');
} catch (err) {
  process.stderr.write(`Error writing output file: ${err.message}\n`);
  process.exit(1);
}

process.stdout.write(
  JSON.stringify({ event: 'output', payload: { path: outputPath, type: 'csv_file' } }) + '\n',
);
process.exit(0);
