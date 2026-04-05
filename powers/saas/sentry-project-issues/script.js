'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const descriptor = {
  name: 'Sentry Project Issues',
  description: 'Fetches issues from a Sentry project and returns them as a table.',
  color: '#362d59',
  category: 'SaaS',
  requirements: [],
  icon: 'bug',
  input_schema: [
    {
      name: 'SENTRY_AUTH_TOKEN',
      type: 'secret',
      label: 'Auth Token env var name',
      description: 'Name of the environment variable holding your Sentry Auth Token.',
      required: true,
      default: 'SENTRY_AUTH_TOKEN',
    },
    {
      name: 'organization-slug',
      type: 'text',
      label: 'Organization Slug',
      description: 'Your Sentry organization slug (found in the Sentry URL).',
      required: true,
      default: '',
    },
    {
      name: 'project-slug',
      type: 'text',
      label: 'Project Slug',
      description: 'Your Sentry project slug (found in the Sentry URL).',
      required: true,
      default: '',
    },
    {
      name: 'query',
      type: 'text',
      label: 'Issue Query',
      description: 'Sentry search query to filter issues (e.g. is:unresolved).',
      required: false,
      default: 'is:unresolved',
    },
    {
      name: 'limit',
      type: 'number',
      label: 'Max Issues',
      description: 'Maximum number of issues to fetch (up to 500).',
      required: false,
      default: '100',
    },
  ],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total issues', type: 'number' },
        { name: 'finished', label: 'Issues fetched', type: 'number' },
      ],
    },
  ],
  output_schema: [{ type: 'data_table', label: 'Sentry Issues' }],
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
const tokenEnvVar = params['SENTRY_AUTH_TOKEN'] || 'SENTRY_AUTH_TOKEN';
const authToken = process.env[tokenEnvVar];
if (!authToken) {
  process.stderr.write(`Error: environment variable "${tokenEnvVar}" is not set\n`);
  process.exit(1);
}

const orgSlug = params['organization-slug'];
if (!orgSlug) {
  process.stderr.write('Error: --organization-slug is required\n');
  process.exit(1);
}

const projectSlug = params['project-slug'];
if (!projectSlug) {
  process.stderr.write('Error: --project-slug is required\n');
  process.exit(1);
}

const issueQuery = params['query'] || 'is:unresolved';
const maxIssues = Math.min(parseInt(params['limit'] || '100', 10), 500);

// ── HTTP helper ───────────────────────────────────────────────────────────────
function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          return;
        }
        try {
          resolve({ data: JSON.parse(body), headers: res.headers });
        } catch (e) {
          reject(new Error(`Failed to parse response: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function parseLinkHeader(header) {
  if (!header) return {};
  const links = {};
  for (const part of header.split(',')) {
    const match = part.trim().match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) links[match[2]] = match[1];
  }
  return links;
}

function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// ── Fetch issues ──────────────────────────────────────────────────────────────
async function run() {
  const pageSize = Math.min(maxIssues, 100);
  const baseUrl = `https://sentry.io/api/0/projects/${encodeURIComponent(orgSlug)}/${encodeURIComponent(projectSlug)}/issues/`;
  const firstUrl = `${baseUrl}?query=${encodeURIComponent(issueQuery)}&limit=${pageSize}`;

  const allIssues = [];
  let nextUrl = firstUrl;

  process.stdout.write(
    JSON.stringify([{ event: 'progress', payload: { total: maxIssues, finished: 0 } }]) + '\n',
  );

  while (nextUrl && allIssues.length < maxIssues) {
    const { data, headers } = await httpsGet(nextUrl);
    for (const issue of data) {
      if (allIssues.length >= maxIssues) break;
      allIssues.push(issue);
    }

    process.stdout.write(
      JSON.stringify([
        { event: 'progress', payload: { total: maxIssues, finished: allIssues.length } },
      ]) + '\n',
    );

    const links = parseLinkHeader(headers['link']);
    nextUrl = links['next'] && data.length > 0 ? links['next'] : null;
  }

  // ── Build CSV ─────────────────────────────────────────────────────────────
  const columns = [
    'ID',
    'Short ID',
    'Title',
    'Level',
    'Status',
    'Times Seen',
    'Users Affected',
    'First Seen',
    'Last Seen',
    'Assignee',
    'URL',
  ];
  const rows = [columns.join(',')];

  for (const issue of allIssues) {
    const assignee = issue.assignedTo ? issue.assignedTo.name || issue.assignedTo.email || '' : '';
    const row = [
      issue.id,
      issue.shortId,
      issue.title,
      issue.level,
      issue.status,
      issue.count,
      issue.userCount,
      issue.firstSeen,
      issue.lastSeen,
      assignee,
      issue.permalink,
    ].map(escapeCsvField);
    rows.push(row.join(','));
  }

  const outPath = path.join(os.tmpdir(), `sentry-issues-${Date.now()}.csv`);
  fs.writeFileSync(outPath, rows.join('\n') + '\n');

  process.stdout.write(
    JSON.stringify([{ event: 'output', payload: { path: outPath, type: 'data_table' } }]) + '\n',
  );
}

run().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
