#!/bin/sh

# Launch Grafana Alloy in the background
# Output logs to standard out so we can see them in DigitalOcean
echo "Starting Grafana Alloy..."
alloy run config.alloy &

# Launch the Node.js application in the foreground
echo "Starting Node.js server..."
exec npm start
