# Refold Unified Admin Panel — Build Instructions

> Optimized for vibe coding in Claude Cowork. Read this fully before starting. Each section is a self-contained prompt block you can hand directly to Claude.

---

## 1. Project Overview

Build a unified admin panel that replaces two separate tools — the existing Cloud Admin Panel and the On-Premise Control Plane — with a single interface. It must support three distinct roles and two customer deployment types.

### Deployment types

| Type | Description |
|---|---|
| Cloud customers | Use Refold's hosted SaaS. No concept of namespaces or clusters. |
| On-premise customers | Self-host Refold. Have one or more namespaces across one or more clusters. Each namespace is an independent Refold installation. |

### User roles

| Role | Who they are | What they can see |
|---|---|---|
| Refold Super Admin | Refold internal team | Everything. Full god view across all customers, all namespaces, all clusters. |
| Cloud Customer Admin | Admin user of a Cloud account | Their own organization's metrics only. No namespace concept. |
| On-Premise Customer Admin | Admin user of an on-prem account | All their namespaces across all their clusters, with per-namespace metrics. |

---

## 2. Tech Stack Decision

Before building, decide the stack. Use one of these two options — do not mix.

**Option A — React + TypeScript (recommended for maintainability)**
- React 18 with TypeScript
- Vite as build tool
- React Router v6 for navigation
- TanStack Query for data fetching and caching
- Recharts for charts and graphs
- Tailwind CSS for styling
- shadcn/ui for base components

**Option B — Plain HTML + Vanilla JS (faster to prototype)**
- Single HTML file per major section or a simple multi-page setup
- Chart.js for charts
- CSS custom properties for theming

Pick one at the start. The rest of these instructions are stack-agnostic; adapt as needed.

> **DECIDED (D-001):** Option A. See docs/decisions.md.

---

## 3. Information Architecture

This is the navigation structure. The sidebar and available routes change based on the logged-in user's role.

```
Refold Super Admin view
├── Overview (God View Dashboard)
│   ├── Total customers (cloud + on-prem)
│   ├── Active namespaces
│   ├── System health summary
│   └── Recent alerts across all customers
├── Cloud Customers
│   ├── Customer list
│   └── [Customer] → Customer Detail (same as Cloud Customer Admin view)
├── On-Premise Customers
│   ├── Customer list
│   └── [Customer] → Customer Detail
│       └── [Namespace] → Namespace Detail (same as On-Prem Customer Admin view)
├── Feature Flags (global)
└── System Settings

Cloud Customer Admin view
├── Dashboard (org-level metrics)
├── Tenant Metrics
├── Usage
├── Workflows
│   ├── Workflow list
│   └── [Workflow] → Workflow Detail
├── Connectors
└── Settings

On-Premise Customer Admin view
├── Dashboard (cluster/namespace overview)
├── Namespaces
│   ├── Namespace list
│   └── [Namespace] → Namespace Detail
│       ├── Metrics (same sections as Cloud Customer view but scoped to this namespace)
│       ├── Environment Variables
│       └── Version & Upgrade
└── Settings
```

---

## 4. Data Model (Mock / API Contract)

Use this shape for all mock data and API calls. If connecting to a real backend later, these are the expected response shapes.

### Organization

```typescript
type DeploymentType = 'cloud' | 'on_premise';

interface Organization {
  id: string;
  name: string;
  deploymentType: DeploymentType;
  plan: string;                   // e.g. "Enterprise", "Pro", "Starter"
  createdAt: string;              // ISO date
  status: 'active' | 'suspended' | 'churned';
  aiCreditLimit: number;
  aiCreditUsed: number;
  featureFlags: FeatureFlag[];
}
```

### Namespace (on-premise only)

