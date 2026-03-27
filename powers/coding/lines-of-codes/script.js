const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const descriptor = {
  name: 'Lines of Code',
  description:
    'Counts lines of code per language in a folder using cloc and exports results as a CSV.',
  category: 'Code',
  requirements: 'Node v18+, cloc installed (brew install cloc / apt install cloc)',
  icon: 'file-code',
  input_schema: [
    {
      name: 'folder',
      type: 'folderpath',
      label: 'Folder',
      description: 'The folder to analyse',
      required: true,
      default: '',
    },
    {
      name: 'exclude-dir',
      type: 'text',
      label: 'Exclude directories',
      description: 'Comma-separated list of directory names to exclude (e.g. node_modules,.git)',
      required: false,
      default: 'node_modules,.git,venv,.venv,env,dist,build,.next',
    },
  ],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total steps', type: 'number' },
        { name: 'finished', label: 'Steps completed', type: 'number' },
      ],
    },
  ],
  output_schema: [
    {
      type: 'csv_file',
      label: 'Lines of code by language',
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

if (!fs.statSync(folder).isDirectory()) {
  process.stderr.write(`Error: path is not a directory: ${folder}\n`);
  process.exit(1);
}

// Check cloc is available
const clocCheck = spawnSync('cloc', ['--version'], { encoding: 'utf8' });
if (clocCheck.error) {
  process.stderr.write(
    'Error: cloc is not installed or not on PATH.\n' +
      'Install it with: brew install cloc  (macOS) or  apt install cloc  (Linux)\n',
  );
  process.exit(1);
}

process.stdout.write(
  JSON.stringify([{ event: 'progress', payload: { total: 1, finished: 0 } }]) + '\n',
);

// Build cloc arguments
const clocArgs = ['--json', folder];
const excludeDir = params['exclude-dir'];
if (excludeDir && excludeDir.trim()) {
  clocArgs.push(`--exclude-dir=${excludeDir.trim()}`);
}

const result = spawnSync('cloc', clocArgs, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 });

if (result.error) {
  process.stderr.write(`Error running cloc: ${result.error.message}\n`);
  process.exit(1);
}

if (result.status !== 0) {
  process.stderr.write(`cloc exited with code ${result.status}:\n${result.stderr}\n`);
  process.exit(1);
}

let clocData;
try {
  clocData = JSON.parse(result.stdout);
} catch (err) {
  process.stderr.write(`Error parsing cloc output: ${err.message}\n`);
  process.stderr.write(`cloc stdout: ${result.stdout}\n`);
  process.exit(1);
}

// Build CSV
// cloc JSON shape: { header: {...}, SUM: {...}, <Language>: { nFiles, blank, comment, code }, ... }
const csvRows = ['language,files,blank,comment,code'];

const skipKeys = new Set(['header']);

// Sort languages by code descending, SUM last
const entries = Object.entries(clocData).filter(([key]) => !skipKeys.has(key));
const sumEntry = entries.find(([key]) => key === 'SUM');
const langEntries = entries
  .filter(([key]) => key !== 'SUM')
  .sort((a, b) => (b[1].code || 0) - (a[1].code || 0));

const ordered = sumEntry ? [...langEntries, sumEntry] : langEntries;

for (const [language, stats] of ordered) {
  const escapeCsv = (val) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  };
  csvRows.push(
    [
      escapeCsv(language),
      escapeCsv(stats.nFiles ?? ''),
      escapeCsv(stats.blank ?? ''),
      escapeCsv(stats.comment ?? ''),
      escapeCsv(stats.code ?? ''),
    ].join(','),
  );
}

const outputPath = path.join(os.tmpdir(), `lines-of-code-${Date.now()}.csv`);
try {
  fs.writeFileSync(outputPath, csvRows.join('\n'), 'utf8');
} catch (err) {
  process.stderr.write(`Error writing output file: ${err.message}\n`);
  process.exit(1);
}

process.stdout.write(
  JSON.stringify([{ event: 'progress', payload: { total: 1, finished: 1 } }]) + '\n',
);
process.stdout.write(
  JSON.stringify([{ event: 'output', payload: { path: outputPath, type: 'csv_file' } }]) + '\n',
);
process.exit(0);
