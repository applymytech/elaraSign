#!/bin/bash

# elaraSign Deployment Script
#
# DEFAULT: Safe deployment with preview before going live
#
# WORKFLOW:
# =========
# 1. Build and deploy to Cloud Run with 0% traffic (preview)
# 2. Show preview URL for testing
# 3. Ask user to verify preview works
# 4. Only then route 100% traffic to new version
#
# OPTIONS:
#   --direct      Skip preview, deploy directly to live (DANGEROUS)
#   --with-tests  Run tests before deploying
#   --local-only  Build and run locally in Docker (no deploy)
#
# TRAFFIC MANAGEMENT:
# ===================
# For gradual rollouts (10% -> 50% -> 100%), use:
#   ./deploy-preview.sh
#   ./deploy-promote.sh --gradual

set -e

# Add Python to PATH for gcloud (Windows compatibility)
export PATH="$PATH:/c/Python314:/c/Python313:/c/Python312:/c/Python311:/c/Python310"

# Parse arguments
direct=false
with_tests=false
local_only=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --direct)
      direct=true
      shift
      ;;
    --with-tests)
      with_tests=true
      shift
      ;;
    --local-only)
      local_only=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--direct] [--with-tests] [--local-only]"
      exit 1
      ;;
  esac
done

# Load config
config_path="$(dirname "$0")/deploy.config.json"
if [ ! -f "$config_path" ]; then
    echo "ERROR: deploy.config.json not found"
    exit 1
fi

gcloud_config=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.configuration)")
gcloud_account=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.account)")
gcloud_project=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.project)")
service_name=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).service.name)")
service_domain=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).service.domain)")

# Find gcloud
gcloud_cmd=""
if command -v gcloud.cmd &> /dev/null; then
    gcloud_cmd="gcloud.cmd"
elif command -v gcloud &> /dev/null; then
    gcloud_cmd="gcloud"
else
    # Try common Windows locations
    gcloud_paths=(
        "/c/Program Files/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd"
        "/c/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd"
        "$HOME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud.cmd"
        "/c/Program Files/Google/Cloud SDK/google-cloud-sdk/bin/gcloud"
        "/c/Program Files (x86)/Google/Cloud SDK/google-cloud-sdk/bin/gcloud"
        "$HOME/AppData/Local/Google/Cloud SDK/google-cloud-sdk/bin/gcloud"
    )
    for path in "${gcloud_paths[@]}"; do
        if [ -x "$path" ]; then
            gcloud_cmd="$path"
            break
        fi
    done
fi

if [ -z "$gcloud_cmd" ]; then
    echo "ERROR: gcloud CLI not found"
    echo "Please install Google Cloud SDK and ensure it's in your PATH"
    exit 1
fi

echo ""
echo "========================================"
echo "  elaraSign Deployment"
echo "========================================"
echo ""
echo "  Config:  $gcloud_config"
echo "  Account: $gcloud_account"
echo "  Project: $gcloud_project"
echo "  Service: $service_name"
echo "  Domain:  $service_domain"
echo ""

# Step 1: Setup gcloud configuration
echo "[1/6] Setting up gcloud configuration..."

if ! $gcloud_cmd config configurations list --format="value(name)" | grep -q "^$gcloud_config$"; then
    echo "      Creating configuration: $gcloud_config"
    $gcloud_cmd config configurations create "$gcloud_config"
fi

$gcloud_cmd config configurations activate "$gcloud_config"
$gcloud_cmd config set account "$gcloud_account"
$gcloud_cmd config set project "$gcloud_project"

echo "      OK - Configuration: $gcloud_config"

# Step 2: Verify authentication
echo "[2/6] Verifying authentication..."

if ! $gcloud_cmd auth list --filter="status:ACTIVE" --format="value(account)" | grep -q "^$gcloud_account$"; then
    echo "      Account $gcloud_account not authenticated."
    echo ""
    echo "      Run this command to authenticate:"
    echo ""
    echo "        gcloud auth login $gcloud_account"
    echo ""
    echo "      Then re-run: ./deploy.sh"
    echo ""
    exit 1
