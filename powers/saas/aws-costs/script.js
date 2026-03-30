'use strict';
const https = require('https');
const crypto = require('crypto');

const CE_SERVICE = 'ce';
const CE_HOST = 'ce.us-east-1.amazonaws.com';
const CE_SIGNING_REGION = 'us-east-1';
const CE_TARGET = 'AWSInsightsIndexService.GetCostAndUsage';
const TOP_SERVICES = 10;

const descriptor = {
  name: 'AWS Monthly Costs by Service',
  description:
    'Retrieves a breakdown of monthly AWS costs stacked by service. Requires AWS API credentials with permission to access Cost Explorer. (IAM policy with AWSBillingReadOnlyAccess / ce:GetCostAndUsage permission)',
  category: 'SaaS',
  color: '#f59e0b',
  requirements: [],
  icon: 'cloud',
  input_schema: [
    {
      name: 'AWS_ACCESS_KEY_ID',
      type: 'env_var',
      label: 'AWS Access Key ID env var name',
      description: 'Name of the environment variable holding your AWS Access Key ID.',
      required: true,
      default: 'AWS_ACCESS_KEY_ID',
    },
    {
      name: 'AWS_SECRET_ACCESS_KEY',
      type: 'env_var',
      label: 'AWS Secret Access Key env var name',
      description: 'Name of the environment variable holding your AWS Secret Access Key.',
      required: true,
      default: 'AWS_SECRET_ACCESS_KEY',
    },
    {
      name: 'region',
      type: 'text',
      label: 'AWS Region',
      description:
        'AWS region used to scope cost data (e.g. us-east-1). Note: Cost Explorer is a global service — the endpoint is always us-east-1.',
      required: false,
      default: 'us-east-1',
    },
    {
      name: 'months',
      type: 'number',
      label: 'Months to retrieve',
      description: 'Number of past months to include (1–12).',
      required: false,
      default: '6',
    },
  ],
  output_schema: [
    { type: 'metric', label: 'Total Cost', format: { type: 'currency', currency: 'USD' } },
    { type: 'chart', chartType: 'bar', label: 'Monthly Costs by Service (USD)' },
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

// ── Credentials ───────────────────────────────────────────────────────────────
const accessKeyEnvVar = params['AWS_ACCESS_KEY_ID'] || 'AWS_ACCESS_KEY_ID';
const secretKeyEnvVar = params['AWS_SECRET_ACCESS_KEY'] || 'AWS_SECRET_ACCESS_KEY';

const accessKey = process.env[accessKeyEnvVar];
const secretKey = process.env[secretKeyEnvVar];

if (!accessKey) {
  process.stderr.write(`Error: environment variable "${accessKeyEnvVar}" is not set\n`);
  process.exit(1);
}
if (!secretKey) {
  process.stderr.write(`Error: environment variable "${secretKeyEnvVar}" is not set\n`);
  process.exit(1);
}

const region = (params['region'] || 'us-east-1').trim() || 'us-east-1';

const months = Math.min(12, Math.max(1, parseInt(params['months'] || '6', 10)));
if (isNaN(months)) {
  process.stderr.write('Error: "months" must be a valid number\n');
  process.exit(1);
}

// ── AWS SigV4 signing ─────────────────────────────────────────────────────────
function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getSigningKey(secret, dateStamp, region, service) {
  const kDate = hmac('AWS4' + secret, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function buildSignedHeaders({ host, method, path, body, region, service, target }) {
  const now = new Date();
  // Format: YYYYMMDDTHHMMSSZ
  const amzDate = now
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body);

  const hMap = {
    'content-type': 'application/x-amz-json-1.1',
    host: host,
    'x-amz-date': amzDate,
    'x-amz-target': target,
  };
  const sortedKeys = Object.keys(hMap).sort();
  const canonicalHeaders = sortedKeys.map((k) => `${k}:${hMap[k]}`).join('\n') + '\n';
  const signedHeaders = sortedKeys.join(';');

  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join(
    '\n',
  );

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretKey, dateStamp, region, service);
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const headers = {
    'Content-Type': 'application/x-amz-json-1.1',
    Host: host,
    'X-Amz-Date': amzDate,
    'X-Amz-Target': target,
    Authorization: auth,
    'Content-Length': Buffer.byteLength(body).toString(),
  };
  return headers;
}

// ── HTTPS helper ──────────────────────────────────────────────────────────────
function httpsPost(host, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: host, path, method: 'POST', headers }, (res) => {
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
    req.write(body);
    req.end();
  });
}

