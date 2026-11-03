import { pageSchema, registerReadTool } from '../utils.mjs';

export function registerDatabaseTools(server, superset) {
  registerReadTool(
    server,
    'list_databases',
    'Search and list database names and engine types visible to the configured account. Connection strings and credentials are never returned.',
    pageSchema,
    async ({ page, page_size, search }) => {
      const response = await superset.list('database', page, page_size, 'database_name', search);
      return {
        count: response.count,
        page: response.page,
        page_size: response.page_size,
        databases: response.result.map((item) => ({
          id: item.id,
          database_name: item.database_name,
          backend: item.backend,
        })),
      };
    },
  );
}
