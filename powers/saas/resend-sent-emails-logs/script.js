'use strict';
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');

const descriptor = {
  name: 'Resend Sent Emails Log',
  description: 'Retrieves a log of the last 30 emails sent from your Resend account.',
  category: 'SaaS',
  color: '#000000',
  requirements: [],
  icon: 'mail',
  input_schema: [
    {
      name: 'RESEND_API_KEY',
      type: 'secret',
      label: 'Resend API Key env var name',
      description: 'Name of the environment variable holding your Resend API key',
      required: true,
      default: 'RESEND_API_KEY',
    },
  ],
  output_schema: [
    { type: 'data_table', label: 'Sent Emails Log' },
    { type: 'metric', label: 'Emails Retrieved' },
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

const envVarName = params['RESEND_API_KEY'] || 'RESEND_API_KEY';
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

function escapeCsv(value) {
  if (value == null) return '';
  const str = Array.isArray(value) ? value.join('; ') : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

async function main() {
  const json = await httpsGet('https://api.resend.com/emails?limit=30', {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  });

  const emails = json.data || [];

  process.stdout.write(
    JSON.stringify([
      { event: 'progress', payload: { total: emails.length, finished: emails.length } },
    ]) + '\n',
  );

  const headers = ['created_at', 'to', 'subject', 'last_event'];
  const csvLines = [headers.join(',')];

  for (const email of emails) {
    csvLines.push(
      [
        escapeCsv(email.created_at),
        escapeCsv(email.to),
        escapeCsv(email.subject),
        escapeCsv(email.last_event),
      ].join(','),
    );
  }

  const outPath = path.join(os.tmpdir(), `resend-emails-${Date.now()}.csv`);
  fs.writeFileSync(outPath, csvLines.join('\n'), 'utf8');

  process.stdout.write(
    JSON.stringify([
      { event: 'output', payload: { type: 'data_table', path: outPath } },
      { event: 'output', payload: { type: 'metric', value: emails.length } },
    ]) + '\n',
  );
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
