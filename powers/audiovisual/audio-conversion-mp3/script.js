'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const AUDIO_EXTENSIONS = new Set([
  '.wav',
  '.flac',
  '.aac',
  '.m4a',
  '.ogg',
  '.opus',
  '.wma',
  '.aiff',
  '.aif',
  '.mp3',
  '.webm',
  '.ape',
  '.alac',
  '.caf',
]);

const descriptor = {
  name: 'Audio to MP3 Converter',
  description:
    'Batch convert audio files to MP3 using FFmpeg with configurable bitrate, mode and encoding settings.',
  category: 'Media',
  color: '#f97316',
  requirements: [
    { name: 'FFmpeg', mac_cmd: 'brew install ffmpeg', win_cmd: 'winget install ffmpeg' },
  ],
  author: 'superpowers',
  icon: 'music',
  input_schema: [
    {
      name: 'input-folder',
      type: 'folderpath',
      label: 'Input Folder',
      description: 'Folder containing audio files to convert',
      required: true,
      default: '',
    },
    {
      name: 'output-folder',
      type: 'folderpath',
      label: 'Output Folder',
      description:
        'Where to save the converted MP3 files (leave empty to save alongside originals)',
      required: false,
      default: '',
    },
    {
      name: 'encoding-mode',
      type: 'select',
      label: 'Encoding Mode',
      description:
        'CBR produces a fixed bitrate for predictable file sizes. VBR adjusts bitrate per-frame for better quality-to-size efficiency.',
      required: false,
      default: 'CBR',
      options: ['CBR', 'VBR'],
    },
    {
      name: 'bitrate',
      type: 'select',
      label: 'Bitrate (CBR mode)',
      description: 'Target bitrate used in CBR mode. Ignored when VBR is selected.',
      required: false,
      default: '192k',
      options: ['64k', '96k', '128k', '192k', '256k', '320k'],
    },
    {
      name: 'vbr-quality',
      type: 'select',
      label: 'VBR Quality',
      description:
        'Quality level used in VBR mode (0 = highest quality / largest files, 9 = smallest files / lowest quality). V4 is a good general-purpose default. Ignored when CBR is selected.',
      required: false,
      default: '4',
      options: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
    },
    {
      name: 'sample-rate',
      type: 'select',
      label: 'Sample Rate',
      description: 'Output audio sample rate. "original" keeps the source rate unchanged.',
      required: false,
      default: 'original',
      options: ['original', '22050', '44100', '48000'],
    },
    {
      name: 'channels',
      type: 'select',
      label: 'Channels',
      description: 'Output channel layout. "original" preserves the source channel count.',
      required: false,
      default: 'original',
      options: ['original', 'mono', 'stereo'],
    },
  ],
  events: [
    {
      type: 'progress',
      payload_schema: [
        { name: 'total', label: 'Total duration (seconds)', type: 'number' },
        { name: 'finished', label: 'Seconds encoded', type: 'number' },
      ],
    },
  ],
  output_schema: [{ type: 'media', label: 'Converted MP3 File' }],
};

// ── Describe mode ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes('--superpowers=describe')) {
  console.log(JSON.stringify(descriptor));
  process.exit(0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const result = {};
  for (const arg of argv) {
    const match = arg.match(/^--([^=]+)=(.*)$/s);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function emit(events) {
  process.stdout.write(JSON.stringify(events) + '\n');
}

function timeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length !== 3) return 0;
  return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
}

function getAudioDuration(filePath) {
  try {
    const out = execSync(`ffprobe -v quiet -print_format json -show_format "${filePath}"`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const info = JSON.parse(out);
    return parseFloat(info.format.duration) || 0;
  } catch {
    return 0;
  }
}

// ── Parse & validate inputs ───────────────────────────────────────────────────
const params = parseArgs(args);

const inputFolder = params['input-folder'];
if (!inputFolder) {
  process.stderr.write('Error: --input-folder is required\n');
  process.exit(1);
}
if (!fs.existsSync(inputFolder) || !fs.statSync(inputFolder).isDirectory()) {
  process.stderr.write(`Error: input folder not found: ${inputFolder}\n`);
  process.exit(1);
}

const outputFolder = params['output-folder'] || inputFolder;
const encodingMode = params['encoding-mode'] || 'CBR';
const bitrate = params['bitrate'] || '192k';
const vbrQuality = params['vbr-quality'] || '4';
const sampleRate = params['sample-rate'] || 'original';
const channels = params['channels'] || 'original';

const VALID_ENCODING_MODES = new Set(['CBR', 'VBR']);
const VALID_BITRATES = new Set(['64k', '96k', '128k', '192k', '256k', '320k']);
const VALID_VBR_QUALITIES = new Set(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const VALID_SAMPLE_RATES = new Set(['original', '22050', '44100', '48000']);
const VALID_CHANNELS = new Set(['original', 'mono', 'stereo']);

if (!VALID_ENCODING_MODES.has(encodingMode)) {
  process.stderr.write(`Error: invalid encoding mode: ${encodingMode}\n`);
  process.exit(1);
}
if (!VALID_BITRATES.has(bitrate)) {
  process.stderr.write(`Error: invalid bitrate: ${bitrate}\n`);
  process.exit(1);
}
if (!VALID_VBR_QUALITIES.has(vbrQuality)) {
  process.stderr.write(`Error: invalid VBR quality: ${vbrQuality}\n`);
  process.exit(1);
}
if (!VALID_SAMPLE_RATES.has(sampleRate)) {
  process.stderr.write(`Error: invalid sample rate: ${sampleRate}\n`);
  process.exit(1);
}
if (!VALID_CHANNELS.has(channels)) {
  process.stderr.write(`Error: invalid channels: ${channels}\n`);
  process.exit(1);
}

// Create output folder if missing
if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder, { recursive: true });
}

