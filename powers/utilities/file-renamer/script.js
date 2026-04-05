'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const descriptor = {
  name: 'File Renamer',
  description:
    'Removes text (or regex matches) from filenames in a folder. Supports dry-run preview and collision-safe renaming.',
  color: '#f59e0b',
  category: 'Utilities',
  requirements: [],
  icon: 'file-pen',
  input_schema: [
    {
      name: 'folder',
      type: 'folderpath',
      label: 'Source Folder',
      description: 'The folder whose files will be renamed',
      required: true,
      default: '',
    },
    {
      name: 'recursive',
      type: 'boolean',
      label: 'Recursive',
      description: 'Process files inside sub-folders as well',
      required: false,
      default: 'false',
    },
    {
      name: 'text-to-remove',
      type: 'text',
      label: 'Text to Remove',
      description: 'The text (or regex pattern) to strip from each filename',
      required: true,
      default: '',
    },
    {
      name: 'regex-mode',
      type: 'boolean',
      label: 'Regex Mode',
      description: 'Treat "Text to Remove" as a regular expression',
      required: false,
      default: 'false',
    },
    {
      name: 'dry-run',
      type: 'boolean',
      label: 'Dry Run',
      description: 'Preview changes without renaming files',
      required: false,
      default: 'true',
    },
  ],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total files', type: 'number' },
        { name: 'finished', label: 'Files processed', type: 'number' },
      ],
    },
  ],
  output_schema: [{ type: 'csv_file', label: 'Rename Results CSV' }],
};

// ── Describe mode ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes('--superpowers=describe')) {
  console.log(JSON.stringify(descriptor));
  process.exit(0);
}

// ── Parse args ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/s);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

const params = parseArgs(args);

const folder = params['folder'];
const recursive = params['recursive'] === 'true';
const textToRemove = params['text-to-remove'] || '';
const regexMode = params['regex-mode'] === 'true';
const dryRun = params['dry-run'] !== 'false'; // default true

if (!folder) {
  process.stderr.write('Error: --folder is required\n');
  process.exit(1);
}
if (!fs.existsSync(folder)) {
  process.stderr.write(`Error: folder not found: ${folder}\n`);
  process.exit(1);
}
if (!textToRemove) {
  process.stderr.write('Error: --text-to-remove is required\n');
  process.exit(1);
}

// Validate regex early
let removePattern;
if (regexMode) {
  try {
    removePattern = new RegExp(textToRemove, 'g');
  } catch (e) {
    process.stderr.write(`Error: invalid regex: ${e.message}\n`);
    process.exit(1);
  }
}

// ── Collect files ─────────────────────────────────────────────────────────────
function collectFiles(dir, recurse) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && recurse) {
      files.push(...collectFiles(fullPath, recurse));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

// ── Apply rename pattern to a basename (without extension) ───────────────────
function applyRemove(name) {
  if (regexMode) {
    // Reset lastIndex since we reuse the pattern across calls
    removePattern.lastIndex = 0;
    return name.replace(removePattern, '');
  }
  return name.split(textToRemove).join('');
}

// ── Collision-safe unique name ────────────────────────────────────────────────
// occupiedLower: Set of lowercased absolute paths that are considered "taken"
function resolveCollision(dir, base, ext, occupiedLower) {
  let candidate = base + ext;
  let candidatePath = path.join(dir, candidate);
  if (!occupiedLower.has(candidatePath.toLowerCase())) {
    return candidate;
  }
  let counter = 1;
  while (true) {
    candidate = `${base}_${counter}${ext}`;
    candidatePath = path.join(dir, candidate);
    if (!occupiedLower.has(candidatePath.toLowerCase())) {
      return candidate;
    }
    counter++;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const allFiles = collectFiles(folder, recursive);
const total = allFiles.length;
let finished = 0;

process.stdout.write(JSON.stringify([{ event: 'progress', payload: { total, finished } }]) + '\n');

// Build initial occupied set from all existing files (lowercased for case-insensitive FS safety)
// Key: lowercased absolute path
const occupied = new Set(allFiles.map((f) => f.toLowerCase()));

const rows = ['"Original Path","New Path","Status"'];

for (const filePath of allFiles) {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  const newBase = applyRemove(base);

  let status;
  let finalPath;

  if (newBase === base) {
    // No change
    status = 'unchanged';
    finalPath = filePath;
  } else {
    const desiredName = newBase + ext;
    const desiredPath = path.join(dir, desiredName);

    // Check if desired path collides with something OTHER than the current file
    const desiredLower = desiredPath.toLowerCase();
    const currentLower = filePath.toLowerCase();

    // Temporarily remove current file from occupied so it doesn't block itself
    occupied.delete(currentLower);

    let finalName;
    if (!occupied.has(desiredLower)) {
      finalName = desiredName;
      status = 'renamed';
    } else {
      finalName = resolveCollision(dir, newBase, ext, occupied);
      status = 'renamed (collision resolved)';
    }

    finalPath = path.join(dir, finalName);
    // Claim the new path in the occupied set
    occupied.add(finalPath.toLowerCase());
    // Re-add current file only if it was NOT renamed (dry-run: it still exists)
    // In dry-run, the source still exists but we've claimed the destination.
    // In live mode it also still exists until we rename it, handled below.
    if (dryRun) {
      occupied.add(currentLower);
    }

    if (!dryRun) {
      try {
        fs.renameSync(filePath, finalPath);
      } catch (e) {
        status = `error: ${e.message}`;
        finalPath = filePath;
        // Restore occupied state on error
        occupied.add(currentLower);
        occupied.delete(finalPath.toLowerCase());
      }
    }
  }

  const escapeCsv = (s) => `"${s.replace(/"/g, '""')}"`;
  rows.push(`${escapeCsv(filePath)},${escapeCsv(finalPath)},${escapeCsv(status)}`);

  finished++;
  process.stdout.write(
    JSON.stringify([{ event: 'progress', payload: { total, finished } }]) + '\n',
  );
}

// ── Write CSV ─────────────────────────────────────────────────────────────────
const label = dryRun ? 'dry-run' : 'renamed';
const outPath = path.join(os.tmpdir(), `file-renamer-${label}-${Date.now()}.csv`);
fs.writeFileSync(outPath, rows.join('\n') + '\n', 'utf8');

process.stdout.write(
  JSON.stringify([{ event: 'output', payload: { path: outPath, type: 'csv_file' } }]) + '\n',
);
