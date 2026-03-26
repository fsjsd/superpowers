const fs = require('fs');
const path = require('path');
const os = require('os');

const descriptor = {
  name: "List Files in Folder",
  description: "Recursively lists all files in a given folder and exports the results as a CSV.",
  category: "Files",
  requirements: "Node v18+",
  input_schema: [
    {
      name: "folder",
      type: "folderpath",
      label: "Folder",
      description: "The folder to list files from",
      required: true,
      default: ""
    },
    {
      name: "recursive",
      type: "boolean",
      label: "Recursive",
      description: "Whether to list files in subdirectories",
      required: false,
      default: "true"
    }
  ],
  events: [
    {
      type: "progress",
      payload_schema: [
        { name: "total",    label: "Total files",     type: "number" },
        { name: "finished", label: "Files processed", type: "number" }
      ]
    }
  ],
  output_schema: [
    {
      type: "csv_file",
      label: "File listing CSV"
    }
  ]
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

// Collect all files
function collectFiles(dir, recursive) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recursive) {
        files.push(...collectFiles(fullPath, recursive));
      }
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

let allFiles;
try {
  allFiles = collectFiles(folder, recursive);
} catch (err) {
  process.stderr.write(`Error reading folder: ${err.message}\n`);
  process.exit(1);
}

const total = allFiles.length;

// Build CSV rows
const csvRows = ['name,extension,size_bytes,modified_at,relative_path,absolute_path'];
let finished = 0;

for (const filePath of allFiles) {
  let size = '';
  let modifiedAt = '';
  try {
    const s = fs.statSync(filePath);
    size = s.size;
    modifiedAt = s.mtime.toISOString();
  } catch (_) {
    // skip stat errors
  }

  const relative = path.relative(folder, filePath);
  const ext = path.extname(filePath);
  const name = path.basename(filePath);

  const escapeCsv = (val) => {
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };

  csvRows.push([
    escapeCsv(name),
    escapeCsv(ext),
    escapeCsv(size),
    escapeCsv(modifiedAt),
    escapeCsv(relative),
    escapeCsv(filePath)
  ].join(','));

  finished++;
  process.stdout.write(JSON.stringify({ event: 'progress', payload: { total, finished } }) + '\n');
}

// Write output CSV
const outputPath = path.join(os.tmpdir(), `list-files-${Date.now()}.csv`);
try {
  fs.writeFileSync(outputPath, csvRows.join('\n'), 'utf8');
} catch (err) {
  process.stderr.write(`Error writing output file: ${err.message}\n`);
  process.exit(1);
}

process.stdout.write(JSON.stringify({ event: 'output', payload: { path: outputPath, type: 'csv_file' } }) + '\n');
process.exit(0);