```typescript
interface Namespace {
  id: string;
  orgId: string;
  name: string;                   // e.g. "production", "staging"
  clusterId: string;
  clusterName: string;            // e.g. "us-east-1", "eu-west-2"
  refoldVersion: string;          // e.g. "3.2.1"
  latestVersion: string;          // for upgrade prompts
  status: 'healthy' | 'degraded' | 'down';
  envVariables: EnvVariable[];
  createdAt: string;
}

interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;              // mask value if true
}
```

### Tenant Metrics

```typescript
interface TenantMetrics {
  orgId: string;
  namespaceId?: string;           // present only for on-premise
  totalTenants: number;
  activeTenants: number;
  newTenantsThisMonth: number;
  tenantGrowthPercent: number;
}
```

### Usage Metrics

```typescript
interface UsageMetrics {
  orgId: string;
  namespaceId?: string;
  period: 'day' | 'week' | 'month';
  apiCallsTotal: number;
  apiCallsTrend: number[];        // last N periods for sparkline
  storageUsedGB: number;
  storageLimit: number;
  activeUsers: number;
}
```

### Workflow Metrics

```typescript
interface WorkflowMetrics {
  orgId: string;
  namespaceId?: string;
  totalWorkflows: number;
  activeWorkflows: number;
  executionsToday: number;
  executionsTrend: number[];
  successRate: number;            // 0–100
  errorRate: number;              // 0–100
  avgExecutionMs: number;
  errorsByType: ErrorBreakdown[];
}

interface ErrorBreakdown {
  type: string;                   // e.g. "Timeout", "Auth failure", "Rate limit"
  count: number;
  percent: number;
}
```

### Connector Metrics

```typescript
interface ConnectorMetrics {
  orgId: string;
  namespaceId?: string;
  connectors: ConnectorStat[];
}

interface ConnectorStat {
  connectorId: string;
  name: string;
  type: string;                   // e.g. "Salesforce", "Slack", "HTTP"
  status: 'active' | 'error' | 'inactive';
  callsToday: number;
  errorRate: number;
  lastActivityAt: string;
}
```

### Feature Flag

```typescript
interface FeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
  scope: 'global' | 'org' | 'namespace';
  description: string;
}
```

---

## 5. Screen-by-Screen Build Prompts

Use each block below as a direct prompt to the build room. They are ordered from foundation to detail. Complete each before moving to the next.

---

### Prompt 5.1 — Project scaffold and layout shell

```
Create the project scaffold for the Refold unified admin panel.

Set up:
- A persistent sidebar on the left (240px wide) with the Refold logo at the top, 
  navigation links in the middle, and a user profile section at the bottom
- A topbar (64px tall) with the current page title and a global search input
- A main content area that fills the remaining space with a max-width of 1400px 
  and 32px padding on all sides
- Routing for these paths (all return placeholder pages for now):
  /overview, /cloud-customers, /onprem-customers, /feature-flags, /settings
- A mock auth context that lets you switch between three roles:
  'super_admin', 'cloud_customer_admin', 'onprem_customer_admin'
- The sidebar nav links should change based on the current role

Color scheme: use a neutral dark sidebar (#0F1117 background, white text) with 
an accent color of #6366F1 (indigo) for active states, selected items, and 
primary buttons. Main content area has a light background (#F8F9FC). Cards are 
white with subtle shadows.

Fonts: Inter or system-ui.
```

---

### Prompt 5.2 — Mock data layer

