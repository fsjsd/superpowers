---
name: superpowers
description: Use when writing, creating, or fixing a Superpowers script — a Node.js or Python script that runs inside the Super Powers Electron app. Triggers on requests like "write a superpowers script", "create a new power", "add a script to superpowers", or "make a script that follows the superpowers protocol".
---

# Superpowers Script Protocol

Scripts run inside the **Super Powers** Electron app. They must conform to the protocol below exactly.

## ⛔ STOP — Ask Before Writing

Do not write a script until you have confirmed with the user:

1. **What outputs they want** — list only from: `csv_file`, `media`, `html`, `markdown`, `chart`, `metric`
2. **What inputs are required** — only ask if non-obvious

The app's output renderer is driven by the `output_schema` declaration — it only knows how to display types that are declared. Adding undeclared output types silently fails in the UI. Confirming up front ensures you implement exactly what the user asked for and nothing they didn't.

## Rules

1. **Describe mode** — When invoked with `--superpowers=describe`, print a single JSON descriptor to stdout and exit 0. Print nothing else.
2. **Run mode** — Inputs are passed as `--name=value` CLI args matching `input_schema[].name`.
3. **Structured events** — Emit newline-delimited JSON on stdout. Any non-JSON line is treated as a plain log message. Emit structured events with the shape `[{ event: string, payload: object }]` for Super Powers to consume. See "Event Shapes" below.
4. **Exit codes** — `0` on success. Non-zero on failure with a descriptive message on stderr.
5. **Language** — Use Node.js (CommonJS `require()`) unless the task specifically requires Python. Do not use ESM (`import`) — scripts run in an isolated Node.js worker process that uses CommonJS module resolution; ESM imports will fail at runtime.

## Descriptor Shape

```json
{
  "name": "Human-readable script name",
  "description": "One-sentence description",
  "color": "#3B82F6",
  "category": "Media | Data | Files | Code | …",
  "requirements": [
    {
      "name": "FFmpeg",
      "mac_cmd": "brew install ffmpeg",
      "win_cmd": "winget install ffmpeg"
    }
  ],
  "author": "optional",
  "icon": "lucide-icon-name",
  "input_schema": [
    {
      "name": "param-name",
      "type": "folderpath | filepath | text | boolean | number | select | env_var",
      "label": "Human-readable label",
      "description": "Optional helper text",
      "required": true | false,
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
      "stacked": true | false, // optional, only for bar/area
      "label": "Human-readable chart label"
    },
    {
      "type": "metric",
      "label": "Total Cost",
      "format": { "type": "currency", "currency": "USD" }
    }
  ]
}
```

### `color` field

Optional 6-digit hex string (e.g. `"#3B82F6"`). The app uses this color for the script's icon throughout the UI. It auto-derives a companion color for the opposite brightness mode (light/dark), so you only need to provide one color. Must be a 6-digit hex — 3-digit shorthands and 8-digit hex are rejected.

### `requirements` field

An array of tool dependencies the script needs to run (beyond the runtime itself — do **not** list Node, Python, etc.). Use an empty array `[]` when the script has no external tool dependencies.

Each entry has:

- `name` — human-readable label (e.g. `"FFmpeg"`, `"cloc"`)
- `mac_cmd` — macOS install command (e.g. `"brew install ffmpeg"`)
- `win_cmd` — Windows install command (e.g. `"winget install ffmpeg"`)

Common examples:

```json
{ "name": "FFmpeg", "mac_cmd": "brew install ffmpeg", "win_cmd": "winget install ffmpeg" }
{ "name": "cloc",   "mac_cmd": "brew install cloc",   "win_cmd": "winget install cloc" }
{ "name": "ImageMagick", "mac_cmd": "brew install imagemagick", "win_cmd": "winget install imagemagick" }
```

## Event Shapes

```js
// Progress — emit periodically during work
process.stdout.write(
  JSON.stringify([{ event: 'progress', payload: { total: total, finished: finished } }]) + '\n',
);

// Output (file-based) — example with file result
process.stdout.write(
  JSON.stringify([
    {
      event: 'output',
      payload: { path: '/abs/path/to/output.csv', type: 'csv_file' },
    },
  ]) + '\n',
);

// Output (chart) — example with single chart data; no file path
// chartType: 'bar' | 'line' | 'area' | 'pie'
// data:      recharts-compatible flat array of objects
// dataKeys:  series keys to plot (maps to <Bar dataKey="…">, <Line dataKey="…">, etc.)
// nameKey:   key used for the X-axis label (bar/line/area) or slice label (pie)
process.stdout.write(
  JSON.stringify([
    {
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
    },
  ]) + '\n',
);
```

`type` must be one of: `csv_file`, `media`, `html`, `chart`, `metric`.

### Chart data shapes by type

