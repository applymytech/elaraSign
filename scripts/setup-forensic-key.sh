#!/bin/bash

# elaraSign Forensic Master Key Setup
# ====================================
# Run this ONCE per project to set up forensic accountability.
# The key persists in Secret Manager across all deployments.

set -e

# Add Python to PATH for gcloud (Windows compatibility)
export PATH="$PATH:/c/Python314:/c/Python313:/c/Python312:/c/Python311:/c/Python310"

# Parse arguments
project_id="elarasign-prod"
force=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --project-id)
      project_id="$2"
      shift 2
      ;;
    --force)
      force=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--project-id ID] [--force]"
      exit 1
      ;;
  esac
done

secret_name="elarasign-master-key"

echo ""
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║           elaraSign Forensic Master Key Setup                      ║"
echo "╠════════════════════════════════════════════════════════════════════╣"
echo "║  This key is used to encrypt accountability data in signed images  ║"
echo "║  ONLY the holder of this key can decrypt forensic data later       ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""

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

# Check gcloud
echo "Checking gcloud configuration..."
current_project=$($gcloud_cmd config get-value project 2>/dev/null)
if [ "$current_project" != "$project_id" ]; then
    echo "Setting project to $project_id..."
    $gcloud_cmd config set project "$project_id"
fi

# Check if secret already exists
echo "Checking for existing secret..."
if $gcloud_cmd secrets describe "$secret_name" --project="$project_id" >/dev/null 2>&1; then
    existing_secret=true
else
    existing_secret=false
fi

if [ "$existing_secret" = true ] && [ "$force" = false ]; then
    echo ""
    echo "⚠️  SECRET ALREADY EXISTS!"
    echo ""
    echo "The master key is already configured in Secret Manager."
    echo "If you regenerate it, ALL previously signed images will have"
    echo "ORPHANED forensic data that can never be decrypted."
    echo ""
    echo "View/copy in Google Console:"
    echo "  https://console.cloud.google.com/security/secret-manager/secret/$secret_name/versions?project=$project_id"
    echo ""
    echo "To force regeneration (DANGEROUS):"
    echo "  ./scripts/setup-forensic-key.sh --force"
    echo ""
    exit 0
fi

if [ "$force" = true ] && [ "$existing_secret" = true ]; then
    echo ""
    echo "⚠️  WARNING: You are about to REPLACE the existing master key!"
    echo "   All previously signed images will have orphaned forensic data."
    echo ""
    read -p "Type 'REPLACE' to confirm: " confirm
    if [ "$confirm" != "REPLACE" ]; then
        echo "Aborted."
        exit 1
    fi
fi

# Generate new key
echo ""
echo "Generating 256-bit master key..."
master_key=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

if [ ${#master_key} -ne 64 ]; then
    echo "ERROR: Key generation failed"
    exit 1
fi

# Store in Secret Manager
echo "Storing in Google Secret Manager..."

if [ "$existing_secret" = true ]; then
    # Add new version to existing secret
    echo -n "$master_key" | $gcloud_cmd secrets versions add "$secret_name" --data-file=- --project="$project_id"
else
    # Create new secret
    echo -n "$master_key" | $gcloud_cmd secrets create "$secret_name" --data-file=- --project="$project_id" --replication-policy="automatic"
fi

if [ $? -ne 0 ]; then
    echo "ERROR: Failed to store secret"
    exit 1
fi

# Grant Cloud Run service account access
echo "Granting Cloud Run access to secret..."
service_account="$($gcloud_cmd projects describe "$project_id" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
$gcloud_cmd secrets add-iam-policy-binding "$secret_name" \
    --member="serviceAccount:$service_account" \
    --role="roles/secretmanager.secretAccessor" \
    --project="$project_id" >/dev/null 2>&1

echo ""
echo "╔════════════════════════════════════════════════════════════════════╗"
echo "║                     SETUP COMPLETE                               ║"
echo "╚════════════════════════════════════════════════════════════════════╝"
echo ""
echo "Your master key is stored securely in Google Secret Manager."
echo ""
echo "View/copy anytime:"
echo "  https://console.cloud.google.com/security/secret-manager/secret/$secret_name/versions?project=$project_id"
echo ""
echo "(Click the secret version -> 'View Secret Value' to copy)"
echo ""
echo "Next steps:"
echo "  1. Deploy: gcloud builds submit --config=cloudbuild.yaml"
echo ""