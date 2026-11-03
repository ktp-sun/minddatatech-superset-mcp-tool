import { registerAuthTools } from './auth.mjs';
import { registerChartTools } from './charts.mjs';
import { registerDashboardTools } from './dashboards.mjs';
import { registerDatabaseTools } from './databases.mjs';
import { registerDatasetTools } from './datasets.mjs';

export function registerAllTools(server, superset) {
  registerAuthTools(server, superset);
  registerDashboardTools(server, superset);
  registerChartTools(server, superset);
  registerDatasetTools(server, superset);
  registerDatabaseTools(server, superset);
}
