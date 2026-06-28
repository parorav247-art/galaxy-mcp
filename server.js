import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Octokit } from '@octokit/rest';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;
const API_KEYS = process.env.API_KEYS?.split(',').map(k => k.trim()) || [];

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  console.error('Missing required env vars: GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO');
  process.exit(1);
}
if (API_KEYS.length === 0) {
  console.error('Missing required env var: API_KEYS');
  process.exit(1);
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

async function getFileContent(path) {
  const response = await octokit.repos.getContent({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path,
  });
  if (Array.isArray(response.data) || response.data.type !== 'file') {
    throw new Error(`${path} is not a file`);
  }
  return Buffer.from(response.data.content, 'base64').toString('utf-8');
}

async function listAllMarkdownFiles(dir = '') {
  const response = await octokit.repos.getContent({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: dir,
  });
  const items = Array.isArray(response.data) ? response.data : [response.data];
  const files = [];
  for (const item of items) {
    // Skip raw artifact directories — they hold PDFs/spreadsheets, not markdown context
    if (item.type === 'dir' && item.name === 'files') continue;
    if (item.type === 'file' && item.name.endsWith('.md')) {
      files.push(item.path);
    } else if (item.type === 'dir') {
      const subFiles = await listAllMarkdownFiles(item.path);
      files.push(...subFiles);
    }
  }
  return files;
}

function createMCPServer() {
  const server = new Server(
    { name: 'galaxy-vault', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: 'read_file',
        description: 'Read a specific file from the Galaxy vault by path (e.g. "reference/current-week.md", "context/family.md")',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
        }
      },
      {
        name: 'list_files',
        description: 'List all markdown files in the Galaxy vault',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'search_vault',
        description: 'Search all vault files for a keyword or phrase. Returns matching file paths and relevant lines.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string' }
          },
          required: ['query']
        }
      },
      {
        name: 'get_schedule',
        description: 'Get this week\'s schedule. Returns current-week.md plus summer-2026-schedule.md.',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'get_context',
        description: 'Load Galaxy context files. Pass specific names (family, self, home, arya, raya, courtney, finances) or omit for all.',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    ]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === 'read_file') {
        const content = await getFileContent(args.path);
        return { content: [{ type: 'text', text: content }] };
      }

      if (name === 'list_files') {
        const files = await listAllMarkdownFiles();
        return { content: [{ type: 'text', text: files.join('\n') }] };
      }

      if (name === 'search_vault') {
        const files = await listAllMarkdownFiles();
        const results = [];
        await Promise.all(
          files.map(async (filePath) => {
            try {
              const content = await getFileContent(filePath);
              if (content.toLowerCase().includes(args.query.toLowerCase())) {
                const matchingLines = content
                  .split('\n')
                  .filter(l => l.toLowerCase().includes(args.query.toLowerCase()))
                  .slice(0, 4)
                  .join('\n');
                results.push(`### ${filePath}\n${matchingLines}`);
              }
            } catch {
              // skip unreadable files
            }
          })
        );
        return {
          content: [{
            type: 'text',
            text: results.length ? results.join('\n\n') : 'No matches found.'
          }]
        };
      }

      if (name === 'get_schedule') {
        const [currentWeek, summer] = await Promise.all([
          getFileContent('reference/current-week.md').catch(() => '(current-week.md not found)'),
          getFileContent('reference/summer-2026-schedule.md').catch(() => '(summer schedule not found)'),
        ]);
        return {
          content: [{
            type: 'text',
            text: `# Current Week\n\n${currentWeek}\n\n---\n\n# Summer 2026 Schedule\n\n${summer}`
          }]
        };
      }

      if (name === 'get_context') {
        const contextNames = args.files?.length
          ? args.files
          : ['family', 'self', 'home', 'arya', 'raya', 'courtney'];

        const parts = await Promise.all(
          contextNames.map(async (f) => {
            const content = await getFileContent(`context/${f}.md`)
              .catch(() => `(context/${f}.md not found)`);
            return `# ${f}\n\n${content}`;
          })
        );
        return { content: [{ type: 'text', text: parts.join('\n\n---\n\n') }] };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true
      };
    }
  });

  return server;
}

const app = express();
app.use(express.json());