| chartType | `data` row shape                             | `nameKey`       | `dataKeys`                 | `stacked`               |
| --------- | -------------------------------------------- | --------------- | -------------------------- | ----------------------- |
| `bar`     | `{ [nameKey]: string, [series]: number, … }` | X-axis category | One or more numeric series | optional `true`/`false` |
| `line`    | `{ [nameKey]: string, [series]: number, … }` | X-axis category | One or more numeric series | —                       |
| `area`    | `{ [nameKey]: string, [series]: number, … }` | X-axis category | One or more numeric series | optional `true`/`false` |
| `pie`     | `{ [nameKey]: string, value: number }`       | Slice label     | Always `["value"]`         | —                       |

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
| `markdown` | Write Markdown file; app sanitises with DOMPurify before rendering; emit absolute path via `output` event                 |
| `metric`   | Fixed number result matching Metric Type                                                                                  |
| `chart`    | Recharts-compatible chart delivered inline via `output` event; no file path. Must declare `chartType` in `output_schema`. |

## Output - Metric Type Notes

| Metric Type       | Notes                                            |
| ----------------- | ------------------------------------------------ |
| `value`           | A single numeric value, e.g. "Total Expenditure" |
| `secondary_value` | A single numeric value, e.g. "Total Budget"      |
| `label`           | A descriptive label for the value                |
| `secondary_label` | A descriptive label for the secondary_value      |

### Metric `format` Object

Declare a `format` and optional `secondary_format` object on any `metric` entry in `output_schema` to control how the app renders the value. Omitting `format` renders the raw number.

```json
{ "type": "metric", "label": "Total Cost",  "format": { "type": "currency", "currency": "USD" } }
{ "type": "metric", "label": "Revenue",     "format": { "type": "currency", "currency": "AUD" } }
{ "type": "metric", "label": "Start Date",  "format": { "type": "date",     "style": "medium" } }
{ "type": "metric", "label": "Start Date",  "format": { "type": "date",     "style": "short"  } }
{ "type": "metric", "label": "Growth",      "format": { "type": "percent",  "decimals": 1 } }
{ "type": "metric", "label": "Count",       "format": { "type": "number",   "decimals": 0 } }
{ "type": "metric", "label": "Score",       "format": { "type": "number",   "decimals": 2 } }
```

| `format.type` | Extra fields                               | Example output            |
| ------------- | ------------------------------------------ | ------------------------- |
| `currency`    | `currency` (ISO 4217)                      | `$1,234.56`, `A$99`       |
| `date`        | `style`: `short`\|`medium`\|`long`\|`full` | `3/28/26`, `Mar 28, 2026` |
| `percent`     | `decimals` (default `2`)                   | `12.3%`                   |
| `number`      | `decimals` (default `2`)                   | `1,234`, `3.14`           |

- **`currency`** — values are rendered with `Intl.NumberFormat` using `style: 'currency'`. `currency` must be a valid ISO 4217 code (e.g. `"USD"`, `"AUD"`, `"EUR"`).
- **`date`** — values must be a Unix timestamp (ms) or ISO 8601 string. `style` maps to `Intl.DateTimeFormat` `dateStyle`.
- **`percent`** — raw value is multiplied by 100 before display (pass `0.123` → renders `12.3%`).
- **`number`** — plain numeric formatting with fixed decimal places.

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
  color: '#3B82F6',
  category: 'Files',
  requirements: [],
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
  output_schema: [], // ← fill in only the outputs confirmed with the user
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

process.stdout.write(
  JSON.stringify([{ event: 'progress', payload: { total: total, finished: finished } }]) + '\n',
);

for (const item of items) {
  // TODO: process item
  finished++;
  process.stdout.write(
    JSON.stringify([{ event: 'progress', payload: { total: total, finished: finished } }]) + '\n',
  );
}

// ── Write CSV output ──────────────────────────────────────────────────────────
const outPath = path.join(os.tmpdir(), `my-script-${Date.now()}.csv`);
const rows = ['Column A,Column B']; // TODO: fill rows
fs.writeFileSync(outPath, rows.join('\n') + '\n');

process.stdout.write(
  JSON.stringify([{ event: 'output', payload: { path: outPath, type: 'csv_file' } }]) + '\n',
);

// ── Emit bar chart ────────────────────────────────────────────────────────────
process.stdout.write(
  JSON.stringify([
    {
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
    },
  ]) + '\n',
);

// ── Emit pie chart ────────────────────────────────────────────────────────────
process.stdout.write(
  JSON.stringify([
    {
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
    },
  ]) + '\n',
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
    "output_schema": [],  # ← fill in only the outputs confirmed with the user
}

if '--superpowers=describe' in sys.argv:
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

print(json.dumps([{"event": "progress", "payload": {"total": total, "finished": finished}}]), flush=True)

for item in items:
    # TODO: process item
    finished += 1
    print(json.dumps([{"event": "progress", "payload": {"total": total, "finished": finished}}]), flush=True)

# ── Write CSV output ──────────────────────────────────────────────────────────
out_path = os.path.join(tempfile.gettempdir(), f'my-script-{os.getpid()}.csv')
with open(out_path, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(['Column A', 'Column B'])
    # TODO: write rows

print(json.dumps([{"event": "output", "payload": {"path": out_path, "type": "csv_file"}}]), flush=True)

# ── Emit bar chart ────────────────────────────────────────────────────────────
print(json.dumps([{
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
}]), flush=True)

# ── Emit pie chart ────────────────────────────────────────────────────────────
print(json.dumps([{
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
}]), flush=True)

sys.exit(0)
```
