#!/bin/bash

# elaraSign First-Time Setup
# Simple setup script to get you running quickly

echo ""
echo "========================================"
echo "  elaraSign First-Time Setup"
echo "========================================"
echo ""
echo "This script will check your environment and install dependencies."
echo ""

# Check Node.js
echo "[1/3] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "  FAIL - Node.js not found"
    echo "  Please install Node.js >=24.0.0 from https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
REQUIRED_VERSION="24.0.0"

if [ "$(printf '%s\n' "$NODE_VERSION" "$REQUIRED_VERSION" | sort -V | head -n1)" != "$REQUIRED_VERSION" ]; then
    echo "  FAIL - Node.js version $NODE_VERSION is too old"
    echo "  Please upgrade to Node.js >=24.0.0"
    exit 1
fi

echo "  OK - Node.js $NODE_VERSION"

# Check npm
echo "[2/3] Checking npm..."
if ! command -v npm &> /dev/null; then
    echo "  FAIL - npm not found"
    echo "  npm should come with Node.js"
    exit 1
fi

echo "  OK - npm $(npm -v)"

# Install dependencies
echo "[3/3] Installing dependencies..."
if npm install; then
    echo "  OK - Dependencies installed"
else
    echo "  FAIL - Failed to install dependencies"
    exit 1
fi

echo ""
echo "========================================"
echo "  Setup Complete!"
echo "========================================"
echo ""
echo "To start the development server:"
echo "  npm run dev"
echo ""
echo "To run tests:"
echo "  npm test"
echo ""
echo "Happy signing!"