// ── Collect audio files ───────────────────────────────────────────────────────
const audioFiles = fs
  .readdirSync(inputFolder)
  .filter((entry) => {
    const fullPath = path.join(inputFolder, entry);
    return (
      fs.statSync(fullPath).isFile() && AUDIO_EXTENSIONS.has(path.extname(entry).toLowerCase())
    );
  })
  .map((entry) => path.join(inputFolder, entry));

if (audioFiles.length === 0) {
  process.stderr.write('Error: no supported audio files found in input folder\n');
  process.exit(1);
}

// ── Get durations via ffprobe ─────────────────────────────────────────────────
process.stderr.write(`Found ${audioFiles.length} audio file(s). Probing durations…\n`);
const durations = audioFiles.map((f) => getAudioDuration(f));
const totalSeconds = Math.max(1, Math.ceil(durations.reduce((a, b) => a + b, 0)));
let processedSeconds = 0;

emit([{ event: 'progress', payload: { total: totalSeconds, finished: 0 } }]);

// ── Build ffmpeg args ─────────────────────────────────────────────────────────
function buildFfmpegArgs(inputPath, outputPath) {
  const ffArgs = ['-i', inputPath, '-y', '-c:a', 'libmp3lame'];

  if (encodingMode === 'VBR') {
    ffArgs.push('-q:a', vbrQuality);
  } else {
    // CBR
    ffArgs.push('-b:a', bitrate);
  }

  if (sampleRate !== 'original') {
    ffArgs.push('-ar', sampleRate);
  }

  if (channels === 'mono') {
    ffArgs.push('-ac', '1');
  } else if (channels === 'stereo') {
    ffArgs.push('-ac', '2');
  }

  ffArgs.push(outputPath);
  return ffArgs;
}

// ── Convert a single file ─────────────────────────────────────────────────────
function convertFile(inputPath, duration, index) {
  return new Promise((resolve) => {
    const basename = path.basename(inputPath, path.extname(inputPath));
    const isSameFolder = path.resolve(path.dirname(inputPath)) === path.resolve(outputFolder);
    const isMp3Input = path.extname(inputPath).toLowerCase() === '.mp3';
    // Avoid clobbering the source when re-encoding an MP3 in the same folder
    const suffix = isSameFolder && isMp3Input ? '_converted' : '';
    const outputPath = path.join(outputFolder, `${basename}${suffix}.mp3`);
    const label = `[${index + 1}/${audioFiles.length}] ${path.basename(inputPath)}`;

    if (fs.existsSync(outputPath)) {
      process.stderr.write(`Skipping (output exists): ${path.basename(outputPath)}\n`);
      processedSeconds += duration;
      emit([
        {
          event: 'progress',
          payload: {
            total: totalSeconds,
            finished: Math.min(Math.floor(processedSeconds), totalSeconds),
          },
        },
      ]);
      resolve(null);
      return;
    }

    process.stderr.write(`Converting ${label}\n`);

    const ffArgs = buildFfmpegArgs(inputPath, outputPath);
    const proc = spawn('ffmpeg', ffArgs);

    let fileProcessedSeconds = 0;

    proc.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      const match = text.match(/time=(\d{2}:\d{2}:\d{2}[.,]\d+)/);
      if (match) {
        const newFileSecs = timeToSeconds(match[1].replace(',', '.'));
        const delta = Math.max(0, newFileSecs - fileProcessedSeconds);
        fileProcessedSeconds = newFileSecs;
        processedSeconds += delta;
        const finished = Math.min(Math.floor(processedSeconds), totalSeconds);
        emit([{ event: 'progress', payload: { total: totalSeconds, finished } }]);
      }
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        process.stderr.write(`ffmpeg exited with code ${code} for: ${path.basename(inputPath)}\n`);
        processedSeconds = durations.slice(0, index + 1).reduce((a, b) => a + b, 0);
        resolve(null);
        return;
      }

      // Snap to exact end-of-file to prevent accumulated rounding drift
      processedSeconds = durations.slice(0, index + 1).reduce((a, b) => a + b, 0);
      const finished = Math.min(Math.floor(processedSeconds), totalSeconds);
      emit([{ event: 'progress', payload: { total: totalSeconds, finished } }]);
      emit([{ event: 'output', payload: { path: outputPath, type: 'media' } }]);
      process.stderr.write(`Done ${label} → ${path.basename(outputPath)}\n`);
      resolve(outputPath);
    });

    proc.on('error', (err) => {
      process.stderr.write(`Failed to spawn ffmpeg: ${err.message}\n`);
      process.stderr.write('Make sure ffmpeg is installed: brew install ffmpeg\n');
      resolve(null);
    });
  });
}

// ── Run sequentially ──────────────────────────────────────────────────────────
(async () => {
  for (let i = 0; i < audioFiles.length; i++) {
    await convertFile(audioFiles[i], durations[i], i);
  }
  process.exit(0);
})();
