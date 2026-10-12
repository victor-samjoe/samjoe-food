# SamJoE FoodApp — Infrastructure Specification

**Status:** Draft v1.0  
**Purpose:** Technical reference for implementation of **SamJoE FoodApp**, the food-service vertical of **SamJoE Tech & Consulting**, designed as a multi-tenant platform for catalogs, forms, orders, payments, messaging, automation and assisted services.

---

## 0. Product identity and naming directive

**Brand architecture**

- **SamJoE Tech & Consulting** is the parent brand and technology/consulting company.
- **SamJoE FoodApp** is the official name of the product/vertical described in this specification.
- SamJoE FoodApp is focused initially on micro and small food businesses such as confectioneries, bakeries, snack shops, restaurants, delivery operations and similar businesses.
- The FoodApp brand should be used consistently in product UI, technical documentation, repositories, service names, environment names and future customer-facing material unless an explicit white-label rule applies.
- The underlying architecture should remain reusable enough to support future SamJoE verticals without coupling shared infrastructure exclusively to food-domain concepts.

**Recommended technical naming**

```text
samjoe-foodapp              # project/product namespace
foodapp-web                 # customer/admin frontend
foodapp-api                 # core backend API
foodapp-worker              # asynchronous/background workers
foodapp-infra               # deployment/infrastructure definitions
foodapp-jarvis              # Jarvis integration layer/workers, if separated
```

Recommended production hostnames when appropriate:

```text
foodapp.samjoe.com.br
api.foodapp.samjoe.com.br
status.foodapp.samjoe.com.br
```

Internal service names should prefer the `foodapp-` prefix where this improves identification and avoids collisions with other SamJoE products. Shared corporate services such as centralized n8n, monitoring, SES or Jarvis infrastructure may remain under the broader SamJoE namespace.

---

## 1. Product objective

Build **SamJoE FoodApp** as a low-cost, scalable, multi-tenant platform for micro and small food businesses where each customer can:

- publish forms, catalogs and order pages;
- manage products, photos, descriptions, prices and availability;
- receive, approve and track orders;
- connect payment methods;
- send automated WhatsApp and e-mail notifications;
- manage day-to-day operations through an intuitive self-service panel;
- optionally hire SamJoE for assisted management, consulting, sales support, marketing and automation.

The platform must minimize manual operational work for SamJoE. Repetitive operational tasks, monitoring, support triage and routine changes should be delegated to **Jarvis** whenever safe and appropriate. Jarvis remains a SamJoE-wide capability; FoodApp consumes it as an operational layer rather than redefining it as a FoodApp-only component.

---

## 2. Core architectural principles

1. **One multi-tenant platform, not one deployment per customer.**
2. Every business record must be associated with a `tenant_id` or equivalent tenant boundary.
3. Frequently performed actions must be available as self-service.
4. Technical or specialized work can be offered as paid assisted service.
5. Repetitive SamJoE operational work should be automated by Jarvis.
6. External providers must be abstracted behind internal interfaces whenever practical.
7. Production must have external backups, audit logs and basic observability from day one.
8. The architecture must start cheap and simple, but allow services to be separated as volume grows.

---

## 3. Initial infrastructure

### 3.1 VPS

Initial recommended server:

- Linux / Ubuntu LTS
- 4 vCPU
- 8 GB RAM
- 80–160 GB NVMe
- Docker
- Docker Compose

This VPS can initially host the application, API, Redis, PostgreSQL, n8n, Evolution API, monitoring and Jarvis-related workers, provided resource usage is monitored.

As load grows, PostgreSQL, Evolution, workers and Jarvis can be moved to independent services without redesigning the application.

### 3.2 Edge and DNS

Use **Cloudflare** for:

- DNS;
- TLS/SSL;
- reverse proxy/CDN where applicable;
- WAF;
- basic bot protection;
- rate limiting;
- custom domains and subdomains.

Example platform domains:

```text
foodapp.samjoe.com.br
api.foodapp.samjoe.com.br
n8n.samjoe.com.br
evolution.samjoe.com.br
status.foodapp.samjoe.com.br
```

Customer domains may point to the same application:

```text
pedido.cliente.com.br
catalogo.cliente.com.br
app.cliente.com.br
```

---

## 4. Containerized services

Initial Docker Compose stack:

```text
traefik-or-nginx
frontend
backend-api
postgres
redis
n8n
evolution-api
jarvis-worker
monitoring
backup-agent
```

### Reverse proxy

Use **Traefik** or **Nginx** to:

- route domains and subdomains;
- terminate HTTPS where applicable;
- route requests to Docker services;
- provide a clean path for future horizontal scaling.

---

## 5. Frontend

