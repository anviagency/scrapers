#!/bin/bash

# Script to kill all running processes and restart the API server

echo "🛑 Killing all running processes..."

# Kill API server processes
pkill -f "ts-node.*server" 2>/dev/null
pkill -f "node.*server" 2>/dev/null
pkill -f "npm.*api" 2>/dev/null

# Kill scraper processes
pkill -f "ts-node.*index" 2>/dev/null
pkill -f "ts-node.*jobmaster" 2>/dev/null

# Wait a moment for processes to terminate
sleep 2

# Check if any processes are still running
REMAINING=$(ps aux | grep -E "ts-node.*server|node.*server|npm.*api" | grep -v grep | wc -l)
if [ "$REMAINING" -gt 0 ]; then
    echo "⚠️  Some processes still running, force killing..."
    ps aux | grep -E "ts-node.*server|node.*server|npm.*api" | grep -v grep | awk '{print $2}' | xargs kill -9 2>/dev/null
    sleep 1
fi

echo "✅ All processes killed"
echo "🚀 Starting API server..."

# Change to project directory and start API server
cd "$(dirname "$0")"
npm run api



