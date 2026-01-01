#!/bin/bash

# Navigate to the project directory on the server
cd /root/1fi-scraper

# Use node from path or specified location
# Since we are on a different server, 'node' should be in the PATH
# or we can use $(which node) to be safe if run manually once.
# Find node path reliably
NODE_PATH=$(which node)

# Fallback paths for common installations (NVM, /usr/local/bin, /usr/bin)
if [ -z "$NODE_PATH" ]; then
    PATHS=("/root/.nvm/versions/node/$(ls /root/.nvm/versions/node/ 2>/dev/null | tail -n 1)/bin/node" "/usr/local/bin/node" "/usr/bin/node")
    for path in "${PATHS[@]}"; do
        if [ -f "$path" ]; then
            NODE_PATH="$path"
            break
        fi
    done
fi

if [ -z "$NODE_PATH" ]; then
    echo "ERROR: node not found. Please set NODE_PATH manually in cron_runner.sh" >> scraper.log
    exit 1
fi

echo "Running with Node: $NODE_PATH" >> scraper.log

# Run the scraper
# We use --env-file to load variables from .env automatically (Node 20+)
$NODE_PATH --env-file=.env voltmoney-login.js >> scraper.log 2>&1

# Check if the scraper completed successfully
if [ $? -eq 0 ]; then
    echo "Scraper completed successfully at $(date)" >> scraper.log
else
    echo "Scraper failed at $(date)" >> scraper.log
fi