Recommended stack:

- Next.js
- React
- TypeScript

The frontend must be mobile-first because many target customers will operate primarily from a smartphone.

### Main customer areas

- Dashboard
- Orders
- Products
- Customers/leads
- Forms/catalogs
- Payments
- Messaging/integrations
- Reports
- Configuration

### UX principle

The application should feel closer to operating WhatsApp/Instagram than operating an ERP.

Common actions should require the minimum possible number of steps.

---

## 6. Product management UX

The customer must be able to independently:

- create a product;
- edit a product;
- upload/change photos;
- edit name and description;
- change price;
- activate/deactivate availability;
- change category;
- define optional stock/limit;
- configure variants/add-ons when enabled.

Default product form should expose only essential fields. Advanced fields should remain under **More options** or equivalent progressive disclosure.

Possible future assisted features:

- image crop;
- background removal;
- image enhancement;
- AI-assisted description drafting;
- suggested categories;
- suggested price changes.

AI-generated or AI-modified content must require user approval before public publication unless the tenant explicitly enables a trusted automation rule.

---

## 7. Order management

Recommended order lifecycle:

```text
NEW
→ CONFIRMED
→ IN_PREPARATION
→ READY
→ OUT_FOR_DELIVERY / READY_FOR_PICKUP
→ COMPLETED
```

Additional states:

```text
CANCELLED
PAYMENT_PENDING
PAYMENT_FAILED
REFUNDED
```

The interface should support quick status transitions from mobile.

Each status transition may generate events for:

- WhatsApp notifications;
- e-mail notifications;
- payment validation;
- delivery workflows;
- analytics;
- audit logs;
- Jarvis actions.

---

## 8. Backend/API

Recommended stack:

- Node.js
- TypeScript
- Fastify, NestJS or equivalent structured framework

Responsibilities:

- authentication;
- authorization;
- tenant resolution;
- business rules;
- product/catalog management;
- order lifecycle;
- payment orchestration;
- messaging orchestration;
- usage metering;
- billing data;
- integration management;
- webhook processing;
- audit logging.

Avoid exposing provider-specific logic throughout the application.

---

## 9. Multi-tenancy

Primary isolation model: shared application + shared database with strict tenant boundaries.

Typical tables:

```text
tenants
users
tenant_users
products
product_images
categories
forms
form_submissions
customers
orders
order_items
payments
integrations
whatsapp_connections
email_settings
usage_events
subscriptions
invoices
audit_logs
```

Every tenant-owned table must include `tenant_id` unless ownership is inherited through a safely enforced relationship.

Example:

```text
products
- id
- tenant_id
- name
- description
- price
- status
- created_at
```

Tenant access must never rely only on a frontend-supplied tenant identifier.

---

## 10. Database

Primary database:

- PostgreSQL

Two viable starting approaches:

### Option A — PostgreSQL on VPS

Advantages:

- lower initial cost;
- simple Docker architecture;
- full control.

Requires SamJoE to own:

- backups;
- upgrades;
- monitoring;
- restore procedures;
- database security.

### Option B — Supabase

Can provide:

- managed PostgreSQL;
- Auth;
- Storage;
- Row Level Security;
- easier managed backups depending on plan.

If Supabase is used, RLS should reinforce tenant isolation.

The application must remain sufficiently decoupled to avoid unnecessary provider lock-in.

---

## 11. Redis and queues

Use Redis for:

- caching;
- temporary session/state data where appropriate;
- rate limiting;
- queues;
- background jobs;
- distributed locks;
- transient integration state.

Long-running jobs must not block normal HTTP requests.

Examples:

- bulk message processing;
- image processing;
- reports;
- webhooks retries;
- payment reconciliation;
- Jarvis analysis;
- scheduled campaigns.

---

## 12. File and image storage

Do not store product image binaries directly in PostgreSQL.

Recommended options:

- Cloudflare R2;
- Supabase Storage;
- S3-compatible object storage.

Store in PostgreSQL only file metadata, ownership, paths/keys and URLs where appropriate.

---

## 13. WhatsApp architecture

The platform must support multiple providers behind an internal abstraction.

Internal conceptual interface:

```text
WhatsAppProvider
- connect()
- disconnect()
- getStatus()
- sendText()
- sendMedia()
- handleWebhook()
```

Initial providers:

```text
EvolutionProvider
MetaCloudProvider
```

### Evolution API

Use for low-cost entry plans and small customers.

Recommended model:

- one Evolution API deployment;
- one Evolution instance per customer/number;
- customer uses their own WhatsApp number;
- connection status stored per tenant;
- Jarvis monitors disconnected or unstable instances.

The customer panel should expose:

