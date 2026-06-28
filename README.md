# Galaxy MCP Server

Live MCP server for the Galaxy vault. Lets Claude (mobile/web) and other chat interfaces query your Obsidian vault in real time via GitHub.

---

## Setup — do this once

### Step 1: Create a private GitHub repo for the vault

1. Go to github.com → New repository
2. Name it `galaxy-vault`, set it to **Private**
3. Do NOT initialize with README

### Step 2: Install Obsidian Git and push the vault

1. In Obsidian: Settings → Community Plugins → Browse → search "Obsidian Git" → Install → Enable
2. Open the Obsidian Git settings:
   - Auto pull interval: `5` (minutes)
   - Auto push interval: `5` (minutes)
   - Commit message: `vault: auto-sync {{date}}`
3. Run command palette → "Obsidian Git: Initialize a new repo"
4. Run command palette → "Obsidian Git: Open source control view"
5. Stage all → Commit → set remote to your new private repo URL → Push

After this, every edit to the vault auto-pushes to GitHub within 5 minutes.

### Step 3: Create a GitHub Personal Access Token

1. github.com → Settings → Developer Settings → Personal access tokens → Fine-grained tokens
2. Name: `galaxy-mcp`
3. Repository access: select `galaxy-vault` only
4. Permissions: Contents → Read-only
5. Copy the token

### Step 4: Deploy to Railway

1. Go to railway.app → New Project → Deploy from GitHub repo → select this `galaxy-mcp` repo
2. Add environment variables (Settings → Variables):

```
GITHUB_TOKEN=   (the token from step 3)
GITHUB_OWNER=   (your GitHub username)
GITHUB_REPO=    galaxy-vault
API_KEYS=       (two random keys, comma-separated — run `openssl rand -hex 32` twice)
```

3. Railway will auto-deploy. Copy your public URL (e.g. `https://galaxy-mcp-production.up.railway.app`)

---

## Connecting to Claude.ai (mobile + web)

1. Open claude.ai → Settings → Integrations → Add MCP Server
2. URL: `https://your-railway-url.up.railway.app/mcp`
3. Auth: Bearer token → paste Priya's API key
4. For Vinod: repeat with his API key

---

## Connecting to ChatGPT (Custom GPT)

ChatGPT doesn't speak MCP natively. Add it as a Custom Action:

1. Create a Custom GPT → Configure → Add Action
2. Import schema from: `https://your-railway-url.up.railway.app/openapi.json`
3. Auth: API Key → Bearer → paste API key

(The server serves an OpenAPI schema automatically at `/openapi.json`)

---

## Available tools

| Tool | What it does |
|---|---|
| `get_schedule` | Returns current-week.md + summer schedule |
| `get_context` | Loads context files (family, self, home, arya, raya, courtney) |
| `read_file` | Read any vault file by path |
| `list_files` | List all markdown files |
| `search_vault` | Search across all files for a keyword |
