'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const descriptor = {
  name: 'Demo - All Output Types',
  description:
    'Emits dummy data for every supported output type: data_table, media, html, markdown, metric, and all four chart types.',
  category: 'Testing',
  color: '#6366f1',
  requirements: [],
  icon: 'flask-conical',
  input_schema: [],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total outputs', type: 'number' },
        { name: 'finished', label: 'Outputs emitted', type: 'number' },
      ],
    },
  ],
  output_schema: [
    { type: 'data_table', label: 'Dummy CSV' },
    { type: 'media', label: 'Dummy Image' },
    { type: 'html', label: 'Dummy HTML' },
    { type: 'markdown', label: 'Dummy Markdown' },
    { type: 'metric', label: 'Key Metrics', format: { type: 'number', decimals: 0 } },
    { type: 'chart', chartType: 'bar', label: 'Bar Chart' },
    { type: 'chart', chartType: 'line', label: 'Line Chart' },
    { type: 'chart', chartType: 'area', label: 'Area Chart' },
    { type: 'chart', chartType: 'pie', label: 'Pie Chart' },
  ],
};

const args = process.argv.slice(2);
if (args.includes('--superpowers=describe')) {
  console.log(JSON.stringify(descriptor));
  process.exit(0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const total = 9;
let finished = 0;

function emit(events) {
  process.stdout.write(JSON.stringify(events) + '\n');
}

function progress() {
  emit([{ event: 'progress', payload: { total, finished } }]);
}

function output(payload) {
  finished++;
  emit([{ event: 'output', payload }]);
  progress();
}

function tmpFile(ext) {
  return path.join(
    os.tmpdir(),
    `kitchensink-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`,
  );
}

// ── Initial progress ──────────────────────────────────────────────────────────
progress();

// ── 1. data_table ───────────────────────────────────────────────────────────────
const csvPath = tmpFile('csv');
const csvLines = [
  'name,age,city,score',
  'Alice,30,New York,95',
  'Bob,25,London,82',
  'Carol,35,Tokyo,91',
  'Dave,28,Sydney,77',
];
fs.writeFileSync(csvPath, csvLines.join('\n') + '\n');
output({ type: 'data_table', path: csvPath });

// ── 2. media (SVG image) ──────────────────────────────────────────────────────
const svgPath = tmpFile('svg');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160" viewBox="0 0 320 160">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="320" height="160" fill="url(#bg)" rx="12"/>
  <text x="160" y="75" text-anchor="middle" fill="white" font-family="sans-serif" font-size="22" font-weight="bold">Kitchen Sink</text>
  <text x="160" y="105" text-anchor="middle" fill="rgba(255,255,255,0.75)" font-family="sans-serif" font-size="14">Dummy Media Output</text>
</svg>`;
fs.writeFileSync(svgPath, svg);
output({ type: 'media', path: svgPath });

// ── 3. html ───────────────────────────────────────────────────────────────────
const htmlPath = tmpFile('html');
const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Dummy HTML</title>
  <style>
    body { font-family: sans-serif; max-width: 600px; margin: 2rem auto; color: #1e1b4b; }
    h1 { color: #6366f1; }
    table { border-collapse: collapse; width: 100%; margin-top: 1rem; }
    th, td { border: 1px solid #c7d2fe; padding: 0.5rem 1rem; text-align: left; }
    th { background: #eef2ff; }
  </style>
</head>
<body>
  <h1>Kitchen Sink — HTML Output</h1>
  <p>This is a <strong>dummy HTML</strong> file emitted by the kitchen sink script.</p>
  <table>
    <thead><tr><th>Item</th><th>Value</th></tr></thead>
    <tbody>
      <tr><td>Alpha</td><td>100</td></tr>
      <tr><td>Beta</td><td>200</td></tr>
      <tr><td>Gamma</td><td>300</td></tr>
    </tbody>
  </table>
</body>
</html>`;
fs.writeFileSync(htmlPath, html);
output({ type: 'html', path: htmlPath });

// ── 4. markdown ───────────────────────────────────────────────────────────────
const mdPath = tmpFile('md');
const markdown = `# Kitchen Sink — Markdown Output

This is a **dummy markdown** file emitted by the kitchen sink script.

## Features

- Supports _all_ output types
- Generates dummy data automatically
- No inputs required

## Sample Table

| Name  | Score | Grade |
|-------|-------|-------|
| Alice |    95 | A     |
| Bob   |    82 | B     |
| Carol |    91 | A-    |

> All data in this file is randomly generated for testing purposes.
`;
fs.writeFileSync(mdPath, markdown);
output({ type: 'markdown', path: mdPath });

// ── 5. metric ─────────────────────────────────────────────────────────────────
output({
  type: 'metric',
  value: 1_234,
  secondary_value: 5_678,
  label: 'Total Records',
  secondary_label: 'Total Capacity',
  format: { type: 'number', decimals: 0 },
  secondary_format: { type: 'number', decimals: 0 },
});

// ── 6. bar chart ──────────────────────────────────────────────────────────────
output({
  type: 'chart',
  chartType: 'bar',
  title: 'Revenue by Month',
  nameKey: 'month',
  dataKeys: ['revenue', 'expenses'],
  data: [
    { month: 'Jan', revenue: 4200, expenses: 3100 },
    { month: 'Feb', revenue: 5800, expenses: 3400 },
    { month: 'Mar', revenue: 5100, expenses: 3700 },
    { month: 'Apr', revenue: 6300, expenses: 4000 },
    { month: 'May', revenue: 7200, expenses: 4200 },
    { month: 'Jun', revenue: 6900, expenses: 3900 },
  ],
});

// ── 7. line chart ─────────────────────────────────────────────────────────────
output({
  type: 'chart',
  chartType: 'line',
  title: 'Daily Active Users',
  nameKey: 'day',
  dataKeys: ['users', 'sessions'],
  data: [
    { day: 'Mon', users: 820, sessions: 1340 },
    { day: 'Tue', users: 930, sessions: 1520 },
    { day: 'Wed', users: 880, sessions: 1450 },
    { day: 'Thu', users: 1050, sessions: 1700 },
    { day: 'Fri', users: 1200, sessions: 1950 },
    { day: 'Sat', users: 750, sessions: 1100 },
    { day: 'Sun', users: 680, sessions: 980 },
  ],
});

// ── 8. area chart ─────────────────────────────────────────────────────────────
output({
  type: 'chart',
  chartType: 'area',
  title: 'Storage Usage Over Time',
  nameKey: 'week',
  dataKeys: ['used', 'available'],
  data: [
    { week: 'W1', used: 120, available: 880 },
    { week: 'W2', used: 195, available: 805 },
    { week: 'W3', used: 280, available: 720 },
    { week: 'W4', used: 340, available: 660 },
    { week: 'W5', used: 420, available: 580 },
    { week: 'W6', used: 510, available: 490 },
  ],
});

// ── 9. pie chart ──────────────────────────────────────────────────────────────
output({
  type: 'chart',
  chartType: 'pie',
  title: 'Market Share by Platform',
  nameKey: 'platform',
  dataKeys: ['value'],
  data: [
    { platform: 'macOS', value: 38 },
    { platform: 'Windows', value: 45 },
    { platform: 'Linux', value: 12 },
    { platform: 'Other', value: 5 },
  ],
});

process.exit(0);
