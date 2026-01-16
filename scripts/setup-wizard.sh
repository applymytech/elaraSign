#!/bin/bash

# elaraSign Cloud Run Setup Wizard
# ==================================
# Interactive setup for new deployments

set -e

# Add Python to PATH for gcloud (Windows compatibility)
export PATH="$PATH:/c/Python314:/c/Python313:/c/Python312:/c/Python311:/c/Python310"

# Parse arguments
project_id="elarasign-prod"
region="us-central1"
service_name="elara-sign"
repo_name="elara-sign-repo"
skip_confirmation=false
skip_forensic=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --project-id)
      project_id="$2"
      shift 2
      ;;
    --region)
      region="$2"
      shift 2
      ;;
    --service-name)
      service_name="$2"
      shift 2
      ;;
    --repo-name)
      repo_name="$2"
      shift 2
      ;;
    --skip-confirmation)
      skip_confirmation=true
      shift
      ;;
    --skip-forensic)
      skip_forensic=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--project-id ID] [--region REGION] [--service-name NAME] [--repo-name NAME] [--skip-confirmation] [--skip-forensic]"
      exit 1
      ;;
  esac
done

secret_name="elarasign-master-key"

write_step() {
    echo ""
    echo "[$1] $2"
    echo "------------------------------------------------------------"
}

write_success() {
    echo "[OK] $1"
}

write_warning() {
    echo "[WARN] $1"
}

write_failure() {
    echo "[FAIL] $1"
}

test_command() {
    command -v "$1" >/dev/null 2>&1
}

# ==============================================================================
# BANNER
# ==============================================================================

echo ""
echo "============================================================"
echo "           elaraSign Cloud Run Setup Wizard                 "
echo "============================================================"
echo ""
echo "Project:  $project_id"
echo "Region:   $region"
echo "Service:  $service_name"
echo ""

if [ "$skip_confirmation" = false ]; then
    read -p "Continue with setup? (y/N): " confirm
    if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# ==============================================================================
# STEP 1: Check Prerequisites
# ==============================================================================

write_step "1/9" "Checking prerequisites"

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
    write_failure "gcloud CLI not found. Install from https://cloud.google.com/sdk/docs/install"
    exit 1
fi
write_success "gcloud CLI found"

if ! test_command npm; then
    write_failure "npm not found. Install Node.js from https://nodejs.org"
    exit 1
fi
write_success "npm found"

# Check gcloud auth
account=$($gcloud_cmd auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null)
if [ -z "$account" ]; then
    write_failure "Not logged in to gcloud. Run: gcloud auth login"
    exit 1
fi
write_success "Logged in as: $account"

# ==============================================================================
# STEP 2: Check/Create Project
# ==============================================================================

write_step "2/9" "Checking GCP project"

if ! $gcloud_cmd projects describe "$project_id" --format="value(projectId)" >/dev/null 2>&1; then
    write_warning "Project $project_id does not exist"
    read -p "Create project $project_id? (y/N): " create_project
    if [[ "$create_project" == "y" || "$create_project" == "Y" ]]; then
        echo "Creating project..."
        $gcloud_cmd projects create "$project_id" --name="elaraSign"
        write_success "Project created"
    else
        write_failure "Project creation cancelled"
        exit 1
    fi
else
    write_success "Project exists"
fi

# Set project
$gcloud_cmd config set project "$project_id"

# ==============================================================================
# STEP 3: Enable Required APIs
# ==============================================================================

write_step "3/9" "Enabling required APIs"

apis=(
    "run.googleapis.com"
    "secretmanager.googleapis.com"
    "cloudbuild.googleapis.com"
    "containerregistry.googleapis.com"
)

for api in "${apis[@]}"; do
    echo "Enabling $api..."
    $gcloud_cmd services enable "$api" --project="$project_id"
done

write_success "APIs enabled"

# ==============================================================================
# STEP 4: Create Service Account
# ==============================================================================

write_step "4/9" "Creating service account"

service_account_name="elarasign-deployer"
service_account_email="$service_account_name@$project_id.iam.gserviceaccount.com"

if ! gcloud iam service-accounts describe "$service_account_email" --project="$project_id" >/dev/null 2>&1; then
    $gcloud_cmd iam service-accounts create "$service_account_name" \
        --description="elaraSign deployment service account" \
        --display-name="elaraSign Deployer" \
        --project="$project_id"
    write_success "Service account created"
else
    write_success "Service account exists"
fi

# Grant roles
roles=(
    "roles/run.admin"
    "roles/secretmanager.admin"
    "roles/cloudbuild.builds.editor"
    "roles/storage.admin"
)

for role in "${roles[@]}"; do
    $gcloud_cmd projects add-iam-policy-binding "$project_id" \
        --member="serviceAccount:$service_account_email" \
        --role="$role" >/dev/null 2>&1
done

write_success "Roles granted"

# ==============================================================================
# STEP 5: Create Artifact Registry Repository
# ==============================================================================

write_step "5/9" "Creating Artifact Registry repository"

if ! gcloud artifacts repositories describe "$repo_name" --location="$region" --project="$project_id" >/dev/null 2>&1; then
    $gcloud_cmd artifacts repositories create "$repo_name" \
        --repository-format=docker \
        --location="$region" \
        --project="$project_id" \
        --description="elaraSign container images"
    write_success "Repository created"
else
    write_success "Repository exists"
fi

# ==============================================================================
# STEP 6: Setup Forensic Key (optional)
# ==============================================================================

if [ "$skip_forensic" = false ]; then
    write_step "6/9" "Setting up forensic master key"
    ./scripts/setup-forensic-key.sh --project-id "$project_id"
else
    write_step "6/9" "Skipping forensic key setup"
fi

# ==============================================================================
# STEP 7: Create deploy.config.json
# ==============================================================================

write_step "7/9" "Creating deploy.config.json"

config_file="$(dirname "$0")/../deploy.config.json"
if [ ! -f "$config_file" ]; then
    cat > "$config_file" << EOF
{
  "gcloud": {
    "project": "$project_id",
    "region": "$region",
    "configuration": "elarasign"
  },
  "service": {
    "name": "$service_name",
    "domain": "$service_name-$project_id.run.app"
  },
  "identity": {
    "organizationName": "elaraSign Service",
    "serviceEmail": "signing@openelara.org"
  }
}
EOF
    write_success "Config created"
else
    write_success "Config exists"
fi

# ==============================================================================
# STEP 8: Build and Deploy
# ==============================================================================

write_step "8/9" "Building and deploying"

echo "Building container image..."
$gcloud_cmd builds submit --config=cloudbuild.yaml --substitutions=SHORT_SHA=test --project="$project_id"

write_success "Deployment initiated"

# ==============================================================================
# STEP 9: Summary
# ==============================================================================

write_step "9/9" "Setup complete"

echo ""
echo "============================================================"
echo "           elaraSign Setup Complete!"
echo "============================================================"
echo ""
echo "Service URL: https://$service_name-$project_id.run.app"
echo ""
echo "Next steps:"
echo "  1. Test the service"
echo "  2. Run ./deploy.sh for future deployments"
echo ""