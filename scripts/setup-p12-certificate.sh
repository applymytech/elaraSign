#!/bin/bash

# elaraSign P12 Certificate Setup
# ================================
#
# Creates a self-signed P12 certificate and uploads to Google Secret Manager.
# Uses OpenSSL (should be available on most systems).
#
# USAGE:
#   ./scripts/setup-p12-certificate.sh
#
# PREREQUISITES:
#   - OpenSSL installed
#   - gcloud CLI authenticated
#   - deploy.config.json exists (run setup.sh first)

set -e

# Add Python to PATH for gcloud (Windows compatibility)
export PATH="$PATH:/c/Python314:/c/Python313:/c/Python312:/c/Python311:/c/Python310"

# Parse arguments
force=false
skip_upload=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --force)
      force=true
      shift
      ;;
    --skip-upload)
      skip_upload=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--force] [--skip-upload]"
      exit 1
      ;;
  esac
done

# ============================================================================
# FIND OPENSSL
# ============================================================================

openssl_cmd=""
if command -v openssl &> /dev/null; then
    openssl_cmd="openssl"
else
    echo ""
    echo "ERROR: OpenSSL not found!"
    echo ""
    echo "Please install OpenSSL."
    echo ""
    exit 1
fi

echo ""
echo "========================================"
echo "  elaraSign P12 Certificate Setup"
echo "========================================"
echo ""
echo "  Using OpenSSL: $(which openssl)"

# ============================================================================
# LOAD CONFIG
# ============================================================================

config_path="$(dirname "$0")/../deploy.config.json"
if [ ! -f "$config_path" ]; then
    echo ""
    echo "ERROR: deploy.config.json not found!"
    echo "       Run ./setup.sh first"
    exit 1
fi

project_id=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.project)")
org_name=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).identity?.organizationName || 'elaraSign Service')")
service_email=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).identity?.serviceEmail || 'signing@openelara.org')")

echo "  Project: $project_id"
echo "  Organization: $org_name"
echo "  Email: $service_email"
echo ""

# ============================================================================
# CREATE CERTIFICATE
# ============================================================================

cert_dir="$(dirname "$0")/../certs"
mkdir -p "$cert_dir"

p12_file="$cert_dir/service.p12"
password_file="$cert_dir/service.password"
key_file="$cert_dir/key.pem"
cert_file="$cert_dir/cert.pem"

# Check if already exists
if [ -f "$p12_file" ] && [ "$force" = false ]; then
    echo "Certificate already exists at: $p12_file"
    echo "Use --force to regenerate"
    echo ""
    read -p "Continue with existing certificate? [Y/n]: " response
    if [[ "${response^^}" == "N" ]]; then
        exit 0
    fi
else
    echo "[1/4] Generating password..."
    
    # Generate a random password (64 hex chars)
    password=$(openssl rand -hex 32)
    echo -n "$password" > "$password_file"
    echo "      OK"
    
    echo "[2/4] Generating private key + certificate..."
    
    # Subject for certificate
    subject="/CN=$org_name/O=$org_name/emailAddress=$service_email"
    
    # Generate private key + self-signed certificate (valid 2 years)
    openssl req -x509 -newkey rsa:2048 -keyout "$key_file" -out "$cert_file" -days 730 -nodes -subj "$subject" >/dev/null 2>&1
    
    if [ $? -ne 0 ]; then
        echo "      FAILED"
        exit 1
    fi
    echo "      OK"
    
    echo "[3/4] Creating P12 bundle..."
    
    # Create P12 (PKCS#12) file
    openssl pkcs12 -export -out "$p12_file" -inkey "$key_file" -in "$cert_file" -password "pass:$password" >/dev/null 2>&1
    
    if [ $? -ne 0 ]; then
        echo "      FAILED"
        exit 1
    fi
    echo "      OK"
    
    echo "[4/4] Cleaning up intermediate files..."
    rm -f "$key_file" "$cert_file"
    echo "      OK"
    
    echo ""
    echo "Certificate created:"
    echo "  P12: $p12_file"
    echo "  Password: $password_file"
fi

# ============================================================================
# UPLOAD TO SECRET MANAGER
# ============================================================================

if [ "$skip_upload" = true ]; then
    echo ""
    echo "Skipping Secret Manager upload (--skip-upload)"
    exit 0
fi

echo ""
echo "========================================"
echo "  Uploading to Secret Manager"
echo "========================================"
echo ""

secret_p12="elarasign-p12-certificate"
secret_password="elarasign-p12-password"

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
    echo ""
    echo "ERROR: gcloud CLI not found!"
    echo "       Install from https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Activate gcloud config if set
gcloud_config=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.configuration || '')")
if [ -n "$gcloud_config" ]; then
    $gcloud_cmd config configurations activate "$gcloud_config" >/dev/null 2>&1
fi

# Read password
password=$(cat "$password_file")

# Create Base64 of P12
p12_base64=$(base64 -w 0 "$p12_file")

# Function to create or update a secret
set_secret() {
    local name="$1"
    local value="$2"
    
    if $gcloud_cmd secrets describe "$name" --project="$project_id" >/dev/null 2>&1; then
        echo "  Updating $name..."
        echo -n "$value" | $gcloud_cmd secrets versions add "$name" --project="$project_id" --data-file=- >/dev/null 2>&1
    else
        echo "  Creating $name..."
        $gcloud_cmd secrets create "$name" --project="$project_id" --replication-policy="automatic" >/dev/null 2>&1
        echo -n "$value" | $gcloud_cmd secrets versions add "$name" --project="$project_id" --data-file=- >/dev/null 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        echo "      OK"
    else
        echo "      FAILED"
    fi
}

set_secret "$secret_p12" "$p12_base64"
set_secret "$secret_password" "$password"

# ============================================================================
# GRANT ACCESS TO CLOUD RUN
# ============================================================================

echo ""
echo "Granting Cloud Run access to secrets..."

project_number=$($gcloud_cmd projects describe "$project_id" --format="value(projectNumber)")
service_account="$project_number-compute@developer.gserviceaccount.com"

echo "  Service account: $service_account"

for secret in "$secret_p12" "$secret_password"; do
    $gcloud_cmd secrets add-iam-policy-binding "$secret" \
        --member="serviceAccount:$service_account" \
        --role="roles/secretmanager.secretAccessor" \
        --project="$project_id" >/dev/null 2>&1
done
echo "      OK"

# ============================================================================
# DONE
# ============================================================================

echo ""
echo "========================================"
echo "  Certificate Setup Complete!"
echo "========================================"
echo ""
echo "  Secrets created in $project_id:"
echo "    - $secret_p12"
echo "    - $secret_password"
echo ""
echo "  NEXT: Update cloudbuild.yaml to use these secrets,"
echo "        then redeploy with: ./deploy.sh"
echo ""
echo "  Verify in console:"
echo "  https://console.cloud.google.com/security/secret-manager?project=$project_id"
echo ""