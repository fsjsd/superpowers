'use strict';
const https = require('https');
const crypto = require('crypto');

const descriptor = {
  name: 'Google Analytics Pageviews',
  description: 'Retrieves daily pageviews for a GA4 property and displays them as a line chart.',
  category: 'SaaS',
  color: '#E37400',
  requirements: [],
  icon: 'chart-line',
  input_schema: [
    {
      name: 'GOOGLE_SERVICE_ACCOUNT_JSON',
      type: 'secret',
      label: 'Service Account JSON',
      description:
        'Secret containing your Google Service Account JSON (as a string, not a file path). The account must have Google Analytics Data API access.\n\nCreate a service account at https://console.cloud.google.com/iam-admin/serviceaccounts, download the JSON key, and paste its contents into the secret. You will also need to grant the service account access to your GA4 property.\n\nEnable the Google Analytics Data API for your project at https://console.cloud.google.com/apis/library/analyticsdata.googleapis.com.',
      required: true,
      default: 'GOOGLE_SERVICE_ACCOUNT_JSON',
    },
    {
      name: 'property-id',
      type: 'text',
      label: 'GA4 Property ID',
      description:
        'Your Google Analytics 4 property ID (numeric only, e.g. 123456789). Find it under Admin → Property Settings.',
      required: true,
      default: '',
    },
    {
      name: 'time-range',
      type: 'select',
      label: 'Time Range',
      description: 'Date range for pageview data.',
      required: false,
      default: 'last_7_days',
      options: ['last_7_days', 'last_14_days', 'last_28_days', 'last_90_days'],
    },
  ],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total steps', type: 'number' },
        { name: 'finished', label: 'Steps completed', type: 'number' },
      ],
    },
  ],
  output_schema: [
    { type: 'metric', label: 'Total Pageviews', format: { type: 'number', decimals: 0 } },
    { type: 'chart', chartType: 'line', label: 'Daily Pageviews' },
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
const envVarName = params['GOOGLE_SERVICE_ACCOUNT_JSON'] || 'GOOGLE_SERVICE_ACCOUNT_JSON';
const serviceAccountJson = process.env[envVarName];
const propertyId = params['property-id'];
const timeRange = params['time-range'] || 'last_7_days';

process.stderr.write(JSON.stringify(process.env));

if (!serviceAccountJson) {
  process.stderr.write(`Error: environment variable "${envVarName}" is not set\n`);
  process.exit(1);
}
if (!propertyId) {
  process.stderr.write('Error: --property-id is required\n');
  process.exit(1);
}

const timeRangeMap = {
  last_7_days: { startDate: '7daysAgo', endDate: 'today', label: 'Last 7 Days' },
  last_14_days: { startDate: '14daysAgo', endDate: 'today', label: 'Last 14 Days' },
  last_28_days: { startDate: '28daysAgo', endDate: 'today', label: 'Last 28 Days' },
  last_90_days: { startDate: '90daysAgo', endDate: 'today', label: 'Last 90 Days' },
};

if (!timeRangeMap[timeRange]) {
  process.stderr.write(
    `Error: invalid time-range "${timeRange}". Must be one of: ${Object.keys(timeRangeMap).join(', ')}\n`,
  );
  process.exit(1);
}

// ── JWT + OAuth helpers ───────────────────────────────────────────────────────
function base64urlEncode(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function createJWT(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64urlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64urlEncode(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/analytics.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    }),
  );
  const signingInput = `${header}.${payload}`;
  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  const signature = sign
    .sign(serviceAccount.private_key, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${signingInput}.${signature}`;
}

function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    };
    if (body) {
      reqOptions.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const req = https.request(reqOptions, (res) => {
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
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken(serviceAccount) {
  const jwt = createJWT(serviceAccount);
  const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`;
  const response = await httpsRequest(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    },
    body,
  );
  return response.access_token;
}

async function fetchPageviews(accessToken, propId, dateRange) {
  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runReport`;
  const body = JSON.stringify({
    dateRanges: [{ startDate: dateRange.startDate, endDate: dateRange.endDate }],
    metrics: [{ name: 'screenPageViews' }],
    dimensions: [{ name: 'date' }],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
  });
  return httpsRequest(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    },
    body,
  );
}

function formatDate(yyyymmdd) {
  const year = yyyymmdd.slice(0, 4);
  const month = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
  const day = parseInt(yyyymmdd.slice(6, 8), 10);
  const d = new Date(Date.UTC(parseInt(year, 10), month, day));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const emit = (events) => process.stdout.write(JSON.stringify(events) + '\n');

  emit([{ event: 'progress', payload: { total: 3, finished: 0 } }]);

  // Step 1: Parse service account JSON from env var
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(serviceAccountJson);
  } catch (e) {
    process.stderr.write(
      `Error: failed to parse service account JSON from "${envVarName}": ${e.message}\n`,
    );
    process.exit(1);
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    process.stderr.write(
      'Error: service account key file must contain "client_email" and "private_key" fields\n',
    );
    process.exit(1);
  }

  emit([{ event: 'progress', payload: { total: 3, finished: 1 } }]);

  // Step 2: Authenticate
  let accessToken;
  try {
    accessToken = await getAccessToken(serviceAccount);
  } catch (e) {
    process.stderr.write(`Error: failed to obtain access token: ${e.message}\n`);
    process.exit(1);
  }

  emit([{ event: 'progress', payload: { total: 3, finished: 2 } }]);

  // Step 3: Fetch pageview report
  const dateRange = timeRangeMap[timeRange];
  let report;
  try {
    report = await fetchPageviews(accessToken, propertyId, dateRange);
  } catch (e) {
    process.stderr.write(`Error: failed to fetch pageviews: ${e.message}\n`);
    process.exit(1);
  }

  emit([{ event: 'progress', payload: { total: 3, finished: 3 } }]);

  // Process rows
  const rows = (report.rows || []).map((row) => ({
    date: formatDate(row.dimensionValues[0].value),
    pageviews: parseInt(row.metricValues[0].value, 10),
  }));

  const totalPageviews = rows.reduce((sum, r) => sum + r.pageviews, 0);

  emit([
    {
      event: 'output',
      payload: {
        type: 'metric',
        value: totalPageviews,
        label: `Total Pageviews (${dateRange.label})`,
        format: { type: 'number', decimals: 0 },
      },
    },
    {
      event: 'output',
      payload: {
        type: 'chart',
        chartType: 'line',
        title: `Daily Pageviews — ${dateRange.label}`,
        nameKey: 'date',
        dataKeys: ['pageviews'],
        data: rows,
      },
    },
  ]);
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
