'use strict';

const descriptor = {
  name: 'Dummy Chart Data',
  description: 'Returns randomised dummy data for all supported chart types.',
  category: 'Testing',
  requirements: 'Node v18+',
  icon: 'chart-bar',
  input_schema: [
    {
      name: 'data-points',
      type: 'number',
      label: 'Data Points',
      description: 'Number of data points to generate per chart',
      required: false,
      default: '10',
    },
  ],
  output_schema: [
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

function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/s);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

const params = parseArgs(args);
const count = Math.max(1, parseInt(params['data-points'] || '10', 10));

function rand(min, max) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(2));
}

// ── Bar chart ────────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const barData = Array.from({ length: count }, (_, i) => ({
  month:
    MONTHS[i % MONTHS.length] +
    (i >= MONTHS.length ? ` Y${Math.floor(i / MONTHS.length) + 1}` : ''),
  revenue: rand(1000, 9000),
  expenses: rand(500, 6000),
}));

process.stdout.write(
  JSON.stringify([
    {
      event: 'output',
      payload: {
        type: 'chart',
        chartType: 'bar',
        title: 'Revenue vs Expenses (Bar)',
        nameKey: 'month',
        dataKeys: ['revenue', 'expenses'],
        data: barData,
      },
    },
  ]) + '\n',
);

// ── Line chart ───────────────────────────────────────────────────────────────
const lineData = Array.from({ length: count }, (_, i) => ({
  day: `Day ${i + 1}`,
  temperature: rand(-5, 35),
  humidity: rand(20, 95),
}));

process.stdout.write(
  JSON.stringify([
    {
      event: 'output',
      payload: {
        type: 'chart',
        chartType: 'line',
        title: 'Temperature & Humidity (Line)',
        nameKey: 'day',
        dataKeys: ['temperature', 'humidity'],
        data: lineData,
      },
    },
  ]) + '\n',
);

// ── Area chart ───────────────────────────────────────────────────────────────
const areaData = Array.from({ length: count }, (_, i) => ({
  week: `Wk ${i + 1}`,
  downloads: rand(200, 5000),
  uploads: rand(50, 2000),
}));

process.stdout.write(
  JSON.stringify([
    {
      event: 'output',
      payload: {
        type: 'chart',
        chartType: 'area',
        title: 'Downloads & Uploads (Area)',
        nameKey: 'week',
        dataKeys: ['downloads', 'uploads'],
        data: areaData,
      },
    },
  ]) + '\n',
);

// ── Pie chart ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  'Electronics',
  'Clothing',
  'Food',
  'Books',
  'Sports',
  'Toys',
  'Beauty',
  'Automotive',
  'Garden',
  'Music',
];
const pieData = Array.from({ length: count }, (_, i) => ({
  category:
    CATEGORIES[i % CATEGORIES.length] +
    (i >= CATEGORIES.length ? ` ${Math.floor(i / CATEGORIES.length) + 1}` : ''),
  value: rand(50, 500),
}));

process.stdout.write(
  JSON.stringify([
    {
      event: 'output',
      payload: {
        type: 'chart',
        chartType: 'pie',
        title: 'Sales by Category (Pie)',
        nameKey: 'category',
        dataKeys: ['value'],
        data: pieData,
      },
    },
  ]) + '\n',
);