```
Create a mock data module that returns realistic fake data for all entities in 
the Refold admin panel. The module should export functions:

- getOrganizations(): returns 12 orgs, 7 cloud and 5 on-prem
- getOrganizationById(id): returns one org
- getNamespaces(orgId): returns 2–4 namespaces for on-prem orgs
- getNamespaceById(id): returns one namespace
- getTenantMetrics(orgId, namespaceId?): returns TenantMetrics
- getUsageMetrics(orgId, namespaceId?): returns UsageMetrics with trend arrays 
  of 30 numbers for charts
- getWorkflowMetrics(orgId, namespaceId?): returns WorkflowMetrics including 
  errorsByType with 4–6 error types
- getConnectorMetrics(orgId, namespaceId?): returns ConnectorMetrics with 
  5–8 connectors per org
- getFeatureFlags(orgId?): returns 8 feature flags, some enabled, some not
- getSystemOverview(): returns aggregate counts for the super admin god view

Use realistic company names, version numbers like "3.2.1", "3.3.0", and 
plausible metric numbers (not all round numbers). Include at least one org 
with status 'degraded' or 'down' for visual variety.

All functions should return data synchronously (no async needed for mocks). 
Wrap in a 200ms artificial delay using Promise + setTimeout so loading states 
are visible during development.
```

---

### Prompt 5.3 — Super Admin: God View Dashboard

```
Build the God View Dashboard page at /overview. This is only visible to the 
super_admin role.

The page has:

Top row — 4 stat cards:
- Total organizations (cloud + on-prem combined)
- Active namespaces (on-prem only)
- System-wide error rate (avg across all orgs, shown as a % with a red/green 
  color indicator)
- AI credits consumed today (across all orgs)

Second row — 2 charts side by side:
- Line chart: API calls across all cloud customers over the last 30 days
- Bar chart: Top 8 organizations by workflow execution count this month

Third row — full-width table: "Recent Alerts"
Columns: Organization, Type (Cloud/On-Prem), Severity (badge: critical/warning/info), 
Message, Timestamp
Show 10 rows of mock alert data. Critical rows should have a very subtle red 
left border. 

Fourth row — 2 cards side by side:
- On-Prem health matrix: a grid where each row is an org and each column is one 
  of their namespaces. Each cell is a colored dot (green=healthy, yellow=degraded, 
  red=down). Hovering a dot shows a tooltip with namespace name and version.
- Feature flag overview: list of global flags with their current enabled/disabled 
  state as toggles. Toggling updates local state only (no API call yet).

Use the mock data module from 5.2. Show a skeleton loader while data is loading.
```

---

### Prompt 5.4 — Super Admin: Customer list pages

```
Build two list pages:

1. /cloud-customers — lists all cloud organizations
2. /onprem-customers — lists all on-prem organizations

Each page has:
- A search input that filters the list by organization name
- A status filter dropdown (All / Active / Suspended / Churned)
- A sortable table with these columns:
  Cloud: Name, Plan, Tenants, API Calls (30d), Error Rate, AI Credits Used/Limit, 
         Status, Actions
  On-Prem: Name, Plan, Namespaces, Clusters, Refold Version (latest across namespaces), 
            Status, Actions

Status is shown as a colored badge (green=active, yellow=suspended, red=churned).

The "Actions" column has two icon buttons: View (eye icon, navigates to the 
org detail page) and Feature Flags (flag icon, opens a slide-over panel showing 
that org's feature flags as toggles).

Clicking anywhere on a row (outside the action buttons) navigates to the 
org detail page.

On-prem table: if any namespace in the org is degraded or down, show a small 
warning icon next to the org name.

Both pages show a count of results above the table ("Showing 7 of 7 organizations").
```

---

### Prompt 5.5 — Cloud Customer: Org Detail / Dashboard