```text
WhatsApp
Status: Connected / Disconnected
Number: +55...
Last activity: ...
[Reconnect]
```

If a session is lost, reconnection should be designed as a self-service QR-code flow whenever technically possible.

### Meta WhatsApp Cloud API

Offer as the professional/stable option for customers that need official API infrastructure.

The customer's WhatsApp assets should preferably remain owned by the customer/business, with SamJoE acting as the application/integration layer.

Avoid binding the entire product to Evolution-specific APIs.

---

## 14. E-mail

Preferred transactional provider:

- Amazon SES

Uses:

- account verification;
- password recovery;
- order confirmations;
- system notifications;
- reports;
- permitted marketing communications.

Templates should support tenant branding.

Sending reputation, bounces, complaints and unsubscribe rules must be handled appropriately.

---

## 15. Payments

Initial provider:

- Mercado Pago

Recommended design:

- each customer connects their own payment account where applicable;
- SamJoE stores only required integration credentials/tokens securely;
- webhooks arrive at centralized endpoints;
- backend resolves which tenant owns the event;
- events are idempotent.

Typical payment events:

```text
payment.created
payment.pending
payment.approved
payment.failed
payment.refunded
```

Do not couple core order logic directly to Mercado Pago classes. Use a payment-provider abstraction to allow future integrations.

---

## 16. n8n

Use n8n as an orchestration/automation layer, not as the system of record.

Good use cases:

- integrations;
- notifications;
- follow-ups;
- simple scheduled workflows;
- CRM hand-offs;
- campaign orchestration;
- external service synchronization.

Critical business data must remain in the main application/database.

---

## 17. Jarvis role

Jarvis is the operational automation layer for SamJoE.

It must not merely act as a chatbot.

### Primary responsibilities

- monitor platform health;
- monitor WhatsApp connections;
- detect failed integrations;
- identify failed webhooks/jobs;
- monitor customer usage;
- assist support triage;
- answer routine customer questions;
- prepare requested catalog/product changes;
- generate operational summaries;
- identify sales/retention opportunities;
- surface customers that need human attention;
- assist SamJoE consultants with context and recommended next actions.

### Escalation principle

```text
Customer
   ↓
Self-service panel
   ↓
Jarvis assistance/automation
   ↓
Human SamJoE intervention only for exceptions
```

Jarvis should preferably prepare high-impact changes and request approval rather than silently modifying production data.

---

## 18. Assisted service and consulting

Self-service should cover routine operations.

Paid assisted services may include:

- catalog updates;
- photo adjustments;
- product descriptions;
- campaign configuration;
- WhatsApp automation;
- landing pages/sites;
- paid traffic support;
- sales consulting;
- process consulting;
- custom integrations.

Jarvis should reduce the internal labor required to deliver these services.

---

## 19. Usage metering and billing

The commercial model should support:

- low fixed monthly fee;
- included usage allowance;
- variable usage fee;
- optional service add-ons.

Potential usage metrics:

```text
orders
form submissions
qualified leads
WhatsApp messages
automations executed
storage
AI-assisted operations
```

The platform must record usage as auditable events instead of calculating billing only from current aggregate values.

Example:

```text
usage_events
- id
- tenant_id
- event_type
- quantity
- source_id
- occurred_at
```

Billing logic can aggregate these events per billing period.

---

## 20. Monitoring and observability

Initial tooling may include:

- Uptime Kuma;
- Docker/container metrics;
- application logs;
- structured backend logs;
- error tracking;
- resource alerts.

Monitor at minimum:

- API availability;
- frontend availability;
- PostgreSQL;
- Redis;
- disk usage;
- RAM;
- CPU;
- container restarts;
- queue failures;
- webhook failures;
- WhatsApp connection state;
- payment integration failures;
- backup execution.

Jarvis should consume these events and summarize only actionable exceptions.

---

## 21. Backups and disaster recovery

Backups must exist outside the production VPS.

Recommended destination:

- Cloudflare R2;
- Amazon S3;
- Backblaze B2;
- another S3-compatible storage provider.

Initial policy suggestion:

```text
Daily database backups
Weekly retained backups
Monthly retained backups
```

Requirements:

- encryption where appropriate;
- documented restore process;
- periodic restore tests;
- backup status monitoring;
- backup failures must generate alerts.

A backup that has never been restored is not considered verified.

---

## 22. Security baseline

Minimum requirements:

- SSH key authentication;
- no password-only SSH access;
- firewall;
- minimal exposed ports;
- secrets outside source code;
- encrypted provider credentials/tokens;
- strong authorization checks;
- tenant isolation;
- rate limiting;
- input validation;
- audit logs;
- idempotent webhooks;
- dependency/security update process;
- least privilege;
- safe administrator roles;
- protected backups;
- LGPD-aware data handling.