// ── Cost Explorer fetch (with pagination) ────────────────────────────────────
async function fetchCostAndUsage(requestBody) {
  const allResults = [];
  let nextPageToken;

  do {
    const body = JSON.stringify(
      nextPageToken
        ? Object.assign({}, requestBody, { NextPageToken: nextPageToken })
        : requestBody,
    );
    const headers = buildSignedHeaders({
      host: CE_HOST,
      method: 'POST',
      path: '/',
      body,
      region: CE_SIGNING_REGION,
      service: CE_SERVICE,
      target: CE_TARGET,
    });
    const response = await httpsPost(CE_HOST, '/', headers, body);
    allResults.push(...(response.ResultsByTime || []));
    nextPageToken = response.NextPageToken || undefined;
  } while (nextPageToken);

  return allResults;
}

// ── Date helpers (UTC-safe) ───────────────────────────────────────────────────
function addMonths(year, month, delta) {
  month += delta;
  while (month < 0) {
    month += 12;
    year--;
  }
  while (month > 11) {
    month -= 12;
    year++;
  }
  return { year, month };
}

function toYMD(year, month) {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function formatMonth(dateStr) {
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const names = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${names[month]} ${year}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const now = new Date();
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth();

  const startPeriod = addMonths(nowYear, nowMonth, -(months - 1));
  const endPeriod = addMonths(nowYear, nowMonth, 1);

  const start = toYMD(startPeriod.year, startPeriod.month);
  const end = toYMD(endPeriod.year, endPeriod.month);

  const requestBody = {
    TimePeriod: { Start: start, End: end },
    Granularity: 'MONTHLY',
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
    Metrics: ['UnblendedCost'],
  };

  const resultsByTime = await fetchCostAndUsage(requestBody);

  // Sum totals per service across all months (exclude zero-cost services)
  const serviceTotals = {};
  for (const period of resultsByTime) {
    for (const group of period.Groups || []) {
      const service = group.Keys[0];
      const amount = parseFloat(group.Metrics.UnblendedCost.Amount || '0');
      serviceTotals[service] = (serviceTotals[service] || 0) + amount;
    }
  }

  const sortedServices = Object.entries(serviceTotals)
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1]);

  const topServices = sortedServices.slice(0, TOP_SERVICES).map(([name]) => name);
  const hasOther = sortedServices.length > TOP_SERVICES;

  // Build chart rows — one per calendar month
  const chartData = resultsByTime.map((period) => {
    const row = { month: formatMonth(period.TimePeriod.Start) };

    const groupMap = {};
    for (const group of period.Groups || []) {
      groupMap[group.Keys[0]] = parseFloat(group.Metrics.UnblendedCost.Amount || '0');
    }

    for (const svc of topServices) {
      row[svc] = parseFloat((groupMap[svc] || 0).toFixed(2));
    }

    if (hasOther) {
      const otherTotal = Object.entries(groupMap)
        .filter(([name]) => !topServices.includes(name))
        .reduce((sum, [, val]) => sum + val, 0);
      row['Other'] = parseFloat(otherTotal.toFixed(2));
    }

    return row;
  });

  const dataKeys = hasOther ? [...topServices, 'Other'] : topServices;
  const totalCost = parseFloat(
    Object.values(serviceTotals)
      .reduce((sum, v) => sum + v, 0)
      .toFixed(2),
  );

  process.stdout.write(
    JSON.stringify([
      {
        event: 'output',
        payload: {
          type: 'metric',
          value: totalCost,
          label: `Total (last ${months} month${months === 1 ? '' : 's'})`,
          format: { type: 'currency', currency: 'USD' },
        },
      },
      {
        event: 'output',
        payload: {
          type: 'chart',
          chartType: 'bar',
          stacked: true,
          title: `Monthly AWS Costs by Service — last ${months} month${months === 1 ? '' : 's'}`,
          nameKey: 'month',
          dataKeys,
          data: chartData,
        },
      },
    ]) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
