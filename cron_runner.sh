#!/bin/bash

# Navigate to the project directory on the server
cd /root/1fi-scraper

# Use node from path or specified location
# Since we are on a different server, 'node' should be in the PATH
# or we can use $(which node) to be safe if run manually once.
NODE_PATH=$(which node)

# Run the scraper
# We use --env-file to load variables from .env automatically (Node 20+)
$NODE_PATH --env-file=.env voltmoney-login.js >> scraper.log 2>&1

# Check if the scraper completed successfully
if [ $? -eq 0 ]; then
    echo "Scraper completed successfully at $(date)" >> scraper.log
else
    echo "Scraper failed at $(date)" >> scraper.log
fi