```
Build the organization detail page for cloud customers at 
/cloud-customers/:orgId

This page is also the home view for users with the cloud_customer_admin role 
(shown at /dashboard for them).

The page has a page header showing: org name, plan badge, status badge, 
and an "Edit feature flags" button (opens slide-over).

Below the header, show 5 tabs: Overview, Tenants, Usage, Workflows, Connectors.

--- Overview tab ---
4 stat cards: Active Tenants, Executions Today, Success Rate (%), AI Credits 
Used (used/limit as a fraction + progress bar).

2 charts:
- Line chart: Workflow executions over last 30 days
- Donut chart: Error breakdown by type (use errorsByType data)

--- Tenants tab ---
Metric cards: Total Tenants, Active Tenants, New This Month.
A simple bar chart showing tenant growth over 6 months (mock data).

--- Usage tab ---
Metric cards: API Calls (total), Storage Used / Limit (with progress bar), 
Active Users.
Line chart: API call volume over last 30 days.

--- Workflows tab ---
Metric cards: Total Workflows, Active, Executions Today, Avg Execution Time.
Two charts side by side:
- Line chart: execution volume trend
- Horizontal bar chart: error count by error type

A table below: Workflow list (mock 10 rows) with columns Name, Status, 
Last Run, Executions (7d), Success Rate, Avg Duration.

--- Connectors tab ---
A grid of connector cards (3 per row). Each card shows:
- Connector name and type
- Status badge
- Calls today
- Error rate (with red color if > 5%)
- Last activity timestamp
```

---

### Prompt 5.6 — On-Premise: Org Detail and Namespace list

```
Build the on-premise organization detail page at /onprem-customers/:orgId

Page header: org name, plan badge, "X namespaces across Y clusters" summary, 
status badge.

Below header: two sections.

--- Cluster & Namespace Overview ---
Group namespaces by cluster. For each cluster, show:
- Cluster name as a section header
- A table of namespaces in that cluster with columns:
  Namespace name, Status (colored badge), Refold Version, 
  Upgrade available (shows "→ 3.3.0" if latestVersion > refoldVersion, 
  otherwise a green checkmark), Created, Actions

Actions column: View metrics (navigates to namespace detail), 
Edit env vars (opens slide-over), Upgrade (opens confirmation modal).

--- Upgrade modal ---
When clicking Upgrade, show a modal with:
- Current version → New version
- A warning: "This will restart the namespace. Confirm to proceed."
- Cancel and Confirm buttons
Confirming updates the version number in local state.

--- Add namespace button ---
A button "Add namespace" in the page header opens a slide-over with a form:
- Namespace name (text input)
- Cluster (dropdown, populated from existing clusters + "New cluster..." option)
- If "New cluster..." selected, show a text input for new cluster name
- Initial Refold version (text input, pre-filled with latest version)
Submit adds a new namespace to local state.
```

---

### Prompt 5.7 — On-Premise: Namespace Detail

```
Build the namespace detail page at /onprem-customers/:orgId/namespaces/:namespaceId

This page is also the home view for users with the onprem_customer_admin role 
navigating into a namespace.

Page header: namespace name, cluster name, version badge, status badge, 
"Upgrade available" button if applicable.

The page has 6 tabs: Overview, Tenants, Usage, Workflows, Connectors, 
Environment Variables.

Tabs Overview through Connectors: identical in structure to the Cloud Customer 
org detail tabs (Prompt 5.5), but all data is scoped to this specific namespace 
(pass namespaceId to all mock data calls).

--- Environment Variables tab ---
Shows a table of all env variables for this namespace:
Columns: Key, Value (masked with ●●●●●● if isSecret=true, with a show/hide 
toggle button), Secret (lock icon if true), Actions (Edit, Delete)

Above the table: an "Add variable" button that opens an inline form row at the 
top of the table with Key input, Value input, Secret checkbox, Save and Cancel.

Editing a row shows an inline form replacing that row. Changes update local state.

Deleting shows a confirmation: "Delete VARIABLE_NAME? This cannot be undone."

Important: never show secret values in plaintext by default. The show/hide 
toggle reveals the value only when explicitly clicked.
```

---

### Prompt 5.8 — On-Premise Customer Admin: Their own view

```
When logged in as onprem_customer_admin, the sidebar should show:

- Dashboard (shows a summary card for each namespace they own, with status 
  and a "View" button linking to the namespace detail page)
- Namespaces (the namespace list table from their org, same as 5.6 but without 
  the org-level framing — just the cluster/namespace tables)
- Settings (org profile settings, read-only for now)

The topbar should show the organization name instead of "Refold Admin".

No access to any other org's data. If they navigate to a URL for another org's 
data, show a "Access denied" page with a button back to their dashboard.
```