fi
echo "      OK - Authenticated as $gcloud_account"

# Step 3: Verify project access
echo "[3/6] Verifying project access..."

if ! $gcloud_cmd projects describe "$gcloud_project" --format="value(projectId)" >/dev/null 2>&1; then
    echo "ERROR: Cannot access project $gcloud_project"
    exit 1
fi
echo "      OK - Project accessible"

# Step 4: Run tests (optional - trusts preflight by default)
if [ "$with_tests" = true ]; then
    echo "[4/7] Running tests..."
    if npm test; then
        echo "      OK - Tests passed"
    else
        echo "      FAIL - Tests failed"
        exit 1
    fi
else
    echo "[4/7] Skipping tests (trusting preflight)"
    echo "      TIP: Use --with-tests to run tests anyway"
fi

# Step 5: Build TypeScript
echo "[5/7] Building TypeScript..."
if npm run build; then
    echo "      OK - Build succeeded"
else
    echo "      FAIL - Build failed"
    exit 1
fi

# Local only mode
if [ "$local_only" = true ]; then
    echo "[6/7] Building local Docker..."
    docker build -t elara-sign:local .
    echo ""
    echo "Starting local server at http://localhost:8080"
    echo "Press Ctrl+C to stop"
    docker run --rm -p 8080:8080 elara-sign:local
    exit 0
fi

# Get current live revision (for traffic management)
echo "[6/7] Recording current live revision..."
region=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.region)")
current_revision=$($gcloud_cmd run services describe "$service_name" --region="$region" --format="value(status.traffic[0].revisionName)" 2>/dev/null || echo "")
if [ -n "$current_revision" ]; then
    echo "$current_revision" > "$(dirname "$0")/.last-live-revision"
    echo "      OK - Current live: $current_revision"
else
    echo "      INFO - No existing revision (first deploy)"
    current_revision=""
fi

# Step 7: Deploy
echo "[7/7] Deploying to Cloud Run..."
echo ""

short_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "manual")

$gcloud_cmd builds submit --config=cloudbuild.yaml --substitutions=SHORT_SHA="$short_sha"

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Build failed"
    exit 1
fi

# Get the new revision
sleep 3
new_revision=$($gcloud_cmd run revisions list --service="$service_name" --region="$region" --format="value(name)" --limit=1)

if [ "$direct" = true ]; then
    # Direct mode: route traffic immediately
    echo ""
    echo "========================================"
    echo "  DEPLOYMENT SUCCESSFUL (--direct)"
    echo "========================================"
    echo ""
    echo "  Live URL: https://$service_domain"
    echo "  Revision: $new_revision"
    echo ""
else
    # Default: Preview mode - set to 0% traffic first
    echo ""
    echo "Setting preview to 0% traffic..."
    
    if [ -n "$current_revision" ]; then
        $gcloud_cmd run services update-traffic "$service_name" --region="$region" --to-revisions="$current_revision=100" >/dev/null 2>&1
    fi
    
    # Save for promote script
    echo "$new_revision" > "$(dirname "$0")/.preview-revision"
    
    # Get service URL
    service_url=$($gcloud_cmd run services describe "$service_name" --region="$region" --format="value(status.url)")
    
    echo ""
    echo "========================================"
    echo "  PREVIEW DEPLOYED"
    echo "========================================"
    echo ""
    echo "  Revision: $new_revision (0% traffic)"
    echo "  Live URL: https://$service_domain (unchanged)"
    echo ""
    echo "  NEXT STEPS:"
    echo ""
    echo "  1. Review Cloud Console to verify build succeeded"
    echo ""
    echo "  2. If ready, promote to live:"
    echo ""
    echo "       ./deploy-promote.sh"
    echo ""
    echo "  3. If something is wrong, do nothing."
    echo "     The live site is unchanged."
    echo ""
fi