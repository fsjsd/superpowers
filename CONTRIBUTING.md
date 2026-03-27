# Contributing to Superpowers

Thanks for contributing! This repo is a collection of offical scripts that run inside the [Super Powers app](https://superpowe.rs).

---

## Contributing scripts to this repo

In the first instance, note most scripts _won't be accepted_ to this repository.

It is intended to contain general, lightweight use cases for users.

Maintainers will also be limited in what they can review - we won't have accounts to test integrations with all 3rd parties, unless you can arrange providing them.

Before trying to contribute a script, please open an issue first and describe what you want to create

---

## What is a Super Power?

A Power is a single `script.js` (or `script.py`) file that follows the **Superpowers Script Protocol** — a simple stdin/stdout contract that lets the app discover, configure, and run your script with a generated UI.

---

## Folder Structure

Place your script in a new folder under the appropriate category:

```
powers/
  <category>/
    <script-name>/
      script.js        ← required
      README.md        ← optional but encouraged
```

**Example:** `powers/utilities/resize-images/script.js`

### Categories

Use an existing category folder where possible:

| Folder         | For scripts that…                           |
| -------------- | ------------------------------------------- |
| `coding/`      | help with software development              |
| `finance/`     | deal with costs, budgets, or financial data |
| `socialmedia/` | interact with social platforms              |
| `utilities/`   | general-purpose file/folder/system tasks    |

If your script doesn't fit any existing category, create a new folder with a short, lowercase, hyphenated name.

---

## The Script Protocol

Your script must implement two modes:

### 1. Describe mode

When called with `--superpowers=describe`, print a single JSON descriptor to stdout and exit 0. **No other output.**

```js
node script.js --superpowers=describe
```

The descriptor shape:

```json
{
  "name": "Human-readable name",
  "description": "One sentence describing what the script does",
  "category": "Utilities",
  "requirements": "Node v18+",
  "author": "Your Name",
  "icon": "lucide-icon-name",
  "input_schema": [
    {
      "name": "param-name",
      "type": "folderpath | filepath | text | boolean | number | select",
      "label": "Human-readable label",
      "description": "Helper text shown under the field",
      "required": true,
      "default": ""
    }
  ],
  "output_schema": [{ "type": "csv_file | media | html", "label": "Output label" }]
}
```

`name` and `description` are required. Everything else is optional but recommended.

### 2. Run mode

Inputs are passed as `--name=value` CLI arguments. Emit structured output as **newline-delimited JSON** on stdout:

```js
// Progress update
console.log(JSON.stringify({ event: 'progress', payload: { total: 100, finished: 42 } }));

// Final output (file path)
console.log(
  JSON.stringify({
    event: 'output',
    payload: { path: '/abs/path/to/output.csv', type: 'csv_file' },
  }),
);
```

Exit `0` on success, non-zero on failure (log errors to stderr).

---

## Security Requirements

- **No hardcoded secrets, API keys, or credentials.** Use `env_var` input type for anything sensitive.
- Do not make network requests to unexpected third-party services without documenting it clearly in the descriptor `description`.

---

## Testing Your Script Locally

```bash
# Verify describe mode works
node powers/<category>/<script-name>/script.js --superpowers=describe

# Verify it outputs valid JSON
node powers/<category>/<script-name>/script.js --superpowers=describe | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); console.log('OK:', d.name);"
```

---

## Submitting a PR

1. Fork the repo and create a branch: `feat/my-script-name`
2. Add your script following the structure above
3. Test describe mode locally
4. Open a PR — the CI will automatically validate your script
5. Fill out the PR checklist

A maintainer will review and merge when ready.
