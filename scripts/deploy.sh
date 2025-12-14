#!/bin/bash

# UzNotes-AI Deployment Script
# This script helps deploy the application to Google Cloud

set -e

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-"your-project-id"}
REGION=${GCP_REGION:-"us-central1"}
API_SERVICE_NAME="uznotes-api"
WORKER_SERVICE_NAME="uznotes-worker"

echo "🚀 UzNotes-AI Deployment"
echo "========================"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI is not installed. Please install it first."
    exit 1
fi

# Check if user is logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" &> /dev/null; then
    echo "❌ Not logged in to gcloud. Please run 'gcloud auth login' first."
    exit 1
fi

# Set project
echo "📁 Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    secretmanager.googleapis.com \
    sqladmin.googleapis.com \
    storage.googleapis.com \
    aiplatform.googleapis.com

# Create secrets (if they don't exist)
echo "🔐 Setting up secrets..."
create_secret_if_not_exists() {
    local secret_name=$1
    local secret_value=$2

    if ! gcloud secrets describe $secret_name &> /dev/null; then
        echo "Creating secret: $secret_name"
        echo -n "$secret_value" | gcloud secrets create $secret_name --data-file=-
    else
        echo "Secret $secret_name already exists"
    fi
}

# Note: You'll need to set these values
# create_secret_if_not_exists "DATABASE_URL" "postgresql://user:password@host:5432/uznotes"
# create_secret_if_not_exists "REDIS_URL" "rediss://default:xxx@xxx.upstash.io:6379"
# create_secret_if_not_exists "JWT_SECRET" "your-jwt-secret-min-32-chars"
# create_secret_if_not_exists "JWT_REFRESH_SECRET" "your-refresh-secret-min-32-chars"

# Create GCS bucket
echo "📦 Creating GCS bucket..."
BUCKET_NAME="${PROJECT_ID}-uznotes-uploads"
if ! gsutil ls -b gs://$BUCKET_NAME &> /dev/null; then
    gsutil mb -l $REGION gs://$BUCKET_NAME
    gsutil uniformbucketlevelaccess set on gs://$BUCKET_NAME
    echo "Created bucket: $BUCKET_NAME"
else
    echo "Bucket $BUCKET_NAME already exists"
fi

# Build and deploy using Cloud Build
echo "🏗️ Building and deploying..."
gcloud builds submit --config=cloudbuild.yaml \
    --substitutions=_REGION=$REGION,_GCS_BUCKET=$BUCKET_NAME

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 API URL:"
gcloud run services describe $API_SERVICE_NAME --region=$REGION --format="value(status.url)"
echo ""
echo "📝 Next steps:"
echo "1. Set up Cloud SQL for PostgreSQL (or use existing)"
echo "2. Set up Upstash Redis (or Cloud Memorystore)"
echo "3. Update secrets with actual values"
echo "4. Run database migrations"