// Auth middleware
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Bearer token' });
  }
  const token = auth.slice(7);
  if (!API_KEYS.includes(token)) {
    return res.status(403).json({ error: 'Invalid API key' });
  }
  next();
});

// Health check + OpenAPI schema — no auth required
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.get('/openapi.json', (req, res) => {
  const base = `${req.protocol}://${req.get('host')}`;
  res.json({
    openapi: '3.1.0',
    info: { title: 'Galaxy Vault API', version: '1.0.0' },
    servers: [{ url: base }],
    paths: {
      '/api/read_file': {
        post: {
          operationId: 'read_file',
          summary: 'Read a vault file by path',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } }
          },
          responses: { '200': { description: 'File contents' } }
        }
      },
      '/api/list_files': {
        post: {
          operationId: 'list_files',
          summary: 'List all markdown files in the vault',
          requestBody: { required: false, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { '200': { description: 'File list' } }
        }
      },
      '/api/search_vault': {
        post: {
          operationId: 'search_vault',
          summary: 'Search vault files for a keyword',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } } }
          },
          responses: { '200': { description: 'Matching files and lines' } }
        }
      },
      '/api/get_schedule': {
        post: {
          operationId: 'get_schedule',
          summary: "Get this week's schedule",
          requestBody: { required: false, content: { 'application/json': { schema: { type: 'object' } } } },
          responses: { '200': { description: 'Current week schedule' } }
        }
      },
      '/api/get_context': {
        post: {
          operationId: 'get_context',
          summary: 'Load Galaxy context files',
          requestBody: {
            required: false,
            content: { 'application/json': { schema: { type: 'object', properties: { files: { type: 'array', items: { type: 'string' } } } } } }
          },
          responses: { '200': { description: 'Context file contents' } }
        }
      }
    },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } }
    },
    security: [{ bearerAuth: [] }]
  });
});

// REST endpoints for ChatGPT Custom Actions (same logic as MCP tools)
async function handleToolCall(name, args) {
  if (name === 'read_file') {
    return await getFileContent(args.path);
  }
  if (name === 'list_files') {
    const files = await listAllMarkdownFiles();
    return files.join('\n');
  }
  if (name === 'search_vault') {
    const files = await listAllMarkdownFiles();
    const results = [];
    await Promise.all(
      files.map(async (filePath) => {
        try {
          const content = await getFileContent(filePath);
          if (content.toLowerCase().includes(args.query.toLowerCase())) {
            const matchingLines = content
              .split('\n')
              .filter(l => l.toLowerCase().includes(args.query.toLowerCase()))
              .slice(0, 4)
              .join('\n');
            results.push(`### ${filePath}\n${matchingLines}`);
          }
        } catch { /* skip */ }
      })
    );
    return results.length ? results.join('\n\n') : 'No matches found.';
  }
  if (name === 'get_schedule') {
    const [currentWeek, summer] = await Promise.all([
      getFileContent('reference/current-week.md').catch(() => '(not found)'),
      getFileContent('reference/summer-2026-schedule.md').catch(() => '(not found)'),
    ]);
    return `# Current Week\n\n${currentWeek}\n\n---\n\n# Summer 2026 Schedule\n\n${summer}`;
  }
  if (name === 'get_context') {
    const contextNames = args.files?.length
      ? args.files
      : ['family', 'self', 'home', 'arya', 'raya', 'courtney'];
    const parts = await Promise.all(
      contextNames.map(async (f) => {
        const content = await getFileContent(`context/${f}.md`).catch(() => `(not found)`);
        return `# ${f}\n\n${content}`;
      })
    );
    return parts.join('\n\n---\n\n');
  }
  throw new Error(`Unknown tool: ${name}`);
}

for (const tool of ['read_file', 'list_files', 'search_vault', 'get_schedule', 'get_context']) {
  app.post(`/api/${tool}`, async (req, res) => {
    try {
      const result = await handleToolCall(tool, req.body || {});
      res.json({ result });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// Stateless MCP endpoint — each request spins up its own server instance
app.post('/mcp', async (req, res) => {
  const server = createMCPServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
  res.on('close', () => server.close());
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Galaxy MCP server running on port ${PORT}`);
});
