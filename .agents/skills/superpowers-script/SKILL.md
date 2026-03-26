---
name: superpowers-script
description: Use when writing, creating, or fixing a Superpowers script — a Node.js or Python script that runs inside the Super Powers Electron app. Triggers on requests like "write a superpowers script", "create a new power", "add a script to superpowers", or "make a script that follows the superpowers protocol".
---

# Superpowers Script Protocol

Scripts run inside the **Super Powers** Electron app. They must conform to the protocol below exactly.

## Analysis

ALWAYS clarify ambiguous requirements with the user before writing code. If the user has not specified a required input, ask them to choose from a list of options or provide a custom value. ALWAYS ask what output they want and in what format

## Rules

1. **Describe mode** — When invoked with `--superpowers=describe`, print a single JSON descriptor to stdout and exit 0. Print nothing else.
2. **Run mode** — Inputs are passed as `--name=value` CLI args matching `input_schema[].name`.
3. **Structured events** — Emit newline-delimited JSON on stdout. Any non-JSON line is treated as a plain log message.
4. **Exit codes** — `0` on success. Non-zero on failure with a descriptive message on stderr.
5. **Language** — Use Node.js (CommonJS `require()`) unless the task specifically requires Python. Do not use ESM (`import`).

## Descriptor Shape

```json
{
  "name": "Human-readable script name",
  "description": "One-sentence description",
  "category": "Media | Data | Files | Code | …",
  "requirements": "Node v18+, ffmpeg installed, …",
  "author": "optional",
  "icon": "lucide-icon-name",
  "input_schema": [
    {
      "name": "param-name",
      "type": "folderpath | filepath | text | boolean | number | select | env_var",
      "label": "Human-readable label",
      "description": "Optional helper text",
      "required": true,
      "default": "",
      "options": ["only for select type"]
    }
  ],
  "events": [
    {
      "type": "progress",
      "payload_schema": [
        { "name": "total", "label": "Total items", "type": "number" },
        { "name": "finished", "label": "Items completed", "type": "number" }
      ]
    }
  ],
  "output_schema": [
    { "type": "csv_file | media | html", "label": "Human-readable output label" },
    {
      "type": "chart",
      "chartType": "bar | line | area | pie",
      "label": "Human-readable chart label"
    }
  ]
}
```

## Event Shapes

```js
// Progress — emit periodically during work
process.stdout.write(JSON.stringify({ event: 'progress', payload: { total, finished } }) + '\n');

// Output (file-based) — example with file result
process.stdout.write(
  JSON.stringify({
    event: 'output',
    payload: { path: '/abs/path/to/output.csv', type: 'csv_file' },
  }) + '\n',
);

// Output (chart) — example with single chart data; no file path
// chartType: 'bar' | 'line' | 'area' | 'pie'
// data:      recharts-compatible flat array of objects
// dataKeys:  series keys to plot (maps to <Bar dataKey="…">, <Line dataKey="…">, etc.)
// nameKey:   key used for the X-axis label (bar/line/area) or slice label (pie)
process.stdout.write(
  JSON.stringify({
    event: 'output',
    payload: {
      type: 'chart',
      chartType: 'bar',
      title: 'Revenue by Month',
      nameKey: 'month',
      dataKeys: ['revenue', 'expenses'],
      data: [
        { month: 'Jan', revenue: 4200, expenses: 3100 },
        { month: 'Feb', revenue: 5800, expenses: 3400 },
      ],
    },
  }) + '\n',
);
```

`type` must be one of: `csv_file`, `media`, `html`, `chart`.

### Chart data shapes by type

| chartType | `data` row shape                             | `nameKey`       | `dataKeys`                 |
| --------- | -------------------------------------------- | --------------- | -------------------------- |
| `bar`     | `{ [nameKey]: string, [series]: number, … }` | X-axis category | One or more numeric series |
| `line`    | `{ [nameKey]: string, [series]: number, … }` | X-axis category | One or more numeric series |
| `area`    | `{ [nameKey]: string, [series]: number, … }` | X-axis category | One or more numeric series |
| `pie`     | `{ [nameKey]: string, value: number }`       | Slice label     | Always `["value"]`         |

