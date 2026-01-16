#!/bin/bash

# elaraSign Preflight Check
#
# WORKFLOW:
# =========
# 1. New user runs: ./preflight.sh
#    - Creates gcloud configuration if needed
#    - Prompts for Google login if not authenticated
#    - Verifies project access
#    - Checks Node.js is installed
#
# 2. User runs: ./deploy.sh
#    - Runs tests (catches broken code)
#    - Builds TypeScript
#    - Deploys to Cloud Run
#
# All config is read from deploy.config.json - no hardcoded values.

set -e

# Add Python to PATH for gcloud (Windows compatibility)
export PATH="$PATH:/c/Python314:/c/Python313:/c/Python312:/c/Python311:/c/Python310"

# Load config
config_path="$(dirname "$0")/deploy.config.json"
if [ ! -f "$config_path" ]; then
    echo "ERROR: deploy.config.json not found!"
    echo ""
    echo "You need to set up your deployment configuration first."
    echo "Run: ./scripts/setup-wizard.sh"
    echo ""
    echo "This will create deploy.config.json with your GCP settings."
    exit 1
fi

# Use node to parse JSON since jq may not be available
gcloud_config=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.configuration)")
gcloud_account=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.account)")
gcloud_project=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.project)")

echo ""
echo "========================================"
echo "  elaraSign Preflight Check"
echo "========================================"
echo ""

all_good=true

# Check 1: gcloud CLI installed
echo "[1/5] Checking gcloud CLI..."

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
    echo "      FAIL - gcloud not found"
    echo "      Please install Google Cloud SDK and ensure it's in your PATH"
    echo "      Or add it to your bash PATH"
    all_good=false
else
    # Test if gcloud actually works
    if $gcloud_cmd --version &>/dev/null; then
        echo "      OK - gcloud found at $gcloud_cmd"
    else
        echo "      FAIL - gcloud found at $gcloud_cmd but not working"
        echo "      Error: $($gcloud_cmd --version 2>&1 | head -1)"
        all_good=false
    fi
fi

# Check 2: Configuration exists
echo "[2/5] Checking gcloud configuration..."
if $gcloud_cmd config configurations list --filter="name:$gcloud_config" 2>/dev/null | grep -q "$gcloud_config"; then
    echo "      OK - Configuration '$gcloud_config' exists"
else
    echo "      FAIL - Configuration '$gcloud_config' not found"
    echo "      Expected: $gcloud_config"
    echo "      Available configurations:"
    $gcloud_cmd config configurations list --format="value(name)" 2>/dev/null | sed 's/^/        - /' || echo "        (unable to list configurations)"
    echo "      To create: gcloud config configurations create $gcloud_config"
    all_good=false
fi

# Check 3: Account authenticated
echo "[3/5] Checking gcloud authentication..."
current_account=$($gcloud_cmd auth list --filter="status:ACTIVE" --format="value(account)" 2>/dev/null)
if [ -n "$current_account" ] && [ "$current_account" = "$gcloud_account" ]; then
    echo "      OK - Authenticated as $gcloud_account"
elif [ -n "$current_account" ]; then
    echo "      FAIL - Wrong account authenticated"
    echo "      Expected: $gcloud_account"
    echo "      Current:  $current_account"
    echo "      To switch: gcloud auth login $gcloud_account"
    all_good=false
else
    echo "      FAIL - Not authenticated"
    echo "      Expected: $gcloud_account"
    echo "      To login: gcloud auth login $gcloud_account"
    all_good=false
fi

# Check 4: Project access
echo "[4/5] Checking project access..."
current_project=$($gcloud_cmd config get-value project 2>/dev/null)
if $gcloud_cmd projects describe "$gcloud_project" &>/dev/null; then
    echo "      OK - Access to project '$gcloud_project'"
    if [ "$current_project" != "$gcloud_project" ]; then
        echo "      Note: Current project is '$current_project', expected '$gcloud_project'"
        echo "      To switch: gcloud config set project $gcloud_project"
    fi
else
    echo "      FAIL - No access to project '$gcloud_project'"
    echo "      Expected: $gcloud_project"
    if [ -n "$current_project" ]; then
        echo "      Current:  $current_project"
    else
        echo "      Current:  (none set)"
    fi
    echo "      Make sure you have access to this project or create it first"
    all_good=false
fi

# Check 5: Node.js installed
echo "[5/5] Checking Node.js..."
if command -v node &> /dev/null; then
    node_version=$(node -v | sed 's/v//')
    echo "      OK - Node.js $node_version"
else
    echo "      FAIL - Node.js not found"
    all_good=false
fi

echo ""
if [ "$all_good" = true ]; then
    echo "========================================"
    echo "  All checks passed!"
    echo "========================================"
    echo ""
    echo "Ready to deploy with: ./deploy.sh"
else
    echo "========================================"
    echo "  Some checks failed!"
    echo "========================================"
    echo ""
    echo "Please fix the issues above before deploying."
    exit 1
fi