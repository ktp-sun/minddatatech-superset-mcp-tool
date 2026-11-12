import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { SupersetClient } from './client.mjs';
import { registerAllTools } from './tools/index.mjs';

const server = new McpServer({ name: 'superset', version: '0.3.0' }, {
  instructions: 'Before using Superset tools, call get_connection_status. If credentials or an API token are missing, ask the user for their Superset URL, username and password, then call configure_credentials to save and verify them. Credentials are saved as plaintext in a local ignored JSON file; disclose this before requesting them. The client may store chat and tool arguments. Never repeat credentials in responses. Alternatively the user can configure credentials locally before connecting. Only act on data as requested by the user.'
});
const superset = new SupersetClient();

registerAllTools(server, superset);

void serveStdio(() => server);
console.error('Superset MCP server is running over stdio.');
