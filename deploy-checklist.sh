#!/bin/bash

# elaraSign Pre-Deploy Checklist
#
# Human-controlled checkpoints before deployment.
# Simple prompts, logged decisions, no complex automation.
#
# PURPOSE:
# - Version control with human decision
# - Documentation honesty check
# - AI/Engineer accountability
# - Intentional deployments, not accidental ones

set -e

# Parse arguments
skip_version_bump=false
skip_doc_check=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-version-bump)
      skip_version_bump=true
      shift
      ;;
    --skip-doc-check)
      skip_doc_check=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--skip-version-bump] [--skip-doc-check]"
      exit 1
      ;;
  esac
done

# Load current version
package_path="$(dirname "$0")/package.json"
current_version=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$package_path', 'utf8')).version)")

echo ""
echo "========================================"
echo "  elaraSign Pre-Deploy Checklist"
echo "========================================"
echo ""
echo "  Current version: $current_version"
echo ""

# ============================================================================
# VERSION BUMP (Human Decision)
# ============================================================================
if [ "$skip_version_bump" = false ]; then
    echo "[VERSION] Do you want to bump the version?"
    echo ""
    echo "  [1] Patch  +0.0.1  (bug fixes, minor tweaks)"
    echo "  [2] Minor  +0.1.0  (new features, non-breaking)"
    echo "  [3] Major  +1.0.0  (breaking changes, major release)"
    echo "  [N] No change (keep $current_version)"
    echo ""
    read -p "Choice (1/2/3/N): " version_choice
    
    IFS='.' read -r major minor patch <<< "$current_version"
    new_version="$current_version"
    version_bumped=false
    
    case "${version_choice^^}" in
        1)
            patch=$((patch + 1))
            new_version="$major.$minor.$patch"
            version_bumped=true
            ;;
        2)
            minor=$((minor + 1))
            patch=0
            new_version="$major.$minor.$patch"
            version_bumped=true
            ;;
        3)
            major=$((major + 1))
            minor=0
            patch=0
            new_version="$major.$minor.$patch"
            version_bumped=true
            ;;
        *)
            echo "      Keeping version: $current_version"
            ;;
    esac
    
    if [ "$version_bumped" = true ]; then
        # Update package.json
        sed -i "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" "$package_path"
        echo "      Version bumped: $current_version -> $new_version"
    fi
    echo ""
fi

# ============================================================================
# DOCUMENTATION HONESTY CHECK (Human Decision)
# ============================================================================
if [ "$skip_doc_check" = false ]; then
    echo "[DOCS] Is the documentation up to date?"
    echo ""
    echo "  Consider: README.md, DEPLOYMENT.md, code comments,"
    echo "  API documentation, user guides, etc."
    echo ""
    read -p "Documentation is current? (Y/n): " docs_choice
    
    if [[ "${docs_choice^^}" == "N" ]]; then
        echo ""
        echo "  Documentation marked as STALE."
        echo ""
        echo "  [1] Proceed anyway (intentional - 'let me get this working first')"
        echo "  [2] Proceed anyway (minor tweak - no doc changes needed)"
        echo "  [3] Stop and update documentation"
        echo ""
        read -p "Choice (1/2/3): " proceed_choice
        
        case "$proceed_choice" in
            1)
                echo "      Proceeding with stale docs (will update later)"
                doc_status="STALE_INTENTIONAL"
                ;;
            2)
                echo "      Proceeding (minor change, no doc update needed)"
                doc_status="NO_UPDATE_NEEDED"
                ;;
            *)
                echo ""
                echo "      Stopping. Update documentation, then run again."
                exit 0
                ;;
        esac
    else
        echo "      Documentation confirmed current."
        doc_status="CURRENT"
    fi
    echo ""
fi

# ============================================================================
# CHANGE SUMMARY (AI/Engineer Accountability)
# ============================================================================
echo "[CHANGES] What was done in this deployment?"
echo ""
echo "  Briefly describe what changed (for the log):"
echo "  (This holds AI copilots and engineers accountable)"
echo ""
read -p "Summary: " change_summary

echo ""
echo "[COMPLETENESS] Is this code complete or work-in-progress?"
echo ""
echo "  [1] Complete - Production ready, fully tested"
echo "  [2] Framework/Stubs - Structure in place, needs implementation"
echo "  [3] WIP - Work in progress, partially complete"
echo ""
read -p "Choice (1/2/3): " completeness_choice

case "$completeness_choice" in
    1) completeness="COMPLETE" ;;
    2) completeness="FRAMEWORK_STUBS" ;;
    *) completeness="WIP" ;;
esac

# ============================================================================
# LOG THE DECISIONS
# ============================================================================
log_dir="$(dirname "$0")/devdocs/deploy-logs"
mkdir -p "$log_dir"

timestamp=$(date +"%Y-%m-%d_%H-%M-%S")
log_file="$log_dir/deploy-$timestamp.log"

version_display="$current_version"
if [ "$version_bumped" = true ]; then
    version_display="$current_version -> $new_version"
fi

cat > "$log_file" << EOF
========================================
elaraSign Deploy Log
========================================
Timestamp:    $timestamp
Version:      $version_display
Documentation: $doc_status
Completeness: $completeness

CHANGE SUMMARY:
$change_summary

========================================
EOF

echo ""
echo "  Logged to: devdocs/deploy-logs/deploy-$timestamp.log"

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo "========================================"
echo "  PRE-DEPLOY CHECKLIST COMPLETE"
echo "========================================"
echo ""
echo "  Version:       $(if [ "$version_bumped" = true ]; then echo "$new_version"; else echo "$current_version"; fi)"
echo "  Documentation: $doc_status"
echo "  Completeness:  $completeness"
echo ""
echo "  Next: ./deploy-preview.sh"
echo ""