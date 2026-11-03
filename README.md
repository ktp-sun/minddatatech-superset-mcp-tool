# Superset MCP

MCP server for managing Superset dashboards, charts, and datasets through the Superset REST API. All operations use the connected Superset user's permissions and owner identity.

## Sign-in & Credentials

Credentials can be supplied via environment variables or stored locally in `env.json` (or `config.json`).

If credentials are not yet configured:
1. Any tool call requiring authentication will notify the AI assistant that credentials are missing.
2. The AI assistant can ask the user for their username and password directly in the chat.
3. The AI assistant then calls the `configure_credentials` tool to save them into `env.json` in the project root for future sessions and verifies the login immediately.

An API token may also be supplied through `SUPERSET_API_TOKEN`.

## Requirements

- Node.js 20 or newer
- An account or API token that can read the required Superset assets
- Network access from the MCP host to the Superset URL

## Configure

1. Install dependencies in this folder:

   ```powershell
   npm install
   ```

2. Add the server to an MCP client using a stdio entry. Replace the path with this folder's absolute path:

   ```json
   {
     "mcpServers": {
       "superset": {
         "command": "node",
         "args": ["C:\\path\\to\\superset-mcp\\src\\index.mjs"],
         "env": {
           "SUPERSET_URL": "https://superset.minddatatech.com",
           "SUPERSET_PROVIDER": "db"
         }
       }
     }
   }
   ```

Alternatively, you can provide an `env.json` file in the root directory:

   ```json
   {
     "SUPERSET_URL": "https://superset.minddatatech.com",
     "SUPERSET_USERNAME": "your_username",
     "SUPERSET_PASSWORD": "your_password"
   }
   ```

Optional settings are `SUPERSET_REQUEST_TIMEOUT_MS`, `SUPERSET_MAX_PAGE_SIZE`, and `SUPERSET_MAX_OUTPUT_ROWS`. See `env.example.json`. The MCP process writes only its startup message to stderr; stdout is reserved for the MCP protocol. It does not log tokens, passwords, request bodies, chart SQL, or database connection strings.

## Tools

The server provides 18 tools organized into categories and operation types (Read / Create / Edit / Delete):

### 🔐 Authentication & Status (`auth.mjs`)

| Tool | Type | Description |
| :--- | :--- | :--- |
| `configure_credentials` | **Write** | Save Superset username and password into `env.json` and immediately verify authentication with Superset. |
| `get_connection_status` | **Read** | Check current connection status, Superset base URL, authenticated user ID, and verify if credentials/tokens are loaded. |

### 📊 Dashboards (`dashboards.mjs`)

| Tool | Type | Description |
| :--- | :--- | :--- |
| `list_dashboards` | **Read** | Search and list dashboards with pagination, owner names, and ownership flags (`mine`, `others`, etc.). |
| `get_dashboard_info` | **Read** | Get dashboard details along with all attached charts, datasets, and column lists by ID or slug. |
| `create_dashboard` | **Create** | Create a new, unpublished blank dashboard with title, description, and slug. |
| `update_dashboard` | **Edit** | Update dashboard metadata (title, description, slug, or published state). |
| `remove_dashboard` | **Delete** | Delete a dashboard by ID. Marked destructive; requires `confirm_delete: true`. |

### 📈 Charts & Data Exploration (`charts.mjs`)

| Tool | Type | Description |
| :--- | :--- | :--- |
| `list_charts` | **Read** | Search and list charts accessible to the account, including viz type, dashboards, and ownership. |
| `get_chart_info` | **Read** | Inspect chart metadata, description, viz type, and datasource without executing any queries. |
| `get_chart_data` | **Read** | Execute and retrieve data displayed by a saved chart under the user's permissions, respecting output row limits. |
| `create_chart` | **Create** | Create a chart from Explore configuration (`chart_params`, datasource ID/type, viz type, optional query context). |
| `update_chart` | **Edit** | Edit a chart title, description, visualization type, Explore parameters, or query context. |
| `remove_chart` | **Delete** | Delete a chart by ID. Marked destructive; requires `confirm_delete: true`. |

### 🗄️ Datasets (`datasets.mjs`)

| Tool | Type | Description |
| :--- | :--- | :--- |
| `list_datasets` | **Read** | Search and list datasets, including database name, schema, table name, and owners. |
| `get_dataset_info` | **Read** | Get dataset column definitions, data types, temporal flags, and metric names. |
| `create_dataset` | **Create** | Register an existing physical database table into Superset as a new dataset. |
| `update_dataset` | **Edit** | Update dataset metadata (table name, schema, catalog, description, cache timeout, date column). |
| `remove_dataset` | **Delete** | Delete a dataset by ID. Marked destructive; requires `confirm_delete: true`. |

### 🛢️ Databases (`databases.mjs`)

| Tool | Type | Description |
| :--- | :--- | :--- |
| `list_databases` | **Read** | Search and list registered database connections and engine backends (credentials are never exposed). |

### Operation Guidelines

The `list_dashboards`, `list_charts`, `list_datasets`, and `list_databases` tools accept an optional `search` term and return owner names plus `ownership` / `owned_by_current_user` fields. The current-user comparison uses the authenticated Superset JWT subject and owner IDs.

`create_dashboard` creates an unpublished blank dashboard. `create_dataset` registers an existing physical warehouse table. `create_chart` requires a valid Superset Explore configuration (`chart_params`, and usually `query_context`). Dataset edits are limited to metadata fields; chart edits can also replace visualization params and query context. Delete tools require `confirm_delete: true`, are marked destructive, and use Superset's delete semantics, which may be soft-delete or permanent depending on instance configuration.

`get_chart_data` can execute the saved query for a chart under the connected user's Superset and warehouse permissions. It returns up to the configured output row limit. If Superset schedules an asynchronous query, the tool returns task IDs but does not poll for the results yet.

## Notes for this Superset instance

Search filters returned results for dashboards, charts, and datasets during API inspection. Their owner metadata included IDs and names; the JWT subject matched owner IDs for sampled dashboard/chart records, so the server can label assets as `mine`, `others`, `mine_and_others`, or `unassigned`.

The account could list dashboards, charts, datasets, and databases (12, 9, 26, and 2 respectively). Its security roles/users, RLS, reports, and logs endpoints returned `403`; `/api/v1/me/` and `/api/v1/me/roles/` returned `401`; database and tag metadata endpoints returned `500`. The `/mcp` route was not exposed on the Superset web host. The account's actual write access to dashboards/charts/datasets has not been verified, and no create, update, or delete call has been issued against live Superset data. Superset will enforce its RBAC permissions when a write tool is called.
