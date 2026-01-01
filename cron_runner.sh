#!/bin/bash

# Navigate to the project directory
cd /home/neoweave/Desktop/1fi/scraper

# Use the specific node version (Virtual Env)
# Path found: /home/neoweave/.nvm/versions/node/v22.20.0/bin/node
NODE_PATH="/home/neoweave/.nvm/versions/node/v22.20.0/bin/node"

# Run the scraper
# We use --env-file to load variables from .env automatically (Node 20+)
$NODE_PATH --env-file=.env voltmoney-login.js >> scraper.log 2>&1

# Check if the scraper completed successfully
if [ $? -eq 0 ]; then
    echo "Scraper completed successfully at $(date)" >> scraper.log
else
    echo "Scraper failed at $(date)" >> scraper.log
fi
