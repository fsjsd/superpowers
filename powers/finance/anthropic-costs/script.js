'use strict';
const https = require('https');

const descriptor = {
  name: 'Anthropic Daily Costs',
  description:
    'Retrieves Anthropic API spending on a daily basis for a configurable number of days.',
  category: 'Financial',
  color: '#d97706',
  requirements: [],
  icon: 'bot',
  input_schema: [
    {
      name: 'ANTHROPIC_ADMIN_API_KEY',
      type: 'env_var',
      label: 'Anthropic Admin API key env var name',
      description: `Anthropic Admin API key is required to access cost report endpoints. 

You'll need to create an Organization and Team (free) to create an Admin API key.
      
Create one at https://console.anthropic.com/account/api-keys`,
      required: true,
      default: 'ANTHROPIC_ADMIN_API_KEY',
    },
    {
      name: 'days',
      type: 'number',
      label: 'Number of days',
      description: 'How many past days to retrieve costs for (max 31)',
      required: false,
      default: '7',
    },
  ],
  output_schema: [
    { type: 'metric', label: 'Total Cost', format: { type: 'currency', currency: 'USD' } },
    { type: 'chart', chartType: 'bar', label: 'Daily Costs (USD)' },
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

const envVarName = params['ANTHROPIC_ADMIN_API_KEY'] || 'ANTHROPIC_ADMIN_API_KEY';
const apiKey = process.env[envVarName];
if (!apiKey) {
  process.stderr.write(`Error: environment variable "${envVarName}" is not set\n`);
  process.exit(1);
}

const days = Math.min(Math.max(1, parseInt(params['days'] || '7', 10)), 31);
if (isNaN(days)) {
  process.stderr.write('Error: "days" must be a valid number\n');
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

async function fetchAllPages(baseUrl, headers) {
  const buckets = [];
  let nextPage = null;

  do {
    const url = nextPage ? `${baseUrl}&page=${encodeURIComponent(nextPage)}` : baseUrl;
    const json = await httpsGet(url, headers);
    const page = json.data || [];
    buckets.push(...page);
    nextPage = json.has_more ? json.next_page : null;
  } while (nextPage);

  return buckets;
}

async function main() {
  const now = new Date();
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - days);
  startDate.setUTCHours(0, 0, 0, 0);

  const endDate = new Date(now);
  endDate.setUTCHours(23, 59, 59, 0);

  const startingAt = startDate.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const endingAt = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z');

  const baseUrl =
    `https://api.anthropic.com/v1/organizations/cost_report` +
    `?starting_at=${encodeURIComponent(startingAt)}` +
    `&ending_at=${encodeURIComponent(endingAt)}` +
    `&bucket_width=1d`;

  const headers = {
    'anthropic-version': '2023-06-01',
    'x-api-key': apiKey,
  };

  const buckets = await fetchAllPages(baseUrl, headers);

  // Sort ascending by starting_at
  buckets.sort((a, b) => new Date(a.starting_at).getTime() - new Date(b.starting_at).getTime());

  const data = buckets.map((bucket) => {
    const date = bucket.starting_at.split('T')[0];
    const results = bucket.results || [];
    // amount is in cents — divide by 100 for USD
    const totalUsd = results.reduce((sum, r) => sum + (parseFloat(r.amount || '0') || 0), 0) / 100;
    return { date, cost: parseFloat(totalUsd.toFixed(2)) };
  });

  const totalCost = parseFloat(data.reduce((sum, d) => sum + d.cost, 0).toFixed(2));

  process.stdout.write(
    JSON.stringify([
      {
        event: 'output',
        payload: {
          type: 'metric',
          value: totalCost,
          label: `Total (last ${days} day${days === 1 ? '' : 's'})`,
          secondary_value: days,
          secondary_label: 'Days',
          format: { type: 'currency', currency: 'USD' },
          secondary_format: { type: 'number', decimals: 0 },
        },
      },
      {
        event: 'output',
        payload: {
          type: 'chart',
          chartType: 'bar',
          title: `Anthropic Daily Costs (USD) — last ${days} day${days === 1 ? '' : 's'}`,
          nameKey: 'date',
          dataKeys: ['cost'],
          data,
        },
      },
    ]) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