For sensitive actions, maintain audit records with at least:

```text
who
what
which tenant
previous value where applicable
new value where applicable
timestamp
source: user / Jarvis / automation / admin
```

---

## 23. CI/CD and environments

Source control:

- GitHub

Recommended environments:

```text
local
development/staging
production
```

Pipeline goals:

- automated tests;
- build Docker images;
- version images;
- deploy controlled versions;
- database migrations;
- health check after deployment;
- rollback capability.

Never deploy unversioned `latest` images as the only recovery strategy.

---

## 24. Initial deployment topology

```text
                        INTERNET
                            │
                       Cloudflare
                            │
                    Traefik / Nginx
                            │
          ┌─────────────────┴─────────────────┐
          │                                   │
      Frontend                           Backend API
     Next.js/React                       Node.js
          │                                   │
          └─────────────────┬─────────────────┘
                            │
                        PostgreSQL
                            │
               ┌────────────┴─────────────┐
               │                          │
             Redis                   Object Storage
                                        R2/S3
               │
     ┌─────────┼───────────┬──────────────┐
     │         │           │              │
    n8n    Evolution     Jarvis      Monitoring
     │         │           │
     │      WhatsApp       │
     │                     │
     ├── Mercado Pago      │
     ├── Amazon SES        │
     ├── Meta Cloud API    │
     └── Other APIs        │
                           │
                    Backup/Alerts
```

---

## 25. Scale strategy

### Phase 1 — Initial customers

Target: approximately 1–30 low-volume customers.

Possible topology:

- single 8 GB VPS;
- external object storage;
- external backups;
- Cloudflare.

### Phase 2 — Growing operation

When metrics justify separation:

- move PostgreSQL to a dedicated/managed service;
- isolate Evolution API;
- isolate n8n/workers;
- introduce dedicated queue workers;
- increase observability;
- add staging infrastructure.

### Phase 3 — Larger SaaS operation

Potential additions:

- multiple API replicas;
- load balancing;
- managed PostgreSQL with replicas/backups;
- separated queues/workers;
- high-availability Redis;
- independent WhatsApp infrastructure;
- centralized logs and metrics;
- automated scaling where economically justified.

Scaling decisions must be based on measured bottlenecks rather than premature infrastructure complexity.

---

## 26. MVP priorities

Build in this order unless product validation suggests otherwise:

1. Tenant/account foundation
2. Authentication and authorization
3. Product/catalog management
4. Public order/form experience
5. Order management panel
6. Mercado Pago integration
7. WhatsApp provider abstraction
8. Evolution integration
9. Usage metering
10. Basic billing
11. External backups
12. Monitoring
13. n8n integration
14. Jarvis operational integration
15. Meta Cloud API option
16. Assisted-service workflows
17. Marketing/consulting modules

---

## 27. Non-goals for initial MVP

Avoid adding these before validation unless required by an actual customer:

- Kubernetes;
- microservices for every module;
- one database per customer;
- one VPS per customer;
- complex BI stack;
- custom AI model hosting;
- elaborate event streaming infrastructure;
- enterprise-grade HA for low-volume initial usage.

The initial objective is **reliable, secure, maintainable and inexpensive**, not maximum architectural sophistication.

---

## 28. Definition of success

The architecture succeeds when:

- a new customer can be onboarded without creating a new server;
- routine catalog/order changes require no SamJoE intervention;
- WhatsApp can be connected and monitored per customer;
- billing can reflect actual usage;
- a failed integration is detected before the customer has to report it whenever possible;
- Jarvis filters routine operations and escalates only exceptions;
- backups can be restored;
- tenant data remains isolated;
- infrastructure costs grow materially slower than recurring revenue.

---

## 29. Open decisions to refine during implementation

- VPS provider and region;
- PostgreSQL on VPS vs Supabase/managed service;
- Traefik vs Nginx;
- NestJS vs Fastify architecture;
- Cloudflare R2 vs Supabase Storage;
- exact billing dimensions and pricing;
- Evolution availability by plan;
- Meta Cloud API onboarding model;
- precise support/consulting packages;
- Jarvis permission boundaries;
- retention periods for customer data, logs and backups;
- LGPD operational procedures;
- customer offboarding/export process.

These decisions should be documented as Architecture Decision Records (ADRs) as the project evolves.

---

## 30. Guiding rule

> **Everything the customer does frequently should be self-service. Everything technically specialized may become a paid assisted service. Everything repetitive inside SamJoE should be a candidate for Jarvis automation.**

## 31. Example

Site inspiration https://pedido.anota.ai/loja/super-frango-crocante-danfer