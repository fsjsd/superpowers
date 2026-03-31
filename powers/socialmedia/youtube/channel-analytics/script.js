'use strict';
const https = require('https');

const descriptor = {
  name: 'YouTube Channel Analytics',
  description:
    'Retrieves a daily views line chart for your YouTube channel using the YouTube Analytics API.',
  color: '#dc2626',
  category: 'Social Media',
  requirements: [],
  icon: 'youtube',
  input_schema: [
    {
      name: 'start_date',
      type: 'text',
      label: 'Start Date',
      description: 'Report start date in YYYY-MM-DD format (e.g. 2025-01-01)',
      required: true,
      default: '',
    },
    {
      name: 'end_date',
      type: 'text',
      label: 'End Date',
      description: 'Report end date in YYYY-MM-DD format (e.g. 2025-12-31)',
      required: true,
      default: '',
    },
    {
      name: 'YOUTUBE_ANALYTICS_TOKEN',
      type: 'secret',
      label: 'OAuth Access Token env var name',
      description: `Set Up YouTube Analytics API Access

1. Go to the Google Cloud Console (console.cloud.google.com)
2. Create or select a project, then enable the "YouTube Analytics API"
3. Go to Credentials → Create Credentials → OAuth 2.0 Client ID (Desktop app)
4. Use the OAuth 2.0 Playground (oauth2.googleapis.com/tokeninfo) or your preferred OAuth flow to obtain an access token with the scope:
   https://www.googleapis.com/auth/yt-analytics.readonly
5. Set the token as an environment variable and enter its name here`,
      required: true,
      default: 'YOUTUBE_ANALYTICS_TOKEN',
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
    {
      type: 'chart',
      chartType: 'line',
      label: 'Daily Views',
    },
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
const startDate = params['start_date'];
if (!startDate) {
  process.stderr.write('Error: --start_date is required\n');
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
  process.stderr.write('Error: --start_date must be in YYYY-MM-DD format\n');
  process.exit(1);
}

const endDate = params['end_date'];
if (!endDate) {
  process.stderr.write('Error: --end_date is required\n');
  process.exit(1);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
  process.stderr.write('Error: --end_date must be in YYYY-MM-DD format\n');
  process.exit(1);
}

const envVarName = params['YOUTUBE_ANALYTICS_TOKEN'] || 'YOUTUBE_ANALYTICS_TOKEN';
const accessToken = process.env[envVarName];
if (!accessToken) {
  process.stderr.write(`Error: environment variable "${envVarName}" is not set\n`);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            const msg = (parsed.error && parsed.error.message) || data;
            reject(new Error(`HTTP ${res.statusCode}: ${msg}`));
            return;
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });
    req.on('error', reject);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  process.stdout.write(
    JSON.stringify([{ event: 'progress', payload: { total: 1, finished: 0 } }]) + '\n',
  );

  process.stdout.write('Fetching channel analytics report…\n');

  const query = new URLSearchParams({
    ids: 'channel==MINE',
    startDate: startDate,
    endDate: endDate,
    metrics: 'views',
    dimensions: 'day',
    sort: 'day',
  });

  const url = `https://youtubeanalytics.googleapis.com/v2/reports?${query.toString()}`;

  const json = await httpsGet(url, {
    Authorization: `Bearer ${accessToken}`,
  });

  if (!json.rows || json.rows.length === 0) {
    process.stderr.write('Error: No data returned for the specified date range.\n');
    process.exit(1);
  }

  // rows: [["YYYY-MM-DD", views], ...]
  const chartData = json.rows.map(([date, views]) => ({ date, views }));

  process.stdout.write(
    JSON.stringify([{ event: 'progress', payload: { total: 1, finished: 1 } }]) + '\n',
  );

  process.stdout.write(
    JSON.stringify([
      {
        event: 'output',
        payload: {
          type: 'chart',
          chartType: 'line',
          title: 'Daily Views',
          nameKey: 'date',
          dataKeys: ['views'],
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
