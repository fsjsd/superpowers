'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const descriptor = {
  name: 'Gumroad Product Stats',
  description: 'Downloads all product data from your Gumroad account and shows a revenue chart.',
  category: 'eCommerce',
  requirements: 'Node v18+',
  icon: 'shopping-bag',
  input_schema: [
    {
      name: 'GUMROAD_ACCESS_TOKEN',
      type: 'env_var',
      label: 'Gumroad access token env var name',
      description: 'Name of the environment variable holding your Gumroad API access token',
      required: true,
      default: 'GUMROAD_ACCESS_TOKEN',
    },
    {
      name: 'published_only',
      type: 'boolean',
      label: 'Published only',
      description: 'When true, only include published products. When false, include all products.',
      required: false,
      default: 'true',
    },
  ],
  output_schema: [
    { type: 'csv_file', label: 'Products CSV' },
    { type: 'chart', chartType: 'bar', label: 'Revenue by Product (USD)' },
    { type: 'metric', label: 'Total Products', format: { type: 'number' } },
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

const envVarName = params['GUMROAD_ACCESS_TOKEN'] || 'GUMROAD_ACCESS_TOKEN';
const accessToken = process.env[envVarName];
if (!accessToken) {
  process.stderr.write(`Error: environment variable "${envVarName}" is not set\n`);
  process.exit(1);
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });
    req.on('error', reject);
  });
}

function escapeCsv(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function main() {
  const json = await httpsGet(
    `https://api.gumroad.com/v2/products?access_token=${encodeURIComponent(accessToken)}`,
    { Accept: 'application/json' },
  );

  if (!json.success) {
    process.stderr.write(`Gumroad API error: ${json.message || 'Unknown error'}\n`);
    process.exit(1);
  }

  const publishedOnly = params['published_only'] !== 'false';
  const products = (json.products || []).filter((p) => !publishedOnly || p.published === true);

  // Build CSV
  const csvHeaders = [
    //'id',
    'Product',
    //'price_cents',
    'Currency',
    'Price',
    'Published',
    'Deleted?',
    'Sales',
    'Revenue (USD)',
    'Short URL',
    //'Tags',
    //'Description',
  ];

  const csvRows = [csvHeaders.join(',')];
  for (const p of products) {
    const row = [
      //escapeCsv(p.id),
      escapeCsv(p.name),
      //escapeCsv(p.price),
      escapeCsv(p.currency),
      escapeCsv(p.formatted_price),
      escapeCsv(p.published),
      escapeCsv(p.deleted),
      escapeCsv(p.sales_count),
      escapeCsv(p.sales_usd_cents),
      escapeCsv(p.short_url),
      //escapeCsv(Array.isArray(p.tags) ? p.tags.join(';') : p.tags),
      //escapeCsv(p.description),
    ];
    csvRows.push(row.join(','));
  }

  const csvPath = path.join(os.tmpdir(), `gumroad-products-${Date.now()}.csv`);
  fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');

  // Build chart data — revenue in USD per product
  const chartData = products.map((p) => ({
    name: p.name ? (p.name.length > 24 ? p.name.slice(0, 22) + '…' : p.name) : p.id,
    revenue_usd: p.sales_usd_cents ? parseFloat((Number(p.sales_usd_cents) / 100).toFixed(2)) : 0,
  }));

  // Sort descending by revenue
  chartData.sort((a, b) => b.revenue_usd - a.revenue_usd);

  const totalProducts = products.length;

  process.stdout.write(
    JSON.stringify([
      {
        event: 'output',
        payload: { path: csvPath, type: 'csv_file', label: 'Products CSV' },
      },
      {
        event: 'output',
        payload: {
          type: 'chart',
          chartType: 'bar',
          title: 'Revenue by Product (USD)',
          nameKey: 'name',
          dataKeys: ['revenue_usd'],
          data: chartData,
        },
      },
      {
        event: 'output',
        payload: {
          type: 'metric',
          label: 'Total Products',
          value: totalProducts,
          format: { type: 'number' },
        },
      },
    ]) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