---

### Prompt 5.9 — Feature Flags slide-over panel

```
Build a reusable slide-over panel component for feature flags. It is triggered 
from multiple places:
- The "Edit feature flags" button on org detail pages
- The flag icon in the customer list tables
- The global feature flags page (/feature-flags) for super admin

The panel slides in from the right (400px wide). It shows:
- Header: "Feature Flags — [Org Name]" (or "Global Feature Flags" for super admin)
- A list of all feature flags for this org. Each flag shows:
  - Flag label (bold)
  - Flag description (muted text below)
  - An on/off toggle on the right
  - A scope badge (Global / Org / Namespace)
- A "Save changes" button at the bottom that logs the changes to console 
  (no API call needed yet). It should be disabled if no changes were made.
- Changes are highlighted with a subtle yellow background until saved.

The panel closes by clicking outside it or pressing Escape.
```

---

### Prompt 5.10 — AI Credits panel

```
Add an AI Credits section to each org's Overview tab (both cloud and on-premise 
namespace detail). Place it as a card in the Overview tab.

The card shows:
- Title: "AI Credits"
- A large usage fraction: "42,300 / 100,000 credits used"
- A horizontal progress bar that turns amber when usage > 70% and red when > 90%
- "Resets on [date]" in muted text
- A breakdown table below the bar showing top 5 consumers 
  (mock data: workflow names and their credit consumption as a % of total)
- For super_admin only: an "Edit limit" button that opens an inline input to 
  change the credit limit. Saving updates local state.

The progress bar should animate on first render (fill from 0 to the actual value 
over 600ms).
```

---

### Prompt 5.11 — Global search

```
Implement global search accessible from the topbar search input.

When typing in the search input, show a dropdown below it with results grouped 
by category:
- Organizations (search by name, matches cloud and on-prem)
- Namespaces (search by namespace name or cluster name)
- Connectors (search by connector name within any org)

Show up to 3 results per category. Each result shows:
- An icon indicating type (org, namespace, connector)
- The name
- A breadcrumb: e.g. "Acme Corp → production (us-east-1)" for namespaces

Clicking a result navigates to the relevant detail page.

The search should filter the mock data client-side (no API call needed).
Show "No results" if nothing matches.
Close the dropdown when clicking outside or pressing Escape.
Keyboard navigation: arrow keys move focus through results, Enter navigates.
```

---

### Prompt 5.12 — Polish pass

```
Do a full visual polish pass on the admin panel. Apply these improvements:

1. Empty states: every table and list that could be empty should show a 
   centered illustration (simple SVG icon) and a helpful message. 
   E.g. "No namespaces yet. Add one to get started."

2. Loading skeletons: replace any spinner placeholders with skeleton loaders 
   that match the shape of the actual content (skeleton cards, skeleton table rows).

3. Error states: if a mock data call fails (simulate with a 10% random error rate), 
   show an inline error message with a Retry button.

4. Responsive: the layout should work on screens as narrow as 1024px. 
   The sidebar should collapse to icon-only at 1200px or below, with tooltips 
   on hover showing the label.

5. Consistent spacing: ensure all cards use 24px padding, all section gaps are 
   24px, all table row heights are 52px.

6. Tooltips: add tooltips to all icon-only buttons (the eye, flag, and edit icons 
   in tables).

7. Page titles: update the browser tab title and topbar title to match the 
   current page on every route change.

8. Date formatting: ensure all timestamps are formatted as "12 Jun 2025, 14:30" 
   using a consistent utility function.
```

---

## 6. Component Checklist

These are all the reusable components needed. Build them once and reuse.