> **Pie charts** always use `value` as the numeric field. Set `dataKeys: ['value']` by convention.

## Input Type Notes

| Type         | Notes                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------- |
| `folderpath` | Path to a directory                                                                                     |
| `filepath`   | Path to a single file                                                                                   |
| `text`       | Plain string                                                                                            |
| `boolean`    | Passed as `--flag=true` / `--flag=false`; parse the string value                                        |
| `number`     | Numeric string; parse with `parseInt` / `parseFloat`                                                    |
| `select`     | One of the values in `options`                                                                          |
| `env_var`    | Name of an environment variable; script should read the value itself with `process.env` or `os.environ` |

## Output Type Notes

| Type       | Notes                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `csv_file` | Write CSV with a header row; emit absolute path via `output` event                                                        |
| `media`    | Write image or video file; emit absolute path via `output` event                                                          |
| `html`     | Write HTML file; app sanitises with DOMPurify before rendering; emit absolute path via `output` event                     |
| `metric`   | Fixed number result matching Metric Type                                                                                  |
| `chart`    | Recharts-compatible chart delivered inline via `output` event; no file path. Must declare `chartType` in `output_schema`. |

## Output - Metric Type Notes

| Metric Type       | Notes                                            |
| ----------------- | ------------------------------------------------ |
| `value`           | A single numeric value, e.g. "Total Expenditure" |
| `secondary_value` | A single numeric value, e.g. "Total Budget"      |
| `label`           | A descriptive label for the value                |
| `secondary_label` | A descriptive label for the secondary_value      |

---

## Node.js Boilerplate (copy-paste starting point)

```js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const descriptor = {
  name: 'My Script',
  description: 'Does something useful.',
  category: 'Files',
  requirements: 'Node v18+',
  icon: 'file',
  input_schema: [
    { name: 'folder', type: 'folderpath', label: 'Folder', required: true, default: '' },
  ],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total', type: 'number' },
        { name: 'finished', label: 'Finished', type: 'number' },
      ],
    },
  ],
  output_schema: [
    { type: 'csv_file', label: 'Results CSV' },
    { type: 'chart', chartType: 'bar', label: 'Results by Category' },
    { type: 'chart', chartType: 'pie', label: 'Share by Type' },
  ],
};

const args = process.argv.slice(2);
if (args.includes('--superpowers=describe')) {
  console.log(JSON.stringify(descriptor));
  process.exit(0);
}

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/s);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

const params = parseArgs(args);

// ── Validate required inputs ──────────────────────────────────────────────────
const folder = params['folder'];
if (!folder) {
  process.stderr.write('Error: --folder is required\n');
  process.exit(1);
}
if (!fs.existsSync(folder)) {
  process.stderr.write(`Error: folder not found: ${folder}\n`);
  process.exit(1);
}

// ── Work ──────────────────────────────────────────────────────────────────────
const items = []; // TODO: collect items
const total = items.length;
let finished = 0;

process.stdout.write(JSON.stringify({ event: 'progress', payload: { total, finished } }) + '\n');

for (const item of items) {
  // TODO: process item
  finished++;
  process.stdout.write(JSON.stringify({ event: 'progress', payload: { total, finished } }) + '\n');
}

// ── Write CSV output ──────────────────────────────────────────────────────────
const outPath = path.join(os.tmpdir(), `my-script-${Date.now()}.csv`);
const rows = ['Column A,Column B']; // TODO: fill rows
fs.writeFileSync(outPath, rows.join('\n') + '\n');

process.stdout.write(
  JSON.stringify({ event: 'output', payload: { path: outPath, type: 'csv_file' } }) + '\n',
);

// ── Emit bar chart ────────────────────────────────────────────────────────────
process.stdout.write(
  JSON.stringify({
    event: 'output',
    payload: {
      type: 'chart',
      chartType: 'bar',
      title: 'Results by Category',
      nameKey: 'category',
      dataKeys: ['count'],
      data: [
        // TODO: replace with real rows e.g. { category: 'Images', count: 42 }
      ],
    },
  }) + '\n',
);

// ── Emit pie chart ────────────────────────────────────────────────────────────
process.stdout.write(
  JSON.stringify({
    event: 'output',
    payload: {
      type: 'chart',
      chartType: 'pie',
      title: 'Share by Type',
      nameKey: 'name',
      dataKeys: ['value'],
      data: [
        // TODO: replace with real rows e.g. { name: 'Images', value: 42 }
      ],
    },
  }) + '\n',
);

process.exit(0);
```

