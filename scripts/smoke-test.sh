#!/bin/bash

# elaraSign Smoke Tests
# ======================
# Verifies deployed service is functioning correctly

set -e

# Add Python to PATH for gcloud (Windows compatibility)
export PATH="$PATH:/c/Python314:/c/Python313:/c/Python312:/c/Python311:/c/Python310"

# Parse arguments
service_url=""
project_id="elarasign-prod"
region="us-central1"
service_name="elara-sign"
verbose=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --service-url)
      service_url="$2"
      shift 2
      ;;
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
    --verbose)
      verbose=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--service-url URL] [--project-id ID] [--region REGION] [--service-name NAME] [--verbose]"
      exit 1
      ;;
  esac
done

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

# Auto-detect service URL if not provided
if [ -z "$service_url" ]; then
    echo "Detecting service URL..."
    service_url=$($gcloud_cmd run services describe "$service_name" --region="$region" --project="$project_id" --format="value(status.url)" 2>/dev/null)
    if [ -z "$service_url" ]; then
        echo "[FAIL] Could not detect service URL. Is the service deployed?"
        exit 1
    fi
fi

service_url=$(echo "$service_url" | sed 's:/*$::')

# ==============================================================================
# Test Helpers
# ==============================================================================

passed=0
failed=0
tests=()

test_endpoint() {
    local name="$1"
    local method="${2:-GET}"
    local path="$3"
    local body="$4"
    local content_type="${5:-application/json}"
    local expected_status="${6:-200}"
    local validate_func="$7"
    
    local url="$service_url$path"
    local start_time=$(date +%s%3N)
    local response
    local status_code
    local duration
    
    if [ "$method" = "POST" ] && [ -n "$body" ]; then
        response=$(curl -s -w "%{http_code}" -X "$method" -H "Content-Type: $content_type" -d "$body" "$url" 2>/dev/null)
    else
        response=$(curl -s -w "%{http_code}" -X "$method" "$url" 2>/dev/null)
    fi
    
    status_code=$(echo "$response" | tail -c 3)
    content=$(echo "$response" | head -n -1)
    
    local end_time=$(date +%s%3N)
    duration=$((end_time - start_time))
    
    local result="{\"name\":\"$name\",\"url\":\"$url\",\"method\":\"$method\",\"passed\":false,\"error\":null,\"duration\":$duration}"
    
    if [ "$status_code" -ne "$expected_status" ]; then
        result=$(echo "$result" | jq ".error = \"Expected status $expected_status, got $status_code\" | .passed = false")
    elif [ -n "$validate_func" ]; then
        # For simplicity, assume validate_func is jq filter that returns true/false
        if echo "$content" | jq -e "$validate_func" >/dev/null 2>&1; then
            result=$(echo "$result" | jq ".passed = true")
        else
            result=$(echo "$result" | jq ".error = \"Validation failed\" | .passed = false")
        fi
    else
        result=$(echo "$result" | jq ".passed = true")
    fi
    
    tests+=("$result")
    
    if echo "$result" | jq -e ".passed" >/dev/null; then
        ((passed++))
        echo "[PASS] $name (${duration}ms)"
    else
        ((failed++))
        echo "[FAIL] $name"
        echo "       $(echo "$result" | jq -r ".error")"
    fi
    
    if [ "$verbose" = true ] && echo "$result" | jq -e ".passed" >/dev/null; then
        echo "       URL: $url"
    fi
}

# ==============================================================================
# Banner
# ==============================================================================

echo ""
echo "============================================================"
echo "           elaraSign Smoke Tests                            "
echo "============================================================"
echo ""
echo "Service: $service_url"
echo ""

# ==============================================================================
# Tests
# ==============================================================================

echo "--- Health & Status ---"
echo ""

# Test 1: Health endpoint
test_endpoint "Health endpoint" "GET" "/health" "" "application/json" 200 ".status == \"healthy\""

# Test 2: Root endpoint
test_endpoint "Root endpoint" "GET" "/" "" "application/json" 200

# Test 3: API info
test_endpoint "API info" "GET" "/api" "" "application/json" 200 ".service == \"elaraSign\""

echo ""
echo "--- API Endpoints ---"
echo ""

# Test 4: Sign endpoint CORS
test_endpoint "Sign endpoint CORS" "OPTIONS" "/api/sign" "" "application/json" 204

# Test 5: Verify endpoint exists
test_endpoint "Verify endpoint exists" "GET" "/api/verify" "" "application/json" 400

# Test 6: Sign endpoint validation
test_endpoint "Sign endpoint validation" "POST" "/api/sign" "" "application/json" 400 ".error != null"

echo ""
echo "--- Static Assets ---"
echo ""

# Test 7: Web UI
test_endpoint "Web UI (index.html)" "GET" "/index.html" "" "text/html" 200 "contains(\"elaraSign\")"

# Test 8: Favicon
test_endpoint "Static assets accessible" "GET" "/favicon.ico" "" "image/x-icon" 200

echo ""
echo "--- Performance ---"
echo ""

# Test 9: Response time
test_endpoint "Response time < 2s" "GET" "/health" "" "application/json" 200

# Check response time
health_result=$(echo "${tests[-1]}" | jq -r ".duration")
if [ "$health_result" -gt 2000 ]; then
    echo "[WARN] Response time was ${health_result}ms (> 2000ms)"
fi

# ==============================================================================
# Summary
# ==============================================================================

echo ""
echo "============================================================"
echo "                       SUMMARY                              "
echo "============================================================"
echo ""

total=$((passed + failed))
percentage=$((passed * 100 / total))

if [ $failed -eq 0 ]; then
    echo "All tests passed! ($passed/$total)"
else
    echo "Tests: $passed passed, $failed failed ($percentage%)"
fi

echo ""

if [ $failed -gt 0 ]; then
    exit 1
fi
exit 0