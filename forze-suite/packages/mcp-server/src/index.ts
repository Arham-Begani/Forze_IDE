#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  BrandSchemaInputSchema,
  BrandWriteInputSchema,
  DiffWatcherInputSchema,
  GitLogInputSchema,
  GitStatusInputSchema,
  RlsScanInputSchema,
  SecretScanInputSchema,
  SocialQueueInputSchema,
  WorkspaceFileInputSchema,
  WorkspaceListInputSchema,
  WorkspaceSearchInputSchema,
  WorkspaceWriteInputSchema,
  captureGitDiff,
  captureGitLog,
  captureGitStatus,
  listWorkspace,
  readActiveBuffer,
  readBrandSchema,
  readSocialQueue,
  readWorkspaceFile,
  scanActiveBuffer,
  scanForSecrets,
  scanSupabaseMigrations,
  searchWorkspace,
  writeBrandSchema,
  writeWorkspaceFile,
} from './tools.js';

const WORKSPACE_ROOT = process.env.FORZE_WORKSPACE ?? process.cwd();

const server = new Server(
  {
    name: '@forze/mcp-server',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'forze.brand.read',
      description: 'Read the brand JSON schema for a venture from the local workspace.',
      inputSchema: {
        type: 'object',
        properties: {
          ventureId: { type: 'string', format: 'uuid' },
          rootDir: { type: 'string' },
        },
        required: ['ventureId', 'rootDir'],
      },
    },
    {
      name: 'forze.brand.write',
      description: 'Persist a venture brand schema. The marketing agent uses this to record learnings.',
      inputSchema: {
        type: 'object',
        properties: {
          ventureId: { type: 'string', format: 'uuid' },
          rootDir: { type: 'string' },
          brand: { type: 'object' },
        },
        required: ['ventureId', 'rootDir', 'brand'],
      },
    },
    {
      name: 'forze.git.diff',
      description: 'Capture the current git diff for the active repository.',
      inputSchema: {
        type: 'object',
        properties: {
          rootDir: { type: 'string' },
          staged: { type: 'boolean', default: false },
        },
        required: ['rootDir'],
      },
    },
    {
      name: 'forze.git.status',
      description: 'Capture porcelain git status (branch, ahead/behind, per-file flags).',
      inputSchema: {
        type: 'object',
        properties: { rootDir: { type: 'string' } },
        required: ['rootDir'],
      },
    },
    {
      name: 'forze.git.log',
      description: 'Read the most recent commits as structured entries.',
      inputSchema: {
        type: 'object',
        properties: {
          rootDir: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['rootDir'],
      },
    },
    {
      name: 'forze.workspace.read_file',
      description: 'Read a workspace-relative file. Refuses paths that escape the root.',
      inputSchema: {
        type: 'object',
        properties: {
          rootDir: { type: 'string' },
          filePath: { type: 'string' },
        },
        required: ['rootDir', 'filePath'],
      },
    },
    {
      name: 'forze.workspace.write_file',
      description: 'Write a workspace-relative file. Refuses paths that escape the root.',
      inputSchema: {
        type: 'object',
        properties: {
          rootDir: { type: 'string' },
          filePath: { type: 'string' },
          contents: { type: 'string' },
        },
        required: ['rootDir', 'filePath', 'contents'],
      },
    },
    {
      name: 'forze.workspace.list',
      description: 'List entries inside a workspace-relative directory.',
      inputSchema: {
        type: 'object',
        properties: {
          rootDir: { type: 'string' },
          subPath: { type: 'string' },
        },
        required: ['rootDir'],
      },
    },
    {
      name: 'forze.workspace.search',
      description: 'Search workspace contents. Uses ripgrep when available, otherwise a JS fallback.',
      inputSchema: {
        type: 'object',
        properties: {
          rootDir: { type: 'string' },
          query: { type: 'string' },
          globs: { type: 'array', items: { type: 'string' } },
          maxResults: { type: 'number' },
        },
        required: ['rootDir', 'query'],
      },
    },
    {
      name: 'forze.editor.active_buffer',
      description:
        'Read the active editor buffer that the Forze IDE publishes to ~/.forze/active-buffer.json. Returns null when the IDE is not running or no file is active.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'forze.security.scan_secrets',
      description: 'Scan an explicit file payload for AI-generated secret leaks.',
      inputSchema: {
        type: 'object',
        properties: {
          filePath: { type: 'string' },
          contents: { type: 'string' },
        },
        required: ['filePath', 'contents'],
      },
    },
    {
      name: 'forze.security.scan_buffer',
      description:
        'Scan the active editor buffer for secrets without taking any input — convenient for in-IDE checks.',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'forze.security.scan_rls',
      description: 'Scan Supabase migrations to ensure every table has RLS enabled and a policy.',
      inputSchema: {
        type: 'object',
        properties: {
          migrationsDir: { type: 'string' },
        },
        required: ['migrationsDir'],
      },
    },
    {
      name: 'forze.social.queue',
      description:
        'Read the workspace\'s scheduled posts queue. Phase 6 backs this with SQLite; the contract is stable today.',
      inputSchema: {
        type: 'object',
        properties: { rootDir: { type: 'string' } },
        required: ['rootDir'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const payload = args ?? {};

  try {
    switch (name) {
      case 'forze.brand.read': {
        const input = BrandSchemaInputSchema.parse(payload);
        return jsonResponse(await readBrandSchema(input));
      }
      case 'forze.brand.write': {
        const input = BrandWriteInputSchema.parse(payload);
        return jsonResponse(await writeBrandSchema(input));
      }
      case 'forze.git.diff': {
        const input = DiffWatcherInputSchema.parse(payload);
        return jsonResponse(await captureGitDiff(input));
      }
      case 'forze.git.status': {
        const input = GitStatusInputSchema.parse(payload);
        return jsonResponse(await captureGitStatus(input));
      }
      case 'forze.git.log': {
        const input = GitLogInputSchema.parse(payload);
        return jsonResponse(await captureGitLog(input));
      }
      case 'forze.workspace.read_file': {
        const input = WorkspaceFileInputSchema.parse(payload);
        return jsonResponse(await readWorkspaceFile(input));
      }
      case 'forze.workspace.write_file': {
        const input = WorkspaceWriteInputSchema.parse(payload);
        return jsonResponse(await writeWorkspaceFile(input));
      }
      case 'forze.workspace.list': {
        const input = WorkspaceListInputSchema.parse(payload);
        return jsonResponse(await listWorkspace(input));
      }
      case 'forze.workspace.search': {
        const input = WorkspaceSearchInputSchema.parse(payload);
        return jsonResponse(await searchWorkspace(input));
      }
      case 'forze.editor.active_buffer': {
        return jsonResponse(await readActiveBuffer());
      }
      case 'forze.security.scan_secrets': {
        const input = SecretScanInputSchema.parse(payload);
        const findings = scanForSecrets(input);
        return jsonResponse({ findings, count: findings.length });
      }
      case 'forze.security.scan_buffer': {
        return jsonResponse(await scanActiveBuffer());
      }
      case 'forze.security.scan_rls': {
        const input = RlsScanInputSchema.parse(payload);
        const findings = await scanSupabaseMigrations(input);
        return jsonResponse({ findings, count: findings.length });
      }
      case 'forze.social.queue': {
        const input = SocialQueueInputSchema.parse(payload);
        return jsonResponse(await readSocialQueue(input));
      }
      default:
        return errorResponse(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : String(err));
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: `forze://workspace/${encodeURIComponent(WORKSPACE_ROOT)}`,
      name: 'Active Forze workspace root',
      mimeType: 'text/plain',
    },
    {
      uri: 'forze://workspace/files',
      name: 'Workspace file tree (top-level)',
      mimeType: 'application/json',
    },
    {
      uri: 'forze://workspace/active-buffer',
      name: 'Active editor buffer published by the IDE',
      mimeType: 'application/json',
    },
    {
      uri: 'forze://brand/index',
      name: 'Brand schema index',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'forze://workspace/files') {
    const { entries } = await listWorkspace({ rootDir: WORKSPACE_ROOT, subPath: '' });
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ rootDir: WORKSPACE_ROOT, entries }, null, 2),
        },
      ],
    };
  }

  if (uri === 'forze://workspace/active-buffer') {
    const buffer = await readActiveBuffer();
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify(buffer, null, 2),
        },
      ],
    };
  }

  if (uri === 'forze://brand/index') {
    const brandDir = path.join(WORKSPACE_ROOT, 'brand');
    let entries: string[] = [];
    try {
      entries = await fs.readdir(brandDir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    const ventureIds = entries
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.replace(/\.json$/, ''));
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ ventureIds, brandDir }, null, 2),
        },
      ],
    };
  }

  if (uri.startsWith('forze://workspace/')) {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: WORKSPACE_ROOT,
        },
      ],
    };
  }

  throw new Error(`Unknown resource URI: ${uri}`);
});

function jsonResponse(data: unknown) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResponse(message: string) {
  return {
    isError: true,
    content: [
      {
        type: 'text' as const,
        text: message,
      },
    ],
  };
}

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // eslint-disable-next-line no-console
  console.error(`[forze-mcp] listening on stdio · workspace=${WORKSPACE_ROOT}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[forze-mcp] fatal', err);
  process.exit(1);
});
