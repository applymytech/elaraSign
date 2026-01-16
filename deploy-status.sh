#!/bin/bash

# elaraSign Deployment Status
#
# Shows the commands to check deployment status.
# User runs the commands manually for full control.

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
echo "  elaraSign - Deployment Status"
echo "========================================"
echo ""
echo "  Project: $gcloud_project"
echo "  Service: $service_name"
echo "  Region:  $region"
echo "  Domain:  $service_domain"
echo ""

echo "To check current traffic allocation:"
echo ""
echo "  gcloud run services describe $service_name --project=$gcloud_project --region=$region --format='table(status.traffic.revisionName,status.traffic.percent)'"
echo ""

echo "To list recent revisions:"
echo ""
echo "  gcloud run revisions list --service=$service_name --project=$gcloud_project --region=$region --limit=5"
echo ""

echo "To check service health:"
echo ""
echo "  curl https://$service_domain/health"
echo ""

echo "To view logs:"
echo ""
echo "  gcloud run services logs read $service_name --project=$gcloud_project --region=$region --limit=50"
echo ""