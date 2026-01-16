#!/bin/bash

# elaraSign Promote Preview to Live
#
# Shows the commands to promote the preview revision to live.
# User runs the commands manually for full control.
#
# USAGE:
# ======
# ./deploy-promote.sh

set -e

# Load config
config_path="$(dirname "$0")/deploy.config.json"
if [ ! -f "$config_path" ]; then
    echo "ERROR: deploy.config.json not found"
    exit 1
fi

gcloud_project=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.project)")
region=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).gcloud.region)")
service_name=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).service.name)")
service_domain=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$config_path', 'utf8')).service.domain)")

echo ""
echo "========================================"
echo "  elaraSign - Promote to Live"
echo "========================================"
echo ""
echo "  Project: $gcloud_project"
echo "  Service: $service_name"
echo "  Region:  $region"
echo "  Domain:  $service_domain"
echo ""

echo "To promote the latest revision to 100% traffic, run:"
echo ""
echo "  gcloud run services update-traffic $service_name --project=$gcloud_project --region=$region --to-latest"
echo ""

echo "To check current traffic allocation:"
echo ""
echo "  gcloud run services describe $service_name --project=$gcloud_project --region=$region --format='table(status.traffic.revisionName,status.traffic.percent)'"
echo ""

echo "To rollback to a specific revision:"
echo ""
echo "  gcloud run services update-traffic $service_name --project=$gcloud_project --region=$region --to-revisions=REVISION_NAME=100"
echo ""