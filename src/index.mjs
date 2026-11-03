import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { SupersetClient } from './client.mjs';
import { registerAllTools } from './tools/index.mjs';

const server = new McpServer({ name: 'superset', version: '0.3.0' });
const superset = new SupersetClient();

registerAllTools(server, superset);

void serveStdio(() => server);
console.error('Superset MCP server is running over stdio.');
