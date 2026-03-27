'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const descriptor = {
  name: 'Dummy Markdown Output',
  description: 'Returns dummy markdown content to test the markdown output schema type.',
  category: 'Testing',
  requirements: 'Node v18+',
  icon: 'file-text',
  input_schema: [],
  events: [],
  output_schema: [{ type: 'markdown', label: 'Dummy Markdown Report' }],
};

const args = process.argv.slice(2);
if (args.includes('--superpowers=describe')) {
  console.log(JSON.stringify(descriptor));
  process.exit(0);
}

// ── Generate dummy markdown content ──────────────────────────────────────────
const markdownContent = `# Dummy Markdown Report

## Overview

This is a **dummy markdown** document generated to test the \`markdown\` output schema type in Super Powers.

## Features

- Supports **bold** and _italic_ text
- Ordered and unordered lists
- Code blocks
- Tables
- Blockquotes

## Sample Code

\`\`\`js
function greet(name) {
  return \`Hello, \${name}!\`;
}

console.log(greet('World'));
\`\`\`

## Data Table

| Name    | Value | Status  |
|---------|-------|---------|
| Alpha   | 42    | Active  |
| Beta    | 17    | Pending |
| Gamma   | 99    | Active  |
| Delta   | 0     | Inactive|

## Blockquote

> "The best way to predict the future is to invent it."
> — Alan Kay

## Nested List

1. First item
   - Sub-item A
   - Sub-item B
2. Second item
   - Sub-item C
3. Third item

## Summary

All content above is **dummy data** for testing purposes only.
`;

// ── Write markdown file ───────────────────────────────────────────────────────
const outPath = path.join(os.tmpdir(), `dummy-markdown-${Date.now()}.md`);
fs.writeFileSync(outPath, markdownContent, 'utf8');

process.stdout.write(
  JSON.stringify([{ event: 'output', payload: { path: outPath, type: 'markdown' } }]) + '\n',
);

process.exit(0);
