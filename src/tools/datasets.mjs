import * as z from 'zod/v4';
import {
  listFields,
  ownerSummary,
  pageSchema,
  registerReadTool,
  registerWriteTool,
  safeString,
  unwrap,
} from '../utils.mjs';

export function registerDatasetTools(server, superset) {
  registerReadTool(
    server,
    'list_datasets',
    'Search and list datasets the configured Superset account can access. Returns owner names and whether the connected user owns each dataset. Dataset SQL and database connection details are omitted.',
    pageSchema,
    async ({ page, page_size, search }) => {
      const response = await superset.list('dataset', page, page_size, 'table_name', search);
      return {
        count: response.count,
        page: response.page,
        page_size: response.page_size,
        datasets: response.result.map((item) => ({
          id: item.id,
          name: item.name,
          schema: item.schema,
          table_name: item.table_name,
          datasource_type: item.datasource_type ?? item.type,
          database: item.database?.database_name ?? item.database_name,
          url: item.url,
          ...ownerSummary(item.owners, superset.currentUserId),
        })),
      };
    },
  );

  registerReadTool(
    server,
    'get_dataset_info',
    'Get dataset columns and metric labels. Omits dataset SQL, expressions, and database connection details.',
    z.object({ dataset_id_or_uuid: z.union([z.number().int().positive(), z.string().min(1).max(255)]) }),
    async ({ dataset_id_or_uuid }) => {
      const id = encodeURIComponent(String(dataset_id_or_uuid));
      const response = await superset.request(`/api/v1/dataset/${id}`);
      const dataset = unwrap(response) || {};
      return {
        id: dataset.id,
        name: dataset.name,
        schema: dataset.schema,
        table_name: dataset.table_name,
        datasource_type: dataset.datasource_type ?? dataset.type,
        database: dataset.database?.database_name ?? dataset.database_name,
        ...ownerSummary(dataset.owners, superset.currentUserId),
        columns: listFields(dataset.columns).map((column) => ({
          name: column.column_name ?? column.name,
          type: column.type,
          is_temporal: column.is_dttm,
          description: safeString(column.description),
        })),
        metrics: listFields(dataset.metrics).map((metric) => ({
          name: metric.metric_name ?? metric.name,
          label: metric.verbose_name,
          type: metric.metric_type,
        })),
      };
    },
  );

  registerWriteTool(
    server,
    'create_dataset',
    'Create a physical dataset pointing to an existing database table. This creates Superset metadata; it does not create the warehouse table.',
    z.object({
      database_id: z.number().int().positive(),
      table_name: z.string().trim().min(1).max(250),
      schema: z.string().trim().max(250).optional(),
      catalog: z.string().trim().max(250).optional(),
      normalize_columns: z.boolean().default(false),
    }),
    async ({ database_id, table_name, schema, catalog, normalize_columns }) => {
      const body = { database: database_id, table_name, normalize_columns };
      if (schema) body.schema = schema;
      if (catalog) body.catalog = catalog;
      const response = await superset.request('/api/v1/dataset/', { method: 'POST', body });
      const dataset = unwrap(response) || {};
      return {
        created: true,
        id: dataset.id ?? response.id,
        name: dataset.name,
        table_name: dataset.table_name ?? table_name,
        schema: dataset.schema ?? schema,
        database_id,
      };
    },
  );

  registerWriteTool(
    server,
    'update_dataset',
    'Update dataset description, cache timeout, main date column, table name, schema, or catalog. Does not change columns, metrics, SQL, or owners.',
    z.object({
      dataset_id: z.number().int().positive(),
      description: z.string().max(2_000).nullable().optional(),
      cache_timeout: z.number().int().min(-1).nullable().optional(),
      main_dttm_col: z.string().max(250).nullable().optional(),
      table_name: z.string().trim().min(1).max(250).optional(),
      schema: z.string().trim().max(250).nullable().optional(),
      catalog: z.string().trim().max(250).nullable().optional(),
    }).refine((input) => Object.keys(input).some((key) => key !== 'dataset_id'), {
      message: 'Provide at least one dataset field to update.',
    }),
    async ({ dataset_id, ...changes }) => {
      const body = {};
      for (const [key, value] of Object.entries(changes)) {
        if (value !== undefined) body[key] = value;
      }
      const response = await superset.request(`/api/v1/dataset/${dataset_id}`, {
        method: 'PUT',
        body,
      });
      const dataset = unwrap(response) || {};
      return {
        updated: true,
        id: dataset.id ?? dataset_id,
        name: dataset.name,
        table_name: dataset.table_name ?? changes.table_name,
        description: safeString(dataset.description) ?? changes.description,
      };
    },
  );

  registerWriteTool(
    server,
    'remove_dataset',
    'Delete a dataset using Superset permissions. This can affect charts that depend on it; deletion may be soft-delete or permanent. Requires explicit confirmation in the tool input.',
    z.object({
      dataset_id: z.number().int().positive(),
      confirm_delete: z.literal(true),
    }),
    async ({ dataset_id }) => {
      await superset.request(`/api/v1/dataset/${dataset_id}`, { method: 'DELETE' });
      return { deleted: true, dataset_id };
    },
    { destructive: true },
  );
}
