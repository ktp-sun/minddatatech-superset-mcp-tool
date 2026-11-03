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

export function registerChartTools(server, superset) {
  registerReadTool(
    server,
    'list_charts',
    'Search and list charts the configured Superset account can access. Returns owner names and whether the connected user owns each chart.',
    pageSchema,
    async ({ page, page_size, search }) => {
      const response = await superset.list('chart', page, page_size, 'slice_name', search);
      return {
        count: response.count,
        page: response.page,
        page_size: response.page_size,
        charts: response.result.map((item) => ({
          id: item.id,
          slice_name: item.slice_name,
          viz_type: item.viz_type,
          url: item.url,
          dashboards: item.dashboards,
          ...ownerSummary(item.owners, superset.currentUserId),
        })),
      };
    },
  );

  registerReadTool(
    server,
    'get_chart_info',
    'Get chart metadata without executing its query. Does not return saved SQL or internal chart configuration.',
    z.object({ chart_id: z.number().int().positive() }),
    async ({ chart_id }) => {
      const response = await superset.request(`/api/v1/chart/${chart_id}`);
      const chart = unwrap(response) || {};
      return {
        id: chart.id,
        slice_name: chart.slice_name,
        description: safeString(chart.description),
        viz_type: chart.viz_type,
        url: chart.url,
        dashboards: chart.dashboards,
        datasource: chart.datasource,
        ...ownerSummary(chart.owners, superset.currentUserId),
      };
    },
  );

  registerReadTool(
    server,
    'get_chart_data',
    'Retrieve the data displayed by a saved chart. This may run a warehouse query under Superset permissions. Returns at most the configured output row limit and omits executed SQL and stack traces.',
    z.object({
      chart_id: z.number().int().positive(),
      filters_dashboard_id: z.number().int().positive().optional(),
      max_rows: z.number().int().min(1).max(1_000).default(100),
    }),
    async ({ chart_id, filters_dashboard_id, max_rows }) => {
      const response = await superset.request(`/api/v1/chart/${chart_id}/data/`, {
        query: { format: 'json', filters_dashboard_id },
      });
      const result = listFields(unwrap(response));
      const cap = Math.min(max_rows, superset.maxOutputRows);
      return {
        status: response?.task_ids?.length ? 'scheduled' : (response?.status ?? 'success'),
        results: result.map((queryResult) => ({
          status: queryResult.status,
          rowcount: queryResult.rowcount,
          columns: queryResult.colnames,
          data: listFields(queryResult.data).slice(0, cap),
          truncated: listFields(queryResult.data).length > cap,
          warning: queryResult.warning ? 'Superset returned a query warning.' : undefined,
          error: queryResult.error ? 'Superset reported a chart query error.' : undefined,
        })),
        scheduled_task_ids: response?.task_ids,
      };
    },
  );

  registerWriteTool(
    server,
    'create_chart',
    'Create a chart from a Superset Explore configuration. Supply datasource ID/type, visualization type, chart params, and optionally query context or dashboard ID. Call only when the user explicitly asks to create a chart.',
    z.object({
      datasource_id: z.number().int().positive(),
      datasource_type: z.enum(['table', 'dataset', 'query', 'saved_query', 'view', 'semantic_view']),
      slice_name: z.string().trim().min(1).max(250),
      viz_type: z.string().trim().min(1).max(250),
      chart_params: z.record(z.string(), z.unknown()),
      query_context: z.record(z.string(), z.unknown()).optional(),
      description: z.string().max(2_000).optional(),
      dashboard_id: z.number().int().positive().optional(),
    }),
    async ({ datasource_id, datasource_type, slice_name, viz_type, chart_params, query_context, description, dashboard_id }) => {
      const body = {
        datasource_id,
        datasource_type,
        slice_name,
        viz_type,
        params: JSON.stringify(chart_params),
      };
      if (query_context !== undefined) body.query_context = JSON.stringify(query_context);
      if (description !== undefined) body.description = description;
      if (dashboard_id !== undefined) body.dashboards = [dashboard_id];
      const response = await superset.request('/api/v1/chart/', { method: 'POST', body });
      const chart = unwrap(response) || {};
      return {
        created: true,
        id: chart.id ?? response.id,
        slice_name: chart.slice_name ?? slice_name,
        viz_type: chart.viz_type ?? viz_type,
        url: chart.url,
        dashboard_id,
      };
    },
  );

  registerWriteTool(
    server,
    'update_chart',
    'Edit a chart title, description, visualization type, Explore params, or query context. Superset validates the resulting chart. Call only when the user explicitly requests this edit.',
    z.object({
      chart_id: z.number().int().positive(),
      slice_name: z.string().trim().min(1).max(250).optional(),
      description: z.string().max(2_000).nullable().optional(),
      viz_type: z.string().trim().min(1).max(250).optional(),
      chart_params: z.record(z.string(), z.unknown()).optional(),
      query_context: z.record(z.string(), z.unknown()).optional(),
    }).refine((input) => input.slice_name !== undefined
      || input.description !== undefined
      || input.viz_type !== undefined
      || input.chart_params !== undefined
      || input.query_context !== undefined, {
      message: 'Provide at least one chart field to update.',
    }),
    async ({ chart_id, slice_name, description, viz_type, chart_params, query_context }) => {
      const body = {};
      if (slice_name !== undefined) body.slice_name = slice_name;
      if (description !== undefined) body.description = description;
      if (viz_type !== undefined) body.viz_type = viz_type;
      if (chart_params !== undefined) body.params = JSON.stringify(chart_params);
      if (query_context !== undefined) body.query_context = JSON.stringify(query_context);
      const response = await superset.request(`/api/v1/chart/${chart_id}`, {
        method: 'PUT',
        body,
      });
      const chart = unwrap(response) || {};
      return {
        updated: true,
        id: chart.id ?? chart_id,
        slice_name: chart.slice_name ?? slice_name,
        description: safeString(chart.description) ?? description,
        viz_type: chart.viz_type ?? viz_type,
      };
    },
  );

  registerWriteTool(
    server,
    'remove_chart',
    'Delete a chart using Superset permissions. Deletion may be soft-delete or permanent, and Superset can reject charts attached to reports. Requires explicit confirmation in the tool input.',
    z.object({
      chart_id: z.number().int().positive(),
      confirm_delete: z.literal(true),
    }),
    async ({ chart_id }) => {
      await superset.request(`/api/v1/chart/${chart_id}`, { method: 'DELETE' });
      return { deleted: true, chart_id };
    },
    { destructive: true },
  );
}