| Component | Used in |
|---|---|
| StatCard | All dashboards |
| LineChart | Usage, Workflows |
| BarChart | Workflows error breakdown |
| DonutChart | Error breakdown |
| DataTable | Customer lists, workflow list, connectors |
| StatusBadge | Everywhere |
| ProgressBar | AI credits, storage |
| SlideOver | Feature flags, add namespace, edit env var |
| Modal | Upgrade confirmation, delete confirmation |
| SkeletonLoader | All async sections |
| EmptyState | All tables/lists |
| Tooltip | Icon buttons |
| SearchDropdown | Global search |
| Toggle | Feature flags |

---

## 7. Role-Based Access Reference

Use this as a permissions matrix when implementing route guards and conditional rendering.

| Page / Action | Super Admin | Cloud Customer Admin | On-Prem Customer Admin |
|---|---|---|---|
| God View Dashboard | ✅ | ❌ | ❌ |
| All cloud customer list | ✅ | ❌ | ❌ |
| All on-prem customer list | ✅ | ❌ | ❌ |
| Own org dashboard | ✅ (via list) | ✅ | ✅ |
| Other org's data | ✅ | ❌ | ❌ |
| Namespace list (own org) | ✅ | N/A | ✅ |
| Namespace metrics | ✅ | N/A | ✅ |
| Edit env variables | ✅ | N/A | ✅ |
| Upgrade namespace version | ✅ | N/A | ✅ |
| Add namespace | ✅ | N/A | ✅ |
| Edit feature flags (own org) | ✅ | ✅ | ✅ |
| Edit global feature flags | ✅ | ❌ | ❌ |
| Edit AI credit limits | ✅ | ❌ | ❌ |
| Global system settings | ✅ | ❌ | ❌ |

---

## 8. Suggested Build Order

Follow this sequence to avoid blockers:

1. **Git repo** (Section 10) — do this before writing a single line of code
2. **Scaffold** (5.1) — get the shell running with navigation working
3. **Mock data** (5.2) — unblocks everything else
4. **God View** (5.3) — validates the layout with real content
5. **Customer lists** (5.4) — establishes the table pattern used everywhere
6. **Cloud org detail** (5.5) — establishes the tabs + charts pattern
7. **On-prem org detail** (5.6) — reuses the table pattern, adds namespace actions
8. **Namespace detail** (5.7) — reuses cloud org detail tabs entirely
9. **On-prem customer view** (5.8) — thin layer using already-built pages
10. **Feature flags panel** (5.9) — reusable, used across multiple pages
11. **AI credits** (5.10) — drops into existing overview tabs
12. **Global search** (5.11) — progressive enhancement
13. **Polish** (5.12) — final pass
14. **Deploy** (Section 11) — connect repo to Vercel/Netlify after polish pass

---

## 9. Notes for Build Sessions

> **SUPERSEDED by the repo-bridge workflow.** Sessions no longer start with
> pasted prompt blocks and manual context. Instead, every session follows
> `CLAUDE.md § Session protocol`: reconstruct context from the repo, build the
> one prompt block named in the kickoff prompt, then update PROGRESS.md,
> docs/devlog.md, docs/decisions.md, the Current status block, and push to dev.
> The original notes are kept below for reference only.

- Start each session by pasting the relevant prompt block from Section 5, plus any context about what was already built.
- If a component from a previous session is needed, describe it briefly or paste the component code into the new session.
- Screenshots of the current admin panel and control plane, when shared, should be described to Claude as: "this is the existing UI, match the data structure but build a fresh design."
- When a session produces working code, save it before starting the next session. Claude Cowork does not persist state between sessions automatically.
- If a prompt is too large for one session, split at a natural boundary: e.g. build the tab shell in one session, then fill in each tab in separate sessions.
- After each completed prompt block, commit to Git (see Section 10 for the commit message convention).

---

## 10. Version Control Setup

### 10.1 Repository setup

Create a GitHub repository before writing any code. Use this structure:

