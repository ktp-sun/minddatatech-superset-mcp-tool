import path from 'node:path';
import * as z from 'zod/v4';
import { getConfigFile, writeConfigFile } from '../config.mjs';
import { registerReadTool, registerWriteTool } from '../utils.mjs';

export function registerAuthTools(server, superset) {
  registerWriteTool(
    server,
    'configure_credentials',
    'Save Superset credentials (username and password) into the local JSON configuration file (env.json) and verify authentication with Superset. Call this tool when credentials are missing or need updating.',
    z.object({
      username: z.string().min(1).describe('The Superset username'),
      password: z.string().min(1).describe('The Superset password'),
      superset_url: z.string().url().optional().describe('Optional Superset URL to save or update (e.g. https://superset.minddatatech.com)'),
    }),
    async ({ username, password, superset_url }) => {
      const payload = {
        SUPERSET_USERNAME: username,
        SUPERSET_PASSWORD: password,
      };
      if (superset_url) {
        payload.SUPERSET_URL = superset_url;
      }
      const savedPath = writeConfigFile(payload);
      superset.loadConfig();
      await superset.login();
      return {
        success: true,
        message: `Credentials saved successfully to ${path.basename(savedPath)} and authenticated with Superset.`,
        url: superset.baseUrl,
        current_user_id: superset.currentUserId,
      };
    },
  );

  registerReadTool(
    server,
    'get_connection_status',
    'Check whether Superset credentials or API token are currently configured and verify connection status.',
    z.object({}),
    async () => {
      superset.loadConfig();
      return {
        url: superset.baseUrl,
        has_credentials: Boolean(superset.username && superset.password),
        username: superset.username || null,
        has_api_token: Boolean(superset.apiToken),
        config_file: path.basename(getConfigFile()),
        is_authenticated: Boolean(superset.accessToken),
        current_user_id: superset.currentUserId,
      };
    },
  );
}
