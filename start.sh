#!/bin/sh

# Launch Grafana Alloy in the background
# It uses the config.alloy file provided in the same directory
echo "Starting Grafana Alloy..."
nohup alloy run config.alloy > /dev/null 2>&1 &

# Launch the Node.js application in the foreground
echo "Starting Node.js server..."
exec npm start