```
refold-admin-panel/
├── src/
│   ├── components/       # shared reusable components
│   ├── pages/            # one file per route
│   ├── data/             # mock data module
│   ├── hooks/            # custom React hooks
│   ├── types/            # TypeScript interfaces (from Section 4)
│   └── utils/            # formatDate, formatNumber, etc.
├── public/
├── docs/                 # build-spec.md, devlog.md, decisions.md
├── .env.example          # template for environment variables, never commit .env
├── .gitignore
├── package.json
├── CLAUDE.md
├── PROGRESS.md
├── CHANGELOG.md
└── README.md
```

### 10.2 .gitignore

At minimum, include:

```
node_modules/
dist/
.env
.env.local
.DS_Store
*.log
.vercel/
.netlify/
CLAUDE.local.md
```

### 10.3 Branching strategy

Keep it simple for a solo/small team project:

| Branch | Purpose |
|---|---|
| `main` | Production-ready code. Only merge here when a feature is complete and tested. This is what Vercel/Netlify deploys from. |
| `dev` | Active development. All build session output goes here first. |
| `feature/[name]` | Optional — use for larger discrete features (e.g. `feature/global-search`). Merge into `dev` when done. |

Never commit directly to `main`. Always go through `dev` first.

### 10.4 Commit message convention

Use this format for every commit. It makes the changelog easy to generate later.

```
<type>(<scope>): <short description>

Types:
  feat      — new screen, component, or capability
  fix       — bug fix
  style     — visual/CSS changes only, no logic change
  refactor  — code restructure, no behavior change
  data      — changes to mock data or types
  deploy    — deployment config changes
  docs      — README, CHANGELOG updates
  chore     — dependency updates, tooling

Examples:
  feat(god-view): add namespace health matrix
  feat(onprem): implement env variable edit inline form
  fix(search): close dropdown on outside click
  style(sidebar): collapse to icon-only below 1200px
  data(mock): add degraded namespace to Acme Corp org
  deploy(vercel): add environment variable for API base URL
```

### 10.5 Recommended commit points

Commit at the end of each prompt block in Section 5, plus these natural checkpoints:

```
Initial commit: project scaffold with routing shell
feat(mock-data): add full mock data module
feat(god-view): god view dashboard complete
feat(cloud-customers): customer list page with search and filter
feat(cloud-detail): org detail page with all 5 tabs
feat(onprem-detail): on-prem org detail with namespace list
feat(namespace-detail): namespace detail with env vars tab
feat(feature-flags): reusable slide-over panel
feat(ai-credits): AI credits card with animated progress bar
feat(search): global search with keyboard navigation
style(polish): skeleton loaders, empty states, responsive sidebar
deploy(vercel): initial deployment configuration
```

### 10.6 CHANGELOG.md format

Maintain a `CHANGELOG.md` in the root. Update it when merging `dev` into `main`.

```markdown
# Changelog

All notable changes to the Refold Admin Panel are documented here.
Format: [version] — YYYY-MM-DD

## [Unreleased]
- (list in-progress work here)

## [0.2.0] — 2025-06-15
### Added
- Global search across orgs, namespaces, and connectors
- AI Credits card with animated progress bar and top consumer breakdown
- Feature flags slide-over panel, accessible from org detail and customer list

### Fixed
- Search dropdown not closing on outside click
- Env variable values briefly visible before masking on load

## [0.1.0] — 2025-06-01
### Added
- Initial project scaffold with role-based sidebar navigation
- Mock data module with 12 organizations (7 cloud, 5 on-prem)
- God View dashboard with health matrix and recent alerts
- Cloud customer org detail with 5 tabs
- On-prem namespace detail with environment variables tab
```

### 10.7 Versioning scheme

Use semantic versioning: `MAJOR.MINOR.PATCH`

