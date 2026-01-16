#!/bin/bash

# elaraSign Preview Deployment
#
# Deploys a new revision WITHOUT routing traffic to it.
# The developer can test the preview URL, then run deploy-promote.sh to go live.
#
# ENFORCEMENT PHILOSOPHY:
# =======================
# 1. Heaven enforcement (strict) = Awareness/truth-gathering, may flag false positives
# 2. App preflight (tailored) = Gates deployment, respects legitimate ignores
# 3. VS Code Problems panel = Helpful but NOT the truth source
#
# WORKFLOW:
# =========
# 1. Run Heaven enforcement (awareness - reports all issues)
# 2. Run App preflight (gates deployment - app-specific rules)
# 3. Deploy preview (no traffic)
# 4. Test the preview URL
# 5. If good: ./deploy-promote.sh
# 6. If bad: No action needed (traffic still on old version)
#
# ROLLBACK:
# =========
# If issues after promotion: ./deploy-rollback.sh

set -e

# Add Python to PATH for gcloud (Windows compatibility)
export PATH="$PATH:/c/Python314:/c/Python313:/c/Python312:/c/Python311:/c/Python310"

# Load config
config_path="$(dirname "$0")/deploy.config.json"
if [ ! -f "$config_path" ]; then
    echo "ERROR: deploy.config.json not found"
    exit 1
fi

gcloud_config=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.configuration)")
gcloud_account=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.account)")
gcloud_project=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.project)")
region=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.region)")
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
echo "  elaraSign PREVIEW Deployment"
echo "========================================"
echo ""
echo "  This deploys WITHOUT routing traffic."
echo "  Test the preview, then run deploy-promote.sh"
echo ""

# ============================================================================
# ENFORCEMENT GATE 1: Heaven's Compliance Enforcer (AWARENESS)
# ============================================================================
# Heaven is STRICT and runs actual linters. It may flag things this app
# legitimately ignores. This is for awareness - app preflight gates deployment.
echo "[1/7] Running Heaven's Compliance Enforcer (awareness)..."

heaven_path="c:/architecture-review"
if [ -d "$heaven_path" ]; then
    cd "$heaven_path"
    # Target just this app with --app flag
    if heaven_output=$(npx tsx elara-engineer/compliance-enforcer.ts --app=elaraSign 2>&1); then
        echo "      OK - Heaven compliance passed"
    else
        echo "      WARN - Heaven found issues (review below):"
        echo "$heaven_output" | sed 's/^/            /'
        echo ""
        echo "      Heaven is strict. App preflight will determine if deployment proceeds."
    fi
    cd - >/dev/null
else
    echo "      SKIP - Heaven not found at $heaven_path"
fi

# ============================================================================
# ENFORCEMENT GATE 2: App Preflight (GATES DEPLOYMENT)
# ============================================================================
# This is what ACTUALLY gates deployment. Uses app's biome.json with
# legitimate ignores. Must pass with 0 errors and 0 warnings.
echo "[2/7] Running App Preflight (this gates deployment)..."

# Biome lint (must be 0 errors, 0 warnings)
if lint_output=$(npm run lint 2>&1); then
    if echo "$lint_output" | grep -q "Found [1-9][0-9]* warnings\?"; then
        echo "      FAIL - Biome found warnings (must be zero):"
        echo "$lint_output" | tail -15 | sed 's/^/            /'
        exit 1
    fi
    echo "      OK - Biome lint passed (0 errors, 0 warnings)"
else
    echo "      FAIL - Biome found errors:"
    echo "$lint_output" | tail -15 | sed 's/^/            /'
    exit 1
fi

# TypeScript build
echo "[3/7] Building TypeScript..."
if npm run build >/dev/null 2>&1; then
    echo "      OK - TypeScript compiles"
else
    echo "      FAIL - TypeScript build failed"
    npm run build 2>&1 | tail -15 | sed 's/^/            /'
    exit 1
fi

# ============================================================================
# GCLOUD SETUP
# ============================================================================
echo "[4/7] Setting up gcloud..."

if ! $gcloud_cmd config configurations list --format="value(name)" | grep -q "^$gcloud_config$"; then
    $gcloud_cmd config configurations create "$gcloud_config" >/dev/null 2>&1
fi
$gcloud_cmd config configurations activate "$gcloud_config" >/dev/null 2>&1
$gcloud_cmd config set account "$gcloud_account" >/dev/null 2>&1
$gcloud_cmd config set project "$gcloud_project" >/dev/null 2>&1

# Verify auth
if ! $gcloud_cmd auth list --filter="status:ACTIVE" --format="value(account)" | grep -q "^$gcloud_account$"; then
    echo "      Account $gcloud_account not authenticated."
    echo ""
    echo "      To authenticate, type this command:"
    echo ""
    echo "        gcloud auth login $gcloud_account"
    echo ""
    echo "      Then try again: ./deploy-preview.sh"
    echo ""
    exit 1
fi
echo "      OK - gcloud configured"

# ============================================================================
# GET CURRENT REVISION (for rollback reference)
# ============================================================================
echo "[5/7] Recording current live revision..."

current_revision=$($gcloud_cmd run services describe "$service_name" --region="$region" --format="value(status.traffic[0].revisionName)" 2>/dev/null || echo "")
if [ -n "$current_revision" ]; then
    # Save to file for rollback script
    echo "$current_revision" > "$(dirname "$0")/.last-live-revision"
    echo "      OK - Current live: $current_revision"
else
    echo "      INFO - No existing revision (first deploy)"
fi

# ============================================================================
# DEPLOY PREVIEW (NO TRAFFIC)
# ============================================================================
echo "[6/7] Deploying PREVIEW (no traffic)..."
echo ""

short_sha=$(git rev-parse --short HEAD 2>/dev/null || echo "manual")
timestamp=$(date +"%Y%m%d-%H%M%S")
revision_tag="preview-$short_sha-$timestamp"

echo "      Revision tag: $revision_tag"
echo ""

# Build and deploy with --no-traffic
$gcloud_cmd builds submit --config=cloudbuild.yaml --substitutions=SHORT_SHA="$short_sha"

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Build failed"
    exit 1
fi

# Get the new revision name
sleep 3
new_revision=$($gcloud_cmd run revisions list --service="$service_name" --region="$region" --format="value(name)" --limit=1)

# Set new revision to receive NO traffic
echo ""
echo "[7/7] Setting preview to 0% traffic..."
$gcloud_cmd run services update-traffic "$service_name" --region="$region" --to-revisions="$current_revision=100" >/dev/null 2>&1

# Save new revision for promote script
echo "$new_revision" > "$(dirname "$0")/.preview-revision"

# Get preview URL
preview_url=$($gcloud_cmd run revisions describe "$new_revision" --region="$region" --format="value(status.url)")

echo ""
echo "========================================"
echo "  PREVIEW DEPLOYED"
echo "========================================"
echo ""
echo "  Preview URL:  $preview_url"
echo "  Live URL:     https://$service_domain (unchanged)"
echo ""
echo "  Preview revision: $new_revision"
echo "  Live revision:    $current_revision"
echo ""
echo "  NEXT STEPS:"
echo "  1. Test the preview URL above"
echo "  2. If good: ./deploy-promote.sh"
echo "  3. If bad:  No action needed (traffic unchanged)"
echo ""