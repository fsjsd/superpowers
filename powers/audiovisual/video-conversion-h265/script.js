'use strict';
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.wmv',
  '.flv',
  '.m4v',
  '.ts',
  '.mts',
  '.m2ts',
  '.3gp',
  '.hevc',
]);

const descriptor = {
  name: 'Batch H.265 Video Converter',
  description:
    'Batch convert video files to H.265/HEVC using FFmpeg with configurable quality and encoding settings.',
  category: 'Media',
  color: '#ef4444',
  requirements: [
    { name: 'FFmpeg', mac_cmd: 'brew install ffmpeg', win_cmd: 'winget install ffmpeg' },
  ],
  author: 'superpowers',
  icon: 'video',
  input_schema: [
    {
      name: 'input-folder',
      type: 'folderpath',
      label: 'Input Folder',
      description: 'Folder containing video files to convert',
      required: true,
      default: '',
    },
    {
      name: 'output-folder',
      type: 'folderpath',
      label: 'Output Folder',
      description: 'Where to save converted files (leave empty to save alongside originals)',
      required: false,
      default: '',
    },
    {
      name: 'crf',
      type: 'number',
      label: 'Quality (CRF)',
      description:
        'Constant Rate Factor: 0 = lossless, 28 = default, 51 = worst. Lower = better quality & larger file.',
      required: false,
      default: '28',
    },
    {
      name: 'preset',
      type: 'select',
      label: 'Encoding Preset',
      description: 'Slower presets achieve better compression but take longer to encode.',
      required: false,
      default: 'medium',
      options: [
        'ultrafast',
        'superfast',
        'veryfast',
        'faster',
        'fast',
        'medium',
        'slow',
        'slower',
        'veryslow',
      ],
    },
    {
      name: 'tune',
      type: 'select',
      label: 'Tune',
      description: 'Optimise encoding for a specific type of content.',
      required: false,
      default: 'none',
      options: ['none', 'grain', 'animation', 'zerolatency', 'fastdecode'],
    },
    {
      name: 'audio',
      type: 'select',
      label: 'Audio Codec',
      description:
        '"copy" remuxes audio without re-encoding (fast, lossless). "aac" or "mp3" re-encode audio.',
      required: false,
      default: 'copy',
      options: ['copy', 'aac', 'mp3'],
    },
    {
      name: 'audio-bitrate',
      type: 'select',
      label: 'Audio Bitrate',
      description: 'Only applies when audio is re-encoded (not when using "copy").',
      required: false,
      default: '192k',
      options: ['96k', '128k', '192k', '256k', '320k'],
    },
    {
      name: 'container',
      type: 'select',
      label: 'Output Container',
      description: 'MP4 is broadly compatible; MKV supports more codec/subtitle combinations.',
      required: false,
      default: 'mp4',
      options: ['mp4', 'mkv'],
    },
    {
      name: 'hw-accel',
      type: 'select',
      label: 'Hardware Acceleration',
      description:
        '"videotoolbox" uses Apple GPU on macOS (faster, slightly lower quality). "none" uses CPU.',
      required: false,
      default: 'none',
      options: ['none', 'videotoolbox'],
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
  output_schema: [{ type: 'media', label: 'Converted H.265 Video' }],
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

function getVideoDuration(filePath) {
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
const crf = Math.max(0, Math.min(51, parseInt(params['crf'] || '28', 10)));
const preset = params['preset'] || 'medium';
const tune = params['tune'] || 'none';
const audio = params['audio'] || 'copy';
const audioBitrate = params['audio-bitrate'] || '192k';
const container = params['container'] || 'mp4';
const hwAccel = params['hw-accel'] || 'none';

const VALID_PRESETS = new Set([
  'ultrafast',
  'superfast',
  'veryfast',
  'faster',
  'fast',
  'medium',
  'slow',
  'slower',
  'veryslow',
]);
const VALID_TUNES = new Set(['none', 'grain', 'animation', 'zerolatency', 'fastdecode']);
const VALID_AUDIO = new Set(['copy', 'aac', 'mp3']);
const VALID_CONTAINERS = new Set(['mp4', 'mkv']);
const VALID_HW = new Set(['none', 'videotoolbox']);

if (!VALID_PRESETS.has(preset)) {
  process.stderr.write(`Error: invalid preset: ${preset}\n`);
  process.exit(1);
}
if (!VALID_TUNES.has(tune)) {
  process.stderr.write(`Error: invalid tune: ${tune}\n`);
  process.exit(1);
}
if (!VALID_AUDIO.has(audio)) {
  process.stderr.write(`Error: invalid audio codec: ${audio}\n`);
  process.exit(1);
}
if (!VALID_CONTAINERS.has(container)) {
  process.stderr.write(`Error: invalid container: ${container}\n`);
  process.exit(1);
}
if (!VALID_HW.has(hwAccel)) {
  process.stderr.write(`Error: invalid hw-accel: ${hwAccel}\n`);
  process.exit(1);
}

// Create output folder if missing
if (!fs.existsSync(outputFolder)) {
  fs.mkdirSync(outputFolder, { recursive: true });
}

// ── Collect video files ───────────────────────────────────────────────────────
const videoFiles = fs
  .readdirSync(inputFolder)
  .filter((entry) => {
    const fullPath = path.join(inputFolder, entry);
    return (
      fs.statSync(fullPath).isFile() && VIDEO_EXTENSIONS.has(path.extname(entry).toLowerCase())
    );
  })
  .map((entry) => path.join(inputFolder, entry));

if (videoFiles.length === 0) {
  process.stderr.write('Error: no video files found in input folder\n');
  process.exit(1);
}

// ── Get durations via ffprobe ────────────────────────────────────────────────
process.stderr.write(`Found ${videoFiles.length} video file(s). Probing durations…\n`);
const durations = videoFiles.map((f) => getVideoDuration(f));
const totalSeconds = Math.max(1, Math.ceil(durations.reduce((a, b) => a + b, 0)));
let processedSeconds = 0;

emit([{ event: 'progress', payload: { total: totalSeconds, finished: 0 } }]);

// ── Build ffmpeg args ─────────────────────────────────────────────────────────
function buildFfmpegArgs(inputPath, outputPath) {
  const ffArgs = ['-i', inputPath, '-y'];

  if (hwAccel === 'videotoolbox') {
    ffArgs.push('-c:v', 'hevc_videotoolbox');
    // videotoolbox quality scale: 0 (worst) – 100 (best); map from CRF (0–51)
    const vtQuality = Math.round(100 - (crf / 51) * 100);
    ffArgs.push('-q:v', String(vtQuality));
    ffArgs.push('-allow_sw', '1'); // fall back to software if GPU unavailable
  } else {
    ffArgs.push('-c:v', 'libx265');
    ffArgs.push('-crf', String(crf));
    ffArgs.push('-preset', preset);
    if (tune !== 'none') {
      ffArgs.push('-x265-params', `tune=${tune}`);
    }
  }

  // Audio
  if (audio === 'copy') {
    ffArgs.push('-c:a', 'copy');
  } else {
    ffArgs.push('-c:a', audio);
    ffArgs.push('-b:a', audioBitrate);
  }

  // Tag for broad compatibility (QuickTime / iOS expect hvc1)
  ffArgs.push('-tag:v', 'hvc1');

  ffArgs.push(outputPath);
  return ffArgs;
}

// ── Convert files sequentially ────────────────────────────────────────────────
function convertFile(inputPath, duration, index) {
  return new Promise((resolve) => {
    const ext = `.${container}`;
    const basename = path.basename(inputPath, path.extname(inputPath));
    // Always add _h265 suffix to avoid overwriting originals when using the same folder
    const outputPath = path.join(outputFolder, `${basename}_h265${ext}`);
    const label = `[${index + 1}/${videoFiles.length}] ${path.basename(inputPath)}`;

    if (fs.existsSync(outputPath)) {
      process.stderr.write(`Skipping (output exists): ${outputPath}\n`);
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
      // Parse "time=HH:MM:SS.ss" from ffmpeg progress line
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
        process.stderr.write(`ffmpeg exited with code ${code} for: ${inputPath}\n`);
        // Snap processed seconds to the end of this file for accurate tracking
        processedSeconds = durations.slice(0, index + 1).reduce((a, b) => a + b, 0);
        resolve(null);
        return;
      }

      // Snap to exact end-of-file so accumulated rounding errors don't drift
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

(async () => {
  for (let i = 0; i < videoFiles.length; i++) {
    await convertFile(videoFiles[i], durations[i], i);
  }
  process.exit(0);
})();
