'use strict';
const https = require('https');

const descriptor = {
  name: 'YouTube Channel Stats',
  description: 'Retrieves subscriber count, total views, and video count for a YouTube channel.',
  category: 'Social Media',
  requirements: 'Node v18+, YouTube Data API v3 key',
  icon: 'youtube',
  input_schema: [
    {
      name: 'channel_handle',
      type: 'text',
      label: 'Channel Handle',
      description: 'The YouTube channel handle, with or without the @ prefix (e.g. @mkbhd)',
      required: true,
      default: '',
    },
    {
      name: 'YOUTUBE_API_KEY',
      type: 'env_var',
      label: 'YouTube API Key env var name',
      description: `Set Up Google API Access

1. Go to the Google Cloud Console
2. Create a new project (or select an existing one)
3. Enable the YouTube Data API v3
4. Go to Credentials → Create Credentials → API Key
5. Copy your API key`,
      required: true,
      default: 'YOUTUBE_API_KEY',
    },
  ],
  output_schema: [
    { type: 'metric', label: 'Subscribers & Videos', format: { type: 'number', decimals: 0 } },
    { type: 'metric', label: 'Total Views', format: { type: 'number', decimals: 0 } },
    { type: 'chart', chartType: 'bar', label: 'Channel Stats' },
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

let channelHandle = params['channel_handle'];
if (!channelHandle) {
  process.stderr.write('Error: --channel_handle is required\n');
  process.exit(1);
}
// Normalise: ensure the handle starts with @
if (!channelHandle.startsWith('@')) channelHandle = '@' + channelHandle;

const envVarName = params['YOUTUBE_API_KEY'] || 'YOUTUBE_API_KEY';
const apiKey = process.env[envVarName];
if (!apiKey) {
  process.stderr.write(`Error: environment variable "${envVarName}" is not set\n`);
  process.exit(1);
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
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
  // Step 1: resolve handle → channel ID
  process.stdout.write(`Resolving handle ${channelHandle}…\n`);
  const resolveUrl =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=id` +
    `&forHandle=${encodeURIComponent(channelHandle)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const resolveJson = await httpsGet(resolveUrl);
  if (!resolveJson.items || resolveJson.items.length === 0) {
    process.stderr.write(`Error: No channel found for handle "${channelHandle}"\n`);
    process.exit(1);
  }
  const channelId = resolveJson.items[0].id;
  process.stdout.write(`Resolved channel ID: ${channelId}\n`);

  // Step 2: fetch full stats
  const url =
    `https://www.googleapis.com/youtube/v3/channels` +
    `?part=snippet,statistics` +
    `&id=${encodeURIComponent(channelId)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const json = await httpsGet(url);

  if (!json.items || json.items.length === 0) {
    process.stderr.write(`Error: No stats found for channel ID "${channelId}"\n`);
    process.exit(1);
  }

  const channel = json.items[0];
  const { title, description, publishedAt } = channel.snippet;
  const { subscriberCount, viewCount, videoCount, hiddenSubscriberCount } = channel.statistics;

  const subscribers = hiddenSubscriberCount ? null : parseInt(subscriberCount, 10);
  const views = parseInt(viewCount, 10);
  const videos = parseInt(videoCount, 10);

  process.stdout.write(`Channel: ${title}\n`);
  if (description) {
    process.stdout.write(
      `Description: ${description.slice(0, 120)}${description.length > 120 ? '…' : ''}\n`,
    );
  }
  process.stdout.write(`Published: ${publishedAt ? publishedAt.slice(0, 10) : 'N/A'}\n`);

  // Chart — bar chart of key stats
  const chartData = [{ stat: 'Videos', count: videos }];
  if (!hiddenSubscriberCount) {
    chartData.push({ stat: 'Subscribers (K)', count: Math.round(subscribers / 1000) });
    chartData.push({ stat: 'Views (K)', count: Math.round(views / 1000) });
  } else {
    chartData.push({ stat: 'Views (K)', count: Math.round(views / 1000) });
  }

  process.stdout.write(
    JSON.stringify([
      // Metric 1 — subscribers + video count
      {
        event: 'output',
        payload: {
          type: 'metric',
          value: subscribers,
          label: hiddenSubscriberCount ? 'Subscribers (hidden)' : 'Subscribers',
          secondary_value: videos,
          secondary_label: 'Videos',
          format: { type: 'number', decimals: 0 },
        },
      },
      // Metric 2 — total views
      {
        event: 'output',
        payload: {
          type: 'metric',
          value: views,
          label: 'Total Views',
          format: { type: 'number', decimals: 0 },
        },
      },
      {
        event: 'output',
        payload: {
          type: 'chart',
          chartType: 'bar',
          title: `${title} — Channel Stats`,
          nameKey: 'stat',
          dataKeys: ['count'],
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
