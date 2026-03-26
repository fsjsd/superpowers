'use strict';
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');

const descriptor = {
  name: 'OpenAI Daily Costs',
  description: 'Retrieves OpenAI spending on a daily basis for the last 7 days.',
  category: 'Financial',
  requirements: 'Node v18+',
  icon: 'dollar-sign',
  input_schema: [
    {
      name: 'OPENAI_ADMIN_API_KEY',
      type: 'env_var',
      label: 'OpenAI API Key env var name',
      description: 'Name of the environment variable holding your OpenAI admin API key',
      required: true,
      default: 'OPENAI_ADMIN_API_KEY',
    },
  ],
  output_schema: [{ type: 'csv_file', label: 'Daily Costs CSV' }],
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

const envVarName = params['OPENAI_ADMIN_API_KEY'] || 'OPENAI_ADMIN_API_KEY';
const apiKey = process.env[envVarName];
if (!apiKey) {
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

async function main() {
  const nowSec = Math.floor(Date.now() / 1000);
  const sevenDaysAgoSec = nowSec - 7 * 24 * 60 * 60;

  const url =
    `https://api.openai.com/v1/organization/costs` +
    `?start_time=${sevenDaysAgoSec}&end_time=${nowSec}&bucket_width=1d`;

  const json = await httpsGet(url, {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  });

  const buckets = json.data || [];

  // Sort ascending by start_time
  buckets.sort((a, b) => a.start_time - b.start_time);

  const rows = ['Date,Cost (USD),Currency'];
  for (const bucket of buckets) {
    const date = new Date(bucket.start_time * 1000).toISOString().split('T')[0];
    const results = bucket.results || [];
    const currency = results[0]?.amount?.currency || 'usd';
    const cost = results.reduce((sum, r) => sum + (Number(r.amount?.value) || 0), 0);
    rows.push(`${date},${cost.toFixed(6)},${currency}`);
  }

  const outPath = path.join(os.tmpdir(), `openai-costs-${Date.now()}.csv`);
  fs.writeFileSync(outPath, rows.join('\n') + '\n');

  process.stdout.write(
    JSON.stringify({ event: 'output', payload: { path: outPath, type: 'csv_file' } }) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
