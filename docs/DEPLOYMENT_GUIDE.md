# UzNotes-AI Google Cloud Deployment Guide

> Complete step-by-step guide to deploy UzNotes-AI from scratch on Google Cloud Platform.

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Create Google Cloud Project](#2-create-google-cloud-project)
3. [Enable Required APIs](#3-enable-required-apis)
4. [Set Up Google Cloud Storage](#4-set-up-google-cloud-storage)
5. [Set Up Cloud SQL (PostgreSQL)](#5-set-up-cloud-sql-postgresql)
6. [Set Up Redis (Memorystore or Upstash)](#6-set-up-redis)
7. [Create Service Account](#7-create-service-account)
8. [Configure Secret Manager](#8-configure-secret-manager)
9. [Deploy from GitHub (CI/CD)](#9-deploy-from-github-cicd)
10. [Get Deployment URL](#10-get-deployment-url)
11. [Verify Deployment](#11-verify-deployment)
12. [Cost Optimization Tips](#12-cost-optimization-tips)

---

## 1. Prerequisites

Before starting, make sure you have:

- [ ] Google account
- [ ] Credit card for Google Cloud billing (free tier available)
- [ ] [Google Cloud CLI (gcloud)](https://cloud.google.com/sdk/docs/install) installed
- [ ] [Docker](https://docs.docker.com/get-docker/) installed
- [ ] Project source code ready

### Install Google Cloud CLI

**Windows (PowerShell as Admin):**
```powershell
(New-Object Net.WebClient).DownloadFile("https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe", "$env:Temp\GoogleCloudSDKInstaller.exe")
& $env:Temp\GoogleCloudSDKInstaller.exe
```

**macOS:**
```bash
brew install --cask google-cloud-sdk
```

**Linux:**
```bash
curl https://sdk.cloud.google.com | bash
exec -l $SHELL
```

### Initialize gcloud
```bash
gcloud init
```

---

## 2. Create Google Cloud Project

### Step 2.1: Go to Google Cloud Console
1. Open https://console.cloud.google.com
2. Sign in with your Google account

### Step 2.2: Create New Project
1. Click the project dropdown at the top (next to "Google Cloud")
2. Click "New Project"
3. Enter project details:
   - **Project name**: `uznotes-ai` (or your preferred name)
   - **Organization**: Leave as default or select your org
   - **Location**: Leave as default
4. Click "Create"
5. Wait for project creation (30-60 seconds)

### Step 2.3: Set Project in CLI

**Windows (Command Prompt):**
```cmd
:: Set your project ID (replace with your actual project ID)
set PROJECT_ID=dabir-ai

:: Configure gcloud to use this project
gcloud config set project %PROJECT_ID%

:: Verify
gcloud config get-value project
```

**Windows (PowerShell):**
```powershell
# Set your project ID (replace with your actual project ID)
$env:PROJECT_ID = "dabir-ai"

# Configure gcloud to use this project
gcloud config set project $env:PROJECT_ID

# Verify
gcloud config get-value project
```

**macOS/Linux:**
```bash
# Set your project ID (replace with your actual project ID)
export PROJECT_ID="dabir-ai"

# Configure gcloud to use this project
gcloud config set project $PROJECT_ID

# Verify
gcloud config get-value project
```

### Step 2.4: Enable Billing
1. Go to https://console.cloud.google.com/billing
2. Click "Link a billing account"
3. Select or create a billing account
4. Link it to your project

> **Note**: You get $300 free credit for new accounts. This project costs ~$20-50/month for light usage.

---

## 3. Enable Required APIs

Run these commands to enable all required APIs:

**Windows (Command Prompt) - Run each command separately:**
```cmd
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable sqladmin.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable aiplatform.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable redis.googleapis.com
gcloud services enable compute.googleapis.com
gcloud services enable vpcaccess.googleapis.com
```

**Or enable all at once (single line):**
```cmd
gcloud services enable cloudbuild.googleapis.com run.googleapis.com sqladmin.googleapis.com storage.googleapis.com secretmanager.googleapis.com aiplatform.googleapis.com containerregistry.googleapis.com artifactregistry.googleapis.com redis.googleapis.com compute.googleapis.com vpcaccess.googleapis.com
```

**macOS/Linux:**
```bash
gcloud services enable \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  storage.googleapis.com \
  secretmanager.googleapis.com \
  aiplatform.googleapis.com \
  containerregistry.googleapis.com \
  artifactregistry.googleapis.com \
  redis.googleapis.com \
  compute.googleapis.com \
  vpcaccess.googleapis.com
```

### What each API does:

| API | Purpose |
|-----|---------|
| `cloudbuild.googleapis.com` | Build Docker images |
| `run.googleapis.com` | Cloud Run (serverless containers) |
| `sqladmin.googleapis.com` | Cloud SQL (PostgreSQL) |
| `storage.googleapis.com` | Cloud Storage (file uploads) |
| `secretmanager.googleapis.com` | Store secrets securely |
| `aiplatform.googleapis.com` | Vertex AI (Gemini) |
| `containerregistry.googleapis.com` | Store Docker images |
| `artifactregistry.googleapis.com` | Artifact storage |
| `redis.googleapis.com` | Memorystore for Redis |
| `compute.googleapis.com` | Compute Engine (for VPC) |
| `vpcaccess.googleapis.com` | VPC Connector (Cloud Run to Cloud SQL) |

---

## 4. Set Up Google Cloud Storage

### Choosing a Region (Important for Central Asia!)

For users in Central Asia (Uzbekistan, Kazakhstan, etc.), choose a European region for lower latency:

| Region | Location | Latency from Tashkent |
|--------|----------|----------------------|
| `europe-west1` | Belgium | ~70-90ms (Recommended) |
| `europe-west3` | Frankfurt | ~80-100ms |
| `europe-west4` | Netherlands | ~80-100ms |
| `europe-north1` | Finland | ~90-110ms |
| `me-west1` | Tel Aviv | ~100-120ms |
| `us-central1` | Iowa, USA | ~200-250ms (Far) |

> **Recommendation**: Use `europe-west1` (Belgium) for best performance from Central Asia.

### Step 4.1: Create Storage Bucket

**Windows (Command Prompt):**
```cmd
:: Set your preferred region (europe-west1 recommended for Central Asia)
set REGION=europe-west1
set BUCKET_NAME=%PROJECT_ID%-uploads

:: Create the bucket
gcloud storage buckets create gs://%BUCKET_NAME% --location=%REGION% --uniform-bucket-level-access

:: Verify
gcloud storage buckets describe gs://%BUCKET_NAME%
```

**macOS/Linux:**
```bash
# Set your preferred region (europe-west1 recommended for Central Asia)
export REGION="europe-west1"
export BUCKET_NAME="${PROJECT_ID}-uploads"

# Create the bucket
gcloud storage buckets create gs://${BUCKET_NAME} \
  --location=${REGION} \
  --uniform-bucket-level-access

# Verify
gcloud storage buckets describe gs://${BUCKET_NAME}
```

### Step 4.2: Set CORS Policy (for direct browser uploads)

Create a file `cors.json`:
```json
[
  {
    "origin": ["*"],
    "method": ["GET", "HEAD", "PUT", "POST", "DELETE", "PATCH", "OPTIONS"],
    "responseHeader": ["Content-Type", "Content-Length", "Content-Range", "Upload-Offset", "Upload-Length", "Tus-Resumable", "Location", "X-Lecture-Id"],
    "maxAgeSeconds": 3600
  }
]
```

Apply CORS policy:

**Windows:**
```cmd
gcloud storage buckets update gs://%BUCKET_NAME% --cors-file=cors.json
```

**macOS/Linux:**
```bash
gcloud storage buckets update gs://${BUCKET_NAME} --cors-file=cors.json
```

### Step 4.3: Set Lifecycle Policy (optional, to auto-delete old files)

Create `lifecycle.json`:
```json
{
  "rule": [
    {
      "action": {"type": "Delete"},
      "condition": {
        "age": 90,
        "matchesPrefix": ["temp/"]
      }
    }
  ]
}
```

Apply:

**Windows:**
```cmd
gcloud storage buckets update gs://%BUCKET_NAME% --lifecycle-file=lifecycle.json
```

**macOS/Linux:**
```bash
gcloud storage buckets update gs://${BUCKET_NAME} --lifecycle-file=lifecycle.json
```

---

## 5. Set Up Cloud SQL (PostgreSQL)

### Step 5.1: Create Cloud SQL Instance

**Windows (Command Prompt):**
```cmd
:: Create PostgreSQL instance (this takes 5-10 minutes)
gcloud sql instances create uznotes-db --database-version=POSTGRES_15 --tier=db-f1-micro --region=%REGION% --storage-type=SSD --storage-size=10GB --storage-auto-increase --availability-type=zonal --backup-start-time=03:00 --maintenance-window-day=SUN --maintenance-window-hour=03

:: Wait for instance to be ready
gcloud sql instances describe uznotes-db
```

**macOS/Linux:**
```bash
# Create PostgreSQL instance (this takes 5-10 minutes)
gcloud sql instances create uznotes-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=${REGION} \
  --storage-type=SSD \
  --storage-size=10GB \
  --storage-auto-increase \
  --availability-type=zonal \
  --backup-start-time=03:00 \
  --maintenance-window-day=SUN \
  --maintenance-window-hour=03

# Wait for instance to be ready
gcloud sql instances describe uznotes-db
```

> **Tier Options**:
> - `db-f1-micro`: Shared CPU, 0.6GB RAM (~$10/month) - Development
> - `db-g1-small`: Shared CPU, 1.7GB RAM (~$25/month) - Small production
> - `db-custom-1-3840`: 1 vCPU, 3.75GB RAM (~$50/month) - Production

### Step 5.2: Set Root Password

**Windows (Command Prompt):**
```cmd
:: Generate a secure password manually or use this:
:: Go to https://passwordsgenerator.net/ and generate a 32-char password
:: Or use PowerShell: [System.Web.Security.Membership]::GeneratePassword(32,4)

:: Set your password (replace YOUR_SECURE_PASSWORD)
set DB_PASSWORD=YOUR_SECURE_PASSWORD_HERE

:: Set the password
gcloud sql users set-password postgres --instance=uznotes-db --password=%DB_PASSWORD%
```

**macOS/Linux:**
```bash
# Generate a secure password
export DB_PASSWORD=$(openssl rand -base64 32)
echo "Save this password: $DB_PASSWORD"

# Set the password
gcloud sql users set-password postgres \
  --instance=uznotes-db \
  --password="${DB_PASSWORD}"
```

### Step 5.3: Create Database

**All platforms:**
```cmd
gcloud sql databases create uznotes --instance=uznotes-db
```

### Step 5.4: Get Connection Name

**All platforms:**
```cmd
gcloud sql instances describe uznotes-db --format="value(connectionName)"
```

Save this - you'll need it for Cloud Run. It looks like: `dabir-ai:europe-west1:uznotes-db`

### Step 5.5: Create VPC Connector (for Cloud Run to connect to Cloud SQL)

**Windows (Command Prompt):**
```cmd
:: Create VPC connector
gcloud compute networks vpc-access connectors create uznotes-connector --region=%REGION% --range=10.8.0.0/28

:: Verify
gcloud compute networks vpc-access connectors describe uznotes-connector --region=%REGION%
```

**macOS/Linux:**
```bash
# Create VPC connector
gcloud compute networks vpc-access connectors create uznotes-connector \
  --region=${REGION} \
  --range=10.8.0.0/28

# Verify
gcloud compute networks vpc-access connectors describe uznotes-connector --region=${REGION}
```

---

## 6. Set Up Redis

You have two options: **Memorystore** (Google's managed Redis) or **Upstash** (serverless Redis).

### Option A: Upstash Redis (Recommended for cost)

Upstash offers a generous free tier and pay-per-request pricing.

1. Go to https://upstash.com
2. Sign up with Google account
3. Create a new Redis database:
   - **Name**: `uznotes-redis`
   - **Region**: Select closest to your GCP region
   - **Type**: Regional (free tier)
4. Copy the connection string:
   ```
   redis://default:xxxxx@us1-xxxxx.upstash.io:6379
   ```

### Option B: Memorystore for Redis (Google Cloud)

**Windows (Command Prompt):**
```cmd
:: Create Redis instance (takes 3-5 minutes)
gcloud redis instances create uznotes-redis --size=1 --region=%REGION% --redis-version=redis_7_0 --tier=basic

:: Get the IP address
gcloud redis instances describe uznotes-redis --region=%REGION% --format="value(host)"
```

**macOS/Linux:**
```bash
# Create Redis instance (takes 3-5 minutes)
gcloud redis instances create uznotes-redis \
  --size=1 \
  --region=${REGION} \
  --redis-version=redis_7_0 \
  --tier=basic

# Get the IP address
gcloud redis instances describe uznotes-redis --region=${REGION} --format="value(host)"
```

> **Note**: Memorystore costs ~$35/month minimum. Upstash is free for low traffic.

---

## 7. Create Service Account

### Step 7.1: Create Service Account

**Windows (Command Prompt):**
```cmd
:: Create service account
gcloud iam service-accounts create uznotes-api --display-name="UzNotes API Service Account"

:: Set the email variable
set SA_EMAIL=uznotes-api@%PROJECT_ID%.iam.gserviceaccount.com
echo %SA_EMAIL%
```

**macOS/Linux:**
```bash
# Create service account
gcloud iam service-accounts create uznotes-api \
  --display-name="UzNotes API Service Account"

# Get the email
export SA_EMAIL="uznotes-api@${PROJECT_ID}.iam.gserviceaccount.com"
echo $SA_EMAIL
```

### Step 7.2: Grant Permissions

**Windows (Command Prompt):**
```cmd
:: Storage access (for file uploads)
gcloud projects add-iam-policy-binding %PROJECT_ID% --member="serviceAccount:%SA_EMAIL%" --role="roles/storage.objectAdmin"

:: Cloud SQL access
gcloud projects add-iam-policy-binding %PROJECT_ID% --member="serviceAccount:%SA_EMAIL%" --role="roles/cloudsql.client"

:: Secret Manager access
gcloud projects add-iam-policy-binding %PROJECT_ID% --member="serviceAccount:%SA_EMAIL%" --role="roles/secretmanager.secretAccessor"

:: Vertex AI access (for Gemini)
gcloud projects add-iam-policy-binding %PROJECT_ID% --member="serviceAccount:%SA_EMAIL%" --role="roles/aiplatform.user"

:: Logging
gcloud projects add-iam-policy-binding %PROJECT_ID% --member="serviceAccount:%SA_EMAIL%" --role="roles/logging.logWriter"
```

**macOS/Linux:**
```bash
# Storage access (for file uploads)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/storage.objectAdmin"

# Cloud SQL access
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudsql.client"

# Secret Manager access
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"

# Vertex AI access (for Gemini)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/aiplatform.user"

# Logging
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/logging.logWriter"
```

### Step 7.3: Download Key (for local development only)

**Windows (Command Prompt):**
```cmd
:: Create credentials directory
mkdir credentials

:: Download key
gcloud iam service-accounts keys create credentials\service-account.json --iam-account=%SA_EMAIL%

:: IMPORTANT: Add to .gitignore (do this manually or use echo)
echo credentials/ >> .gitignore
```

**macOS/Linux:**
```bash
# Create credentials directory
mkdir -p credentials

# Download key
gcloud iam service-accounts keys create credentials/service-account.json \
  --iam-account=${SA_EMAIL}

# IMPORTANT: Add to .gitignore
echo "credentials/" >> .gitignore
```

---

## 8. Configure Secret Manager

### Step 8.1: Generate JWT Secrets

**Windows (Command Prompt):**
```cmd
:: Generate secrets manually - use a password generator or these values
:: Go to: https://generate-secret.vercel.app/64
:: Generate two different 64-character secrets

:: Set your generated secrets (replace with your actual values)
set JWT_SECRET=your-64-character-jwt-secret-here-replace-this-value-12345678
set JWT_REFRESH_SECRET=your-64-character-refresh-secret-here-replace-value-12345
```

**macOS/Linux:**
```bash
export JWT_SECRET=$(openssl rand -base64 48)
export JWT_REFRESH_SECRET=$(openssl rand -base64 48)

echo "JWT_SECRET: $JWT_SECRET"
echo "JWT_REFRESH_SECRET: $JWT_REFRESH_SECRET"
```

### Step 8.2: Create Secrets

**Windows (Command Prompt):**

First, create text files with the secret values, then use them:

```cmd
:: Get DB connection name
for /f "tokens=*" %%a in ('gcloud sql instances describe uznotes-db --format="value(connectionName)"') do set DB_CONNECTION_NAME=%%a
echo Connection: %DB_CONNECTION_NAME%

:: Create DATABASE_URL secret
:: Format: postgresql://postgres:PASSWORD@localhost/uznotes?host=/cloudsql/PROJECT:REGION:INSTANCE
echo postgresql://postgres:%DB_PASSWORD%@localhost/uznotes?host=/cloudsql/%DB_CONNECTION_NAME%> temp_db_url.txt
gcloud secrets create DATABASE_URL --data-file=temp_db_url.txt
del temp_db_url.txt

:: Create REDIS_URL secret (replace with your Upstash URL)
echo redis://default:YOUR_UPSTASH_PASSWORD@YOUR_ENDPOINT.upstash.io:6379> temp_redis.txt
gcloud secrets create REDIS_URL --data-file=temp_redis.txt
del temp_redis.txt

:: Create JWT secrets
echo %JWT_SECRET%> temp_jwt.txt
gcloud secrets create JWT_SECRET --data-file=temp_jwt.txt
del temp_jwt.txt

echo %JWT_REFRESH_SECRET%> temp_jwt_refresh.txt
gcloud secrets create JWT_REFRESH_SECRET --data-file=temp_jwt_refresh.txt
del temp_jwt_refresh.txt
```

**macOS/Linux:**
```bash
# Database URL
# For Cloud SQL with Unix socket:
export DB_CONNECTION_NAME=$(gcloud sql instances describe uznotes-db --format="value(connectionName)")
export DATABASE_URL="postgresql://postgres:${DB_PASSWORD}@localhost/uznotes?host=/cloudsql/${DB_CONNECTION_NAME}"

echo -n "${DATABASE_URL}" | gcloud secrets create DATABASE_URL --data-file=-

# Redis URL (use your Upstash URL or Memorystore IP)
# For Upstash:
echo -n "redis://default:YOUR_PASSWORD@YOUR_ENDPOINT.upstash.io:6379" | gcloud secrets create REDIS_URL --data-file=-

# JWT Secrets
echo -n "${JWT_SECRET}" | gcloud secrets create JWT_SECRET --data-file=-
echo -n "${JWT_REFRESH_SECRET}" | gcloud secrets create JWT_REFRESH_SECRET --data-file=-
```

### Step 8.3: Grant Cloud Run Access to Secrets

**Windows (Command Prompt):**
```cmd
gcloud secrets add-iam-policy-binding DATABASE_URL --member="serviceAccount:%SA_EMAIL%" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding REDIS_URL --member="serviceAccount:%SA_EMAIL%" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding JWT_SECRET --member="serviceAccount:%SA_EMAIL%" --role="roles/secretmanager.secretAccessor"
gcloud secrets add-iam-policy-binding JWT_REFRESH_SECRET --member="serviceAccount:%SA_EMAIL%" --role="roles/secretmanager.secretAccessor"
```

**macOS/Linux:**
```bash
# Grant access to each secret
for SECRET in DATABASE_URL REDIS_URL JWT_SECRET JWT_REFRESH_SECRET; do
  gcloud secrets add-iam-policy-binding $SECRET \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="roles/secretmanager.secretAccessor"
done
```

---

## 9. Deploy from GitHub (CI/CD)

Instead of building Docker images locally, we'll set up automatic deployment from GitHub. Every time you push to your repository, Cloud Build will automatically build and deploy your application.

### Step 9.1: Push Code to GitHub

1. **Create a new GitHub repository**
   - Go to https://github.com/new
   - Name it `uznotes-ai` (or your preferred name)
   - Keep it private (recommended)
   - Don't initialize with README (we have code already)

2. **Push your code to GitHub**

   **Windows (Command Prompt):**
   ```cmd
   cd /d d:\uznotes-ai

   :: Initialize git if not already done
   git init

   :: Add remote (replace YOUR_USERNAME with your GitHub username)
   git remote add origin https://github.com/YOUR_USERNAME/uznotes-ai.git

   :: Add all files
   git add .

   :: Commit
   git commit -m "Initial commit"

   :: Push to main branch
   git branch -M main
   git push -u origin main
   ```

   **macOS/Linux:**
   ```bash
   cd /path/to/uznotes-ai

   # Initialize git if not already done
   git init

   # Add remote (replace YOUR_USERNAME with your GitHub username)
   git remote add origin https://github.com/YOUR_USERNAME/uznotes-ai.git

   # Add all files
   git add .

   # Commit
   git commit -m "Initial commit"

   # Push to main branch
   git branch -M main
   git push -u origin main
   ```

### Step 9.2: Connect GitHub to Cloud Build

1. **Go to Cloud Build Triggers**
   - Open https://console.cloud.google.com/cloud-build/triggers
   - Make sure you're in the correct project

2. **Connect your GitHub repository**
   - Click "Connect Repository"
   - Select "GitHub (Cloud Build GitHub App)"
   - Click "Continue"
   - Authenticate with GitHub when prompted
   - Select your repository (`uznotes-ai`)
   - Click "Connect"

3. **Create a Build Trigger**
   - After connecting, click "Create Trigger"
   - Configure the trigger:
     - **Name**: `deploy-on-push`
     - **Description**: `Deploy to Cloud Run on push to main`
     - **Event**: Push to a branch
     - **Source**: Your connected repository
     - **Branch**: `^main$` (regex for main branch)
     - **Configuration**: Cloud Build configuration file
     - **Location**: `cloudbuild.yaml` (in repository root)
   - Click "Create"

### Step 9.3: Grant Cloud Build Permissions

Cloud Build needs permissions to deploy to Cloud Run and access secrets.

**Windows (Command Prompt):**
```cmd
:: Get Cloud Build service account
for /f "tokens=*" %%a in ('gcloud projects describe %PROJECT_ID% --format="value(projectNumber)"') do set PROJECT_NUMBER=%%a
set CLOUDBUILD_SA=%PROJECT_NUMBER%@cloudbuild.gserviceaccount.com
echo Cloud Build SA: %CLOUDBUILD_SA%

:: Grant Cloud Run Admin role
gcloud projects add-iam-policy-binding %PROJECT_ID% --member="serviceAccount:%CLOUDBUILD_SA%" --role="roles/run.admin"

:: Grant Service Account User role (to use the uznotes-api service account)
gcloud iam service-accounts add-iam-policy-binding %SA_EMAIL% --member="serviceAccount:%CLOUDBUILD_SA%" --role="roles/iam.serviceAccountUser"

:: Grant Secret Manager access
gcloud projects add-iam-policy-binding %PROJECT_ID% --member="serviceAccount:%CLOUDBUILD_SA%" --role="roles/secretmanager.secretAccessor"

:: Grant VPC Access (for VPC connector)
gcloud projects add-iam-policy-binding %PROJECT_ID% --member="serviceAccount:%CLOUDBUILD_SA%" --role="roles/vpcaccess.user"

:: Grant Cloud SQL Client (for cloudsql instances)
gcloud projects add-iam-policy-binding %PROJECT_ID% --member="serviceAccount:%CLOUDBUILD_SA%" --role="roles/cloudsql.client"
```

**macOS/Linux:**
```bash
# Get Cloud Build service account
export PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
export CLOUDBUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"
echo "Cloud Build SA: $CLOUDBUILD_SA"

# Grant Cloud Run Admin role
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/run.admin"

# Grant Service Account User role (to use the uznotes-api service account)
gcloud iam service-accounts add-iam-policy-binding ${SA_EMAIL} \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/iam.serviceAccountUser"

# Grant Secret Manager access
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/secretmanager.secretAccessor"

# Grant VPC Access (for VPC connector)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/vpcaccess.user"

# Grant Cloud SQL Client (for cloudsql instances)
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${CLOUDBUILD_SA}" \
  --role="roles/cloudsql.client"
```

### Step 9.4: Trigger First Deployment

**Option A: Push a small change to trigger build**
```cmd
:: Make a small change and push
echo. >> README.md
git add README.md
git commit -m "Trigger deployment"
git push
```

**Option B: Run trigger manually**
1. Go to https://console.cloud.google.com/cloud-build/triggers
2. Find your `deploy-on-push` trigger
3. Click "Run" button
4. Select branch `main`
5. Click "Run Trigger"

### Step 9.5: Monitor Build Progress

1. Go to https://console.cloud.google.com/cloud-build/builds
2. Click on the running build to see logs
3. Build takes ~5-10 minutes for first run

### What Happens on Each Push

```
Git Push → Cloud Build Trigger → Build Docker Images → Push to GCR → Deploy to Cloud Run
                                    (API + Worker)        ↓
                                                    Automatic Rollout
```

**The `cloudbuild.yaml` in your repository handles:**
- Building API Docker image
- Building Worker Docker image
- Pushing images to Google Container Registry
- Deploying API to Cloud Run with all settings
- Deploying Worker to Cloud Run with all settings

### Troubleshooting GitHub Deployment

**"Permission denied" during deploy:**
- Ensure Cloud Build has `roles/run.admin` permission
- Ensure Cloud Build can use the service account (`roles/iam.serviceAccountUser`)

**"Secret not found" error:**
- Ensure Cloud Build has `roles/secretmanager.secretAccessor`
- Verify secrets exist: `gcloud secrets list`

**"VPC connector not found":**
- Ensure VPC connector was created (Step 5.5)
- Ensure Cloud Build has `roles/vpcaccess.user`

**Build succeeds but deployment fails:**
- Check Cloud Run logs in the console
- Verify all secrets are created correctly

---

## 10. Get Deployment URL

After Cloud Build completes (Step 9), your services are automatically deployed. Get the API URL:

### Step 10.1: Get API URL

**Windows (Command Prompt):**
```cmd
set REGION=europe-west1
gcloud run services describe uznotes-api --region=%REGION% --format="value(status.url)"
```

**macOS/Linux:**
```bash
export REGION="europe-west1"
gcloud run services describe uznotes-api --region=${REGION} --format="value(status.url)"
```

Save this URL - it will look like: `https://uznotes-api-xxxxx-ew.a.run.app`

### Step 10.2: List All Deployed Services

**All platforms:**
```cmd
gcloud run services list
```

You should see both `uznotes-api` and `uznotes-worker` services listed.

### Manual Deployment (Optional)

If you need to deploy manually without GitHub (e.g., for testing), you can still use Cloud Build directly:

**All platforms:**
```cmd
gcloud builds submit --config=cloudbuild.yaml
```

This will run the same build process that GitHub triggers automatically.

---

## 11. Verify Deployment

### Step 11.1: Health Check

**Windows:**
```cmd
:: First get the API URL
for /f "tokens=*" %%a in ('gcloud run services describe uznotes-api --region=%REGION% --format="value(status.url)"') do set API_URL=%%a
echo API URL: %API_URL%

:: Test health endpoint (use browser or PowerShell)
:: Open in browser: %API_URL%/health
```

**PowerShell:**
```powershell
$API_URL = gcloud run services describe uznotes-api --region=$env:REGION --format="value(status.url)"
Invoke-RestMethod -Uri "$API_URL/health"
```

**macOS/Linux:**
```bash
API_URL=$(gcloud run services describe uznotes-api --region=${REGION} --format="value(status.url)")
curl ${API_URL}/health
```

Expected response:
```json
{"status":"ok","timestamp":"2025-12-15T...","version":"1.0.0"}
```

### Step 11.2: Check API Docs
Open in browser:
```
YOUR_API_URL/api/docs
```

Example: `https://uznotes-api-xxxxx-ew.a.run.app/api/docs`

### Step 11.3: Test Registration

**PowerShell:**
```powershell
$body = @{
    email = "test@example.com"
    password = "testpassword123"
} | ConvertTo-Json

Invoke-RestMethod -Uri "$API_URL/api/v1/auth/register" -Method Post -Body $body -ContentType "application/json"
```

**macOS/Linux:**
```bash
curl -X POST ${API_URL}/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123"}'
```

### Step 11.4: Check Logs

**Windows:**
```cmd
:: API logs
gcloud run services logs read uznotes-api --region=%REGION% --limit=50

:: Worker logs
gcloud run services logs read uznotes-worker --region=%REGION% --limit=50
```

**macOS/Linux:**
```bash
# API logs
gcloud run services logs read uznotes-api --region=${REGION} --limit=50

# Worker logs
gcloud run services logs read uznotes-worker --region=${REGION} --limit=50
```

### Step 11.5: Run Database Migrations

**All platforms:**
```cmd
:: Option 1: Use Cloud Shell (recommended for first time)
:: Go to https://console.cloud.google.com and click the Cloud Shell icon (>_) in top right
:: Then run:
gcloud sql connect uznotes-db --user=postgres
```

**For local development with Cloud SQL Proxy:**

1. Download Cloud SQL Proxy:
   - Windows: https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.8.0/cloud-sql-proxy.x64.exe
   - macOS/Linux: https://cloud.google.com/sql/docs/postgres/sql-proxy

2. Run the proxy:
   **Windows:**
   ```cmd
   cloud-sql-proxy.x64.exe %DB_CONNECTION_NAME%
   ```

   **macOS/Linux:**
   ```bash
   ./cloud-sql-proxy ${DB_CONNECTION_NAME} &
   ```

3. Run migrations (in another terminal):
   ```cmd
   npm run db:migrate
   ```

---

## 12. Cost Optimization Tips

### Estimated Monthly Costs

| Service | Tier | Est. Cost |
|---------|------|-----------|
| Cloud Run (API) | 512MB, scale to 0 | $5-20 |
| Cloud Run (Worker) | 1GB, min 1 instance | $25-40 |
| Cloud SQL | db-f1-micro | $10 |
| Cloud Storage | 10GB | $0.20 |
| Redis (Upstash) | Free tier | $0 |
| Vertex AI (Gemini) | Per request | $0.05/lecture |
| **Total** | | **$40-70/month** |

### Cost Saving Tips

1. **Use Upstash instead of Memorystore**
   - Saves ~$35/month
   - Pay-per-request pricing

2. **Scale Cloud Run to Zero**
   - Set `--min-instances=0` for API
   - Only pay when receiving requests

3. **Use Preemptible/Spot VMs for Workers** (if using Compute Engine)

4. **Set up Budget Alerts**
   ```bash
   gcloud billing budgets create \
     --billing-account=YOUR_BILLING_ACCOUNT_ID \
     --display-name="UzNotes Budget" \
     --budget-amount=50 \
     --threshold-rules-percent=50,90,100
   ```

5. **Monitor Usage**
   - Go to https://console.cloud.google.com/billing
   - Set up cost reports

---

## Quick Reference Commands

```bash
# View all services
gcloud run services list

# View logs
gcloud run services logs read uznotes-api --region=${REGION}

# Update service
gcloud run services update uznotes-api --region=${REGION} --memory=1Gi

# Delete service (careful!)
gcloud run services delete uznotes-api --region=${REGION}

# View secrets
gcloud secrets list

# Update a secret
echo -n "new-value" | gcloud secrets versions add SECRET_NAME --data-file=-
```

---

## Troubleshooting

### "Cloud SQL connection failed"
- Ensure VPC connector is created
- Check Cloud SQL instance is running
- Verify DATABASE_URL secret format

### "Permission denied" errors
- Check service account permissions
- Ensure secrets are accessible

### "Container failed to start"
- Check logs: `gcloud run services logs read uznotes-api`
- Verify environment variables are set
- Check health endpoint is accessible

### "Gemini API errors"
- Ensure Vertex AI API is enabled
- Check service account has `aiplatform.user` role
- Verify GCP_PROJECT_ID and GCP_REGION are correct

---

## Next Steps

1. [ ] Set up custom domain (optional)
2. [x] ~~Configure CI/CD with Cloud Build triggers~~ (Done in Step 9!)
3. [ ] Set up monitoring dashboards
4. [ ] Configure alerting policies
5. [ ] Set up backup automation

### Continuous Deployment Workflow

Now that CI/CD is set up, your deployment workflow is:

1. Make code changes locally
2. Commit and push to GitHub: `git push origin main`
3. Cloud Build automatically triggers
4. New version deploys to Cloud Run
5. Check build status at: https://console.cloud.google.com/cloud-build/builds

---

## Support

- Google Cloud Documentation: https://cloud.google.com/docs
- Cloud Run: https://cloud.google.com/run/docs
- Cloud SQL: https://cloud.google.com/sql/docs
- Vertex AI: https://cloud.google.com/vertex-ai/docs