## Python Boilerplate

```python
import sys, json, os, csv, tempfile

descriptor = {
    "name": "My Script",
    "description": "Does something useful.",
    "category": "Files",
    "requirements": "Python 3.9+",
    "icon": "file",
    "input_schema": [
        {"name": "folder", "type": "folderpath", "label": "Folder", "required": True, "default": ""},
    ],
    "events": [
        {"type": "progress", "payload_schema": [
            {"name": "total",    "label": "Total",    "type": "number"},
            {"name": "finished", "label": "Finished", "type": "number"},
        ]},
    ],
    "output_schema": [
        {"type": "csv_file", "label": "Results CSV"},
        {"type": "chart", "chartType": "bar", "label": "Results by Category"},
        {"type": "chart", "chartType": "pie", "label": "Share by Type"},
    ],
}

if '--superpowers' in sys.argv:
    idx = sys.argv.index('--superpowers')
    if idx + 1 < len(sys.argv) and sys.argv[idx + 1] == 'describe':
        print(json.dumps(descriptor))
        sys.exit(0)

# Parse --name=value args
params = {}
for arg in sys.argv[1:]:
    if arg.startswith('--') and '=' in arg:
        k, v = arg[2:].split('=', 1)
        params[k] = v

# ── Validate ──────────────────────────────────────────────────────────────────
folder = params.get('folder')
if not folder:
    print('Error: --folder is required', file=sys.stderr)
    sys.exit(1)
if not os.path.isdir(folder):
    print(f'Error: folder not found: {folder}', file=sys.stderr)
    sys.exit(1)

# ── Work ──────────────────────────────────────────────────────────────────────
items = []  # TODO: collect items
total = len(items)
finished = 0

print(json.dumps({"event": "progress", "payload": {"total": total, "finished": finished}}), flush=True)

for item in items:
    # TODO: process item
    finished += 1
    print(json.dumps({"event": "progress", "payload": {"total": total, "finished": finished}}), flush=True)

# ── Write CSV output ──────────────────────────────────────────────────────────
out_path = os.path.join(tempfile.gettempdir(), f'my-script-{os.getpid()}.csv')
with open(out_path, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Column A', 'Column B'])
    # TODO: write rows

print(json.dumps({"event": "output", "payload": {"path": out_path, "type": "csv_file"}}), flush=True)

# ── Emit bar chart ────────────────────────────────────────────────────────────
print(json.dumps({
    "event": "output",
    "payload": {
        "type":      "chart",
        "chartType": "bar",
        "title":     "Results by Category",
        "nameKey":   "category",
        "dataKeys":  ["count"],
        "data": [
            # TODO: replace with real rows e.g. {"category": "Images", "count": 42}
        ],
    },
}), flush=True)

# ── Emit pie chart ────────────────────────────────────────────────────────────
print(json.dumps({
    "event": "output",
    "payload": {
        "type":      "chart",
        "chartType": "pie",
        "title":     "Share by Type",
        "nameKey":   "name",
        "dataKeys":  ["value"],
        "data": [
            # TODO: replace with real rows e.g. {"name": "Images", "value": 42}
        ],
    },
}), flush=True)

sys.exit(0)
```

## Reference Examples

See `powers/examples/` for complete working scripts:

- `lines-of-codes/script.js` — uses an external CLI tool (`cloc`), emits progress, outputs CSV
- `list-folders/script.js` — recursive directory traversal, boolean input, outputs CSV
- `list-folder-size/script.js` — disk usage analysis, outputs CSV
