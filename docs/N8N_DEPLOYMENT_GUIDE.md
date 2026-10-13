# TRUV LedgerOS — n8n Automation Engine Deployment & Operations Guide

## 1. Overview & Architecture

The TRUV LedgerOS n8n integration layer decouples core accounting practice business logic from long-running multi-channel workflow automations (WhatsApp, email broadcasts, reminder scheduling, escalation timers).

### Security Boundary Principles
1. **Zero Database Exposure:** The n8n engine and workflows **never** receive direct credentials or connection strings to the production PostgreSQL accounting database.
2. **Authenticated HTTP Integration Boundary:** All communication is routed through authenticated endpoints (`/api/webhooks/n8n`) signed with HMAC-SHA256 (`x-truv-signature`) and timestamp freshness (`x-truv-timestamp` within 5 minutes) to prevent replay attacks.
3. **Data Minimization:** Webhook payloads broadcast only stable record IDs (`clientId`, `invoiceId`, `taskId`) and minimal operational metadata. Workflow nodes query necessary attributes on demand.
4. **Authoritative State Verification:** Automated triggers never assume official filing status or payment settlement. Financial and statutory actions always recheck authoritative PostgreSQL balances and records.
5. **Transactional Outbox:** Events generated in LedgerOS are recorded in the PostgreSQL `AutomationEvent` ledger within the business transaction and asynchronously delivered via the Outbox Dispatcher.

---

## 2. Windows Local Deployment: Installing Docker Desktop

If developing locally on Windows where Docker is not yet installed:

### Step 1: Install Docker Desktop via Windows Package Manager (winget)
Open PowerShell as Administrator:
```powershell
winget install -e --id Docker.DockerDesktop
```

### Step 2: Ensure WSL 2 Backend is Enabled
If WSL is not installed or has no distributions:
```powershell
wsl --install -d Ubuntu
wsl --set-default-version 2
```
*Note: Ensure Virtual Machine Platform and Windows Hypervisor Platform are checked in "Turn Windows features on or off" and virtualization is enabled in your system BIOS/UEFI.*

### Step 3: Start Docker Desktop
Launch Docker Desktop from the Start Menu, accept the license terms, and confirm Docker is running:
```powershell
docker --version
docker compose version
```

### Step 4: Run n8n Container
Once Docker Desktop is active:
```powershell
docker compose -f docker-compose.n8n.yml --env-file .env.n8n up -d
```

---

## 3. Persistent Remote Server Deployment (Linux / Ubuntu 22.04 or 24.04 LTS)

For production practice management, deploy n8n to a persistent Linux virtual server (AWS EC2, DigitalOcean Droplet, or Hetzner Cloud).

### Step 1: Provision Server and Install Docker
SSH into your server:
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
```

### Step 2: Clone Deployment Files and Set Environment
```bash
mkdir -p /opt/truv-n8n && cd /opt/truv-n8n
# Copy docker-compose.n8n.yml and .env.n8n into this folder
cp .env.n8n.example .env.n8n
```

Generate secure secrets:
```bash
# 64-char hex key for n8n credentials vault
openssl rand -hex 32

# 64-char secret for HMAC-SHA256 webhook signing
openssl rand -hex 32

# Strong password for n8n dedicated PostgreSQL
openssl rand -base64 24
```
Edit `.env.n8n` with your production domains (`n8n.firm.truv.io`, `https://app.firm.truv.io`).

### Step 3: Configure systemd Auto-Start Service
Create `/etc/systemd/system/truv-n8n.service`:
```ini
[Unit]
Description=TRUV LedgerOS n8n Automation Engine
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/truv-n8n
ExecStart=/usr/bin/docker compose -f docker-compose.n8n.yml --env-file .env.n8n up -d
ExecStop=/usr/bin/docker compose -f docker-compose.n8n.yml stop
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable truv-n8n
sudo systemctl start truv-n8n
```

---

## 4. Reverse Proxy Setup (TLS / HTTPS)