| Increment | When |
|---|---|
| `PATCH` (0.1.**1**) | Bug fixes, visual tweaks, copy changes |
| `MINOR` (0.**2**.0) | New screen, new component, new feature complete |
| `MAJOR` (**1**.0.0) | First production-ready release handed off from free tier to production hosting |

Start at `0.1.0`. Reach `1.0.0` when the panel is live on production infrastructure and all 12 prompt blocks are complete.

Tag each release in Git:

```bash
git tag -a v0.2.0 -m "Add global search and AI credits panel"
git push origin v0.2.0
```

---

## 11. Deployment (Free Tier)

### 11.1 Recommended platform: Vercel

Vercel is the best match for a Vite + React project. Free tier covers unlimited personal projects with no build minute caps. If you chose Option B (plain HTML), Netlify is equally good.

### 11.2 First deployment (Vercel)

```
Prompt block for the build room — run this after the polish pass (5.12):

Set up Vercel deployment for this project. Do the following:

1. Ensure vite.config.ts has the correct base path set to '/'
2. Add a vercel.json file in the root that configures SPA routing:
   {
     "rewrites": [{ "source": "/(.*)", "destination": "/" }]
   }
   This ensures that direct URL access to /cloud-customers/abc works 
   instead of returning a 404.
3. Confirm the build command is 'npm run build' and output directory is 'dist'
4. Add a README section explaining how to deploy:
   - Push the repo to GitHub
   - Connect the GitHub repo to Vercel at vercel.com/new
   - Set framework preset to Vite
   - No environment variables needed yet (all data is mocked)
   - Deploy from the main branch
```

### 11.3 First deployment (Netlify — alternative)

If using Netlify instead:

```
Prompt block for the build room:

Set up Netlify deployment for this project. Do the following:

1. Add a netlify.toml file in the root:
   [build]
     command = "npm run build"
     publish = "dist"

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200

2. Confirm the build output directory is 'dist'
3. Add deployment instructions to the README:
   - Push repo to GitHub
   - Connect at app.netlify.com/start
   - Build command: npm run build
   - Publish directory: dist
   - No environment variables needed yet
```

### 11.4 Access control on the free tier

The free Vercel/Netlify deployment is publicly accessible by URL. Since this panel will contain real customer data once wired to a backend, add basic protection immediately — even on the free tier:

```
Prompt block for the build room:

Add basic route protection to the admin panel. Since we have no real auth 
backend yet, implement a simple password gate:

1. On app load, check localStorage for a key 'refold_admin_authed'
2. If not present, show a full-screen login page with:
   - Refold logo
   - A single password input (no username)
   - A "Sign in" button
   - On submit, check the password against a hardcoded value 
     (use 'refold-demo-2025' as the placeholder)
   - If correct, set localStorage key and redirect to /overview
   - If wrong, show "Incorrect password" inline error
3. All routes should redirect to /login if the key is absent
4. Add a "Sign out" option to the user profile section in the sidebar 
   that clears the key and redirects to /login

Note: this is a placeholder only. When real authentication is added, 
replace entirely with proper auth (JWT, OAuth, etc.).
```

### 11.5 Environment variables (for when the real backend is wired up)

When the mock data layer is replaced with real API calls, these variables will be needed. Document them now so they're not forgotten:

```
# .env.example — commit this file, never commit .env

# Base URL for the Refold API
VITE_API_BASE_URL=https://api.refold.io

# Used to identify which environment this deployment targets
VITE_ENV=production
```

On Vercel: add these under Project → Settings → Environment Variables.
On Netlify: add under Site configuration → Environment variables.

### 11.6 Custom domain (when upgrading from free tier)

When moving off the free tier, point a subdomain to the deployment:

- Vercel: add `admin.refold.io` under Project → Domains. Update DNS with a CNAME pointing to `cname.vercel-dns.com`.
- Netlify: add under Domain management → Custom domains. Update DNS with a CNAME pointing to your Netlify site URL.

Free tier supports custom domains on both platforms — this can be done before upgrading if needed.