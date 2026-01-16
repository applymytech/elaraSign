#!/bin/bash

# elaraSign Emergency Rollback
#
# Shows the commands to rollback to a previous revision.
# User runs the commands manually for full control.
#
# USAGE:
# ======
# ./deploy-rollback.sh

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
echo "  elaraSign - Emergency Rollback"
echo "========================================"
echo ""
echo "  Project: $gcloud_project"
echo "  Service: $service_name"
echo "  Region:  $region"
echo ""

echo "To list available revisions:"
echo ""
echo "  gcloud run revisions list --service=$service_name --project=$gcloud_project --region=$region"
echo ""

echo "To rollback to a specific revision:"
echo ""
echo "  gcloud run services update-traffic $service_name --project=$gcloud_project --region=$region --to-revisions=REVISION_NAME=100"
echo ""

echo "To check current traffic allocation:"
echo ""
echo "  gcloud run services describe $service_name --project=$gcloud_project --region=$region --format='table(status.traffic.revisionName,status.traffic.percent)'"
echo ""

echo "Live URL: https://$service_domain"