### Caddy (Recommended — Automatic TLS)
Install Caddy and configure `/etc/caddy/Caddyfile`:
```caddy
n8n.firm.truv.io {
    reverse_proxy 127.0.0.1:5678 {
        header_up Host {host}
        header_up X-Real-IP {remote}
        header_up X-Forwarded-For {remote}
        header_up X-Forwarded-Proto {scheme}
    }
}
```
Reload Caddy: `sudo systemctl reload caddy`.

### Nginx Alternative
```nginx
server {
    server_name n8n.firm.truv.io;

    location / {
        proxy_pass http://127.0.0.1:5678;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    listen 443 ssl http2;
    ssl_certificate /etc/letsencrypt/live/n8n.firm.truv.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/n8n.firm.truv.io/privkey.pem;
}
```

---

## 5. Persistent Outbox Worker Execution

The transactional outbox requires persistent execution to drain `AutomationEvent` records and dispatch them to n8n. Three operational options are supported:

### Option A: Standalone PM2 Process (Recommended for Node Servers)
```bash
npm install -g pm2
pm2 start npm --name "truv-outbox-worker" -- run outbox:worker
pm2 save
pm2 startup
```

### Option B: Scheduled Cron API Endpoint
Invoke the secure cron API endpoint every 1-5 minutes via crontab or cloud scheduler:
```bash
curl -X POST https://app.firm.truv.io/api/cron/outbox-dispatch \
  -H "Authorization: Bearer <CRON_SECRET>"
```

### Option C: Next.js In-Process Scheduler
Set in `.env`:
```env
ENABLE_INPROCESS_OUTBOX_WORKER="true"
OUTBOX_POLL_INTERVAL_MS="10000"
```
The Next.js server runtime hook in `src/instrumentation.ts` will automatically drain the outbox queue periodically without external processes.

---

## 6. Execution Pruning, Backups, and Disaster Recovery

### Pruning Policy
Configured in `docker-compose.n8n.yml`:
- `EXECUTIONS_DATA_PRUNE=true`: Automatically prunes old runs.
- `EXECUTIONS_DATA_MAX_AGE=336`: Retains 14 days of execution logs.
- `EXECUTIONS_DATA_PRUNE_MAX_COUNT=50000`: Maximum 50,000 executions.
- `EXECUTIONS_DATA_SAVE_ON_ERROR=all`: Always preserves full context for failed runs.

### Daily Backup Script
Add to crontab (`crontab -e`):
```bash
0 2 * * * docker exec -t truv_n8n_postgres pg_dump -U n8n_truv_admin n8n_truv_ledgeros | gzip > /backups/n8n/backup_$(date +\%F).sql.gz
```

### Disaster Restoration
```bash
# 1. Stop container
docker compose -f docker-compose.n8n.yml stop n8n

# 2. Restore PostgreSQL dump
gunzip -c /backups/n8n/backup_YYYY-MM-DD.sql.gz | docker exec -i truv_n8n_postgres psql -U n8n_truv_admin -d n8n_truv_ledgeros

# 3. Restart container
docker compose -f docker-compose.n8n.yml start n8n
```

---

## 7. Canonical Workflow Inventory

All workflows are located in git under `n8n/workflows/`:
1. `workflow-a-client-onboarding.json`: Initializes KYC and statutory portal checklist tasks upon client creation or import.
2. `workflow-b-gst-compliance-reminders.json`: Scheduled check of due obligations in `Asia/Kolkata` timezone without inferring statutory status.
3. `workflow-c-document-collection.json`: Outstanding document escalation with 3-reminder partner alert threshold.
4. `workflow-d-task-assignment-approvals.json`: Staff assignment dispatch and review rejection feedback.
5. `workflow-e-invoice-payment-reminders.json`: Due/overdue invoice notifications with strict balance verification.
6. `workflow-f-automation-failure-alerts.json`: Dead-letter alerts with sanitized diagnostics and correlation IDs.
