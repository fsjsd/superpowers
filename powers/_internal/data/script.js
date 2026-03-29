'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const descriptor = {
  name: 'Demo - CSV data',
  description: 'Returns dummy csv_file data covering every supported data type for testing.',
  category: 'Testing',
  requirements: 'Node v18+',
  icon: 'table',
  input_schema: [],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total rows', type: 'number' },
        { name: 'finished', label: 'Rows written', type: 'number' },
      ],
    },
  ],
  output_schema: [{ type: 'csv_file', label: 'Dummy data CSV' }],
};

const args = process.argv.slice(2);
if (args.includes('--superpowers=describe')) {
  console.log(JSON.stringify(descriptor));
  process.exit(0);
}

// ── Dummy data covering every CSV data type ───────────────────────────────────
// Columns: string, integer, float, boolean, date (ISO), datetime (ISO),
//          nullable (some nulls), currency amount, percent, url, email, json_blob,
//          folder_path (runtime cwd)
const cwd = process.cwd();
const rows = [
  {
    id: 1,
    label: 'Alpha',
    integer_val: 42,
    float_val: 3.14,
    boolean_val: true,
    date_val: '2026-01-15',
    datetime_val: '2026-01-15T08:30:00Z',
    nullable_val: 'present',
    amount_usd: 1250.0,
    score_pct: 0.87,
    url: 'https://example.com/alpha',
    email: 'alpha@example.com',
    json_blob: '{"key":"value","num":1}',
    category: 'A',
    folder_path: cwd,
  },
  {
    id: 2,
    label: 'Beta',
    integer_val: -7,
    float_val: -0.001,
    boolean_val: false,
    date_val: '2026-02-20',
    datetime_val: '2026-02-20T14:00:00Z',
    nullable_val: '',
    amount_usd: 340.5,
    score_pct: 0.42,
    url: 'https://example.com/beta',
    email: 'beta@example.com',
    json_blob: '{"key":"other","num":2}',
    category: 'B',
    folder_path: cwd,
  },
  {
    id: 3,
    label: 'Gamma',
    integer_val: 0,
    float_val: 1000000.99,
    boolean_val: true,
    date_val: '2026-03-01',
    datetime_val: '2026-03-01T00:00:00Z',
    nullable_val: '',
    amount_usd: 0.0,
    score_pct: 0.0,
    url: 'https://example.com/gamma',
    email: 'gamma@example.com',
    json_blob: '{}',
    category: 'A',
    folder_path: cwd,
  },
  {
    id: 4,
    label: 'Delta — "quoted", with comma',
    integer_val: 9999999,
    float_val: -9999.5,
    boolean_val: false,
    date_val: '2026-03-28',
    datetime_val: '2026-03-28T23:59:59Z',
    nullable_val: 'present',
    amount_usd: 87654.32,
    score_pct: 1.0,
    url: 'https://example.com/delta?q=1&r=2',
    email: 'delta+tag@example.com',
    json_blob: '{"arr":[1,2,3],"nested":{"x":true}}',
    category: 'C',
    folder_path: cwd,
  },
  {
    id: 5,
    label: 'Epsilon',
    integer_val: 1,
    float_val: 0.333333,
    boolean_val: true,
    date_val: '2026-04-10',
    datetime_val: '2026-04-10T12:00:00Z',
    nullable_val: 'present',
    amount_usd: 5000.0,
    score_pct: 0.55,
    url: 'https://example.com/epsilon',
    email: 'epsilon@example.com',
    json_blob: '{"flag":false}',
    category: 'B',
    folder_path: cwd,
  },
];

// ── Emit initial progress ─────────────────────────────────────────────────────
const total = rows.length;
process.stdout.write(
  JSON.stringify([{ event: 'progress', payload: { total, finished: 0 } }]) + '\n',
);

// ── Build CSV ─────────────────────────────────────────────────────────────────
function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

const headers = [
  'id',
  'label',
  'integer_val',
  'float_val',
  'boolean_val',
  'date_val',
  'datetime_val',
  'nullable_val',
  'amount_usd',
  'score_pct',
  'url',
  'email',
  'json_blob',
  'category',
  'folder_path',
];

const csvLines = [headers.join(',')];
let finished = 0;

for (const row of rows) {
  csvLines.push(headers.map((h) => escapeCsv(row[h])).join(','));
  finished++;
  process.stdout.write(
    JSON.stringify([{ event: 'progress', payload: { total, finished } }]) + '\n',
  );
}

const outPath = path.join(os.tmpdir(), `dummy-data-${Date.now()}.csv`);
fs.writeFileSync(outPath, csvLines.join('\n') + '\n');

// ── Output: CSV file ──────────────────────────────────────────────────────────
process.stdout.write(
  JSON.stringify([{ event: 'output', payload: { path: outPath, type: 'csv_file' } }]) + '\n',
);

process.exit(0);
