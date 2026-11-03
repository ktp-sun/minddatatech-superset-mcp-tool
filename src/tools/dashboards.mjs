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

export function registerDashboardTools(server, superset) {
  registerReadTool(
    server,
    'list_dashboards',
    'Search and list dashboards the configured Superset account can access. Returns owner names and whether the connected user owns each dashboard.',
    pageSchema,
    async ({ page, page_size, search }) => {
      const response = await superset.list('dashboard', page, page_size, 'dashboard_title', search);
      return {
        count: response.count,
        page: response.page,
        page_size: response.page_size,
        dashboards: response.result.map((item) => ({
          id: item.id,
          dashboard_title: item.dashboard_title,
          slug: item.slug,
          url: item.url,
          published: item.published,
          ...ownerSummary(item.owners, superset.currentUserId),
        })),
      };
    },
  );

  registerReadTool(
    server,
    'get_dashboard_info',
    'Get a dashboard summary and the charts and datasets connected to it. Accepts a dashboard ID or slug.',
    z.object({ dashboard_id_or_slug: z.string().min(1).max(255) }),
    async ({ dashboard_id_or_slug }) => {
      const idOrSlug = encodeURIComponent(dashboard_id_or_slug);
      const [detailResponse, chartsResponse, datasetsResponse] = await Promise.all([
        superset.request(`/api/v1/dashboard/${idOrSlug}`),
        superset.request(`/api/v1/dashboard/${idOrSlug}/charts`),
        superset.request(`/api/v1/dashboard/${idOrSlug}/datasets`),
      ]);
      const detail = unwrap(detailResponse) || {};
      const charts = listFields(unwrap(chartsResponse));
      const datasets = listFields(unwrap(datasetsResponse));
      return {
        id: detail.id,
        dashboard_title: detail.dashboard_title,
        slug: detail.slug,
        url: detail.url,
        published: detail.published,
        description: safeString(detail.description),
        ...ownerSummary(detail.owners, superset.currentUserId),
        charts: charts.map((chart) => ({
          id: chart.id,
          slice_name: chart.slice_name,
          url: chart.slice_url,
          viz_type: chart.viz_type,
        })),
        datasets: datasets.map((dataset) => ({
          id: dataset.id,
          name: dataset.name,
          schema: dataset.schema,
          table_name: dataset.table_name,
          datasource_type: dataset.type,
          columns: listFields(dataset.columns).map((column) => ({
            name: column.column_name ?? column.name,
            type: column.type,
            is_temporal: column.is_dttm,
            description: safeString(column.description),
          })),
          metrics: listFields(dataset.metrics).map((metric) => ({
            name: metric.metric_name ?? metric.name,
            label: metric.verbose_name,
          })),
        })),
      };
    },
  );

  registerWriteTool(
    server,
    'create_dashboard',
    'Create a new, unpublished blank dashboard. Call only when the user explicitly asks to create a dashboard. Requires Superset dashboard write permission.',
    z.object({
      dashboard_title: z.string().trim().min(1).max(500),
      description: z.string().max(2_000).optional(),
      slug: z.string().trim().min(1).max(255).optional(),
    }),
    async ({ dashboard_title, description, slug }) => {
      const body = { dashboard_title, published: false };
      if (description !== undefined) body.description = description;
      if (slug !== undefined) body.slug = slug;
      const response = await superset.request('/api/v1/dashboard/', { method: 'POST', body });
      const dashboard = unwrap(response) || {};
      return {
        created: true,
        id: dashboard.id ?? response.id,
        dashboard_title: dashboard.dashboard_title ?? dashboard_title,
        slug: dashboard.slug ?? slug,
        url: dashboard.url,
        published: dashboard.published ?? false,
      };
    },
  );

  registerWriteTool(
    server,
    'update_dashboard',
    'Update dashboard title, description, slug, or publication state. Does not change layout, owners, or access roles. Call only when the user explicitly requests this edit.',
    z.object({
      dashboard_id: z.number().int().positive(),
      dashboard_title: z.string().trim().min(1).max(500).optional(),
      description: z.string().max(2_000).nullable().optional(),
      slug: z.string().trim().min(1).max(255).optional(),
      published: z.boolean().optional(),
    }).refine((input) => input.dashboard_title !== undefined
      || input.description !== undefined
      || input.slug !== undefined
      || input.published !== undefined, {
      message: 'Provide at least one dashboard field to update.',
    }),
    async ({ dashboard_id, dashboard_title, description, slug, published }) => {
      const body = {};
      if (dashboard_title !== undefined) body.dashboard_title = dashboard_title;
      if (description !== undefined) body.description = description;
      if (slug !== undefined) body.slug = slug;
      if (published !== undefined) body.published = published;
      const response = await superset.request(`/api/v1/dashboard/${dashboard_id}`, {
        method: 'PUT',
        body,
      });
      const dashboard = unwrap(response) || {};
      return {
        updated: true,
        id: dashboard.id ?? dashboard_id,
        dashboard_title: dashboard.dashboard_title ?? dashboard_title,
        description: safeString(dashboard.description) ?? description,
        slug: dashboard.slug ?? slug,
        published: dashboard.published ?? published,
      };
    },
  );

  registerWriteTool(
    server,
    'remove_dashboard',
    'Delete a dashboard using Superset permissions. Depending on Superset configuration, deletion may be soft-delete or permanent. Requires explicit confirmation in the tool input.',
    z.object({
      dashboard_id: z.number().int().positive(),
      confirm_delete: z.literal(true),
    }),
    async ({ dashboard_id }) => {
      await superset.request(`/api/v1/dashboard/${dashboard_id}`, { method: 'DELETE' });
      return { deleted: true, dashboard_id };
    },
    { destructive: true },
  );
}
