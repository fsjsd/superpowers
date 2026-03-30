'use strict';

const descriptor = {
  name: 'Demo - Metrics',
  description:
    'Emits one metric for every supported format type: currency (USD/AUD/EUR), date (short/medium/long), percent, and number.',
  category: 'Testing',
  color: '#84cc16',
  requirements: [],
  icon: 'gauge',
  input_schema: [],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total metrics', type: 'number' },
        { name: 'finished', label: 'Metrics emitted', type: 'number' },
      ],
    },
  ],
  output_schema: [
    { type: 'metric', label: 'USD Revenue', format: { type: 'currency', currency: 'USD' } },
    { type: 'metric', label: 'AUD Revenue', format: { type: 'currency', currency: 'AUD' } },
    { type: 'metric', label: 'EUR Revenue', format: { type: 'currency', currency: 'EUR' } },
    { type: 'metric', label: 'Start Date (short)', format: { type: 'date', style: 'short' } },
    { type: 'metric', label: 'Start Date (medium)', format: { type: 'date', style: 'medium' } },
    { type: 'metric', label: 'Start Date (long)', format: { type: 'date', style: 'long' } },
    { type: 'metric', label: 'Conversion Rate', format: { type: 'percent', decimals: 1 } },
    { type: 'metric', label: 'Win Rate', format: { type: 'percent', decimals: 2 } },
    { type: 'metric', label: 'Total Users', format: { type: 'number', decimals: 0 } },
    { type: 'metric', label: 'Avg Score', format: { type: 'number', decimals: 2 } },
  ],
};

const args = process.argv.slice(2);
if (args.includes('--superpowers=describe')) {
  console.log(JSON.stringify(descriptor));
  process.exit(0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const total = descriptor.output_schema.length;
let finished = 0;

function emit(events) {
  process.stdout.write(JSON.stringify(events) + '\n');
}

function progress() {
  emit([{ event: 'progress', payload: { total, finished } }]);
}

function metric(payload) {
  finished++;
  emit([{ event: 'output', payload: { type: 'metric', ...payload } }]);
  progress();
}

// ── Initial progress ──────────────────────────────────────────────────────────
progress();

// ── Currency: USD ─────────────────────────────────────────────────────────────
metric({
  label: 'USD Revenue',
  value: 1_234_567.89,
  secondary_value: 987_654.32,
  secondary_label: 'USD Expenses',
  format: { type: 'currency', currency: 'USD' },
});

// ── Currency: AUD ─────────────────────────────────────────────────────────────
metric({
  label: 'AUD Revenue',
  value: 2_500_000,
  secondary_value: 1_800_000,
  secondary_label: 'AUD Budget',
  format: { type: 'currency', currency: 'AUD' },
});

// ── Currency: EUR ─────────────────────────────────────────────────────────────
metric({
  label: 'EUR Revenue',
  value: 845_000.5,
  format: { type: 'currency', currency: 'EUR' },
});

// ── Date: short ───────────────────────────────────────────────────────────────
// Unix ms timestamp — 28 March 2026
metric({
  label: 'Start Date (short)',
  value: new Date('2026-03-28').getTime(),
  secondary_value: new Date('2026-12-31').getTime(),
  secondary_label: 'End Date (short)',
  format: { type: 'date', style: 'short' },
});

// ── Date: medium ──────────────────────────────────────────────────────────────
metric({
  label: 'Start Date (medium)',
  value: new Date('2026-03-28').getTime(),
  secondary_value: new Date('2026-12-31').getTime(),
  secondary_label: 'End Date (medium)',
  format: { type: 'date', style: 'medium' },
});

// ── Date: long ────────────────────────────────────────────────────────────────
metric({
  label: 'Start Date (long)',
  value: new Date('2026-03-28').getTime(),
  secondary_value: new Date('2026-12-31').getTime(),
  secondary_label: 'End Date (long)',
  format: { type: 'date', style: 'long' },
});

// ── Percent: 1 decimal ────────────────────────────────────────────────────────
// Pass raw ratio — renderer multiplies by 100
metric({
  label: 'Conversion Rate',
  value: 0.0423,
  secondary_value: 0.0318,
  secondary_label: 'Last Month',
  format: { type: 'percent', decimals: 1 },
});

// ── Percent: 2 decimals ───────────────────────────────────────────────────────
metric({
  label: 'Win Rate',
  value: 0.6875,
  secondary_value: 0.5,
  secondary_label: 'Industry Avg',
  format: { type: 'percent', decimals: 2 },
});

// ── Number: 0 decimals ────────────────────────────────────────────────────────
metric({
  label: 'Total Users',
  value: 48_291,
  secondary_value: 39_100,
  secondary_label: 'Last Quarter',
  format: { type: 'number', decimals: 0 },
});

// ── Number: 2 decimals ────────────────────────────────────────────────────────
metric({
  label: 'Avg Score',
  value: 8.47,
  secondary_value: 7.92,
  secondary_label: 'Previous Avg',
  format: { type: 'number', decimals: 2 },
});
