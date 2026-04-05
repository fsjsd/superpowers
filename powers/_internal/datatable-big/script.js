'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const descriptor = {
  name: 'Demo - Data Table (Big)',
  description: 'Returns dummy data_table data covering every supported data type for testing.',
  category: 'Testing',
  color: '#10b981',
  requirements: [],
  icon: 'table',
  input_schema: [
    {
      name: 'note',
      type: 'text',
      label: 'Note',
      description: 'Optional note (not used in generation)',
      required: false,
      default: '',
    },
  ],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total rows', type: 'number' },
        { name: 'finished', label: 'Rows written', type: 'number' },
      ],
    },
  ],
  output_schema: [{ type: 'data_table', label: 'Dummy data CSV' }],
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
const CATEGORIES = ['A', 'B', 'C'];
const JSON_BLOBS = [
  '{"key":"value","num":1}',
  '{"key":"other","num":2}',
  '{}',
  '{"arr":[1,2,3],"nested":{"x":true}}',
  '{"flag":false}',
  '{"count":42,"active":true}',
  '{"tags":["alpha","beta"],"score":0.9}',
];

function isoDate(dayOffset) {
  const d = new Date(2026, 0, 1);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

function isoDatetime(dayOffset, hour) {
  const d = new Date(2026, 0, 1);
  d.setDate(d.getDate() + dayOffset);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString().replace('.000', '');
}

const rows = Array.from({ length: 500 }, (_, i) => {
  const n = i + 1;
  const label = `Row-${String(n).padStart(3, '0')}`;
  const slug = label.toLowerCase();
  return {
    id: n,
    label,
    integer_val: Math.round(Math.sin(n) * 1e7),
    float_val: parseFloat((Math.cos(n) * 1e6).toFixed(6)),
    boolean_val: n % 2 === 0,
    date_val: isoDate(i),
    datetime_val: isoDatetime(i, n % 24),
    nullable_val: n % 5 === 0 ? '' : 'present',
    amount_usd: parseFloat((Math.abs(Math.sin(n * 7)) * 100000).toFixed(2)),
    score_pct: parseFloat(Math.abs(Math.sin(n * 13)).toFixed(6)),
    url: `https://example.com/${slug}`,
    email: `${slug}@example.com`,
    json_blob: JSON_BLOBS[i % JSON_BLOBS.length],
    category: CATEGORIES[i % CATEGORIES.length],
    folder_path: cwd,
  };
});

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
  JSON.stringify([{ event: 'output', payload: { path: outPath, type: 'data_table' } }]) + '\n',
);

process.exit(0);
