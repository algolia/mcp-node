#!/bin/bash

# Fail fast
set -e

# Configure Ngrok if token is provided
if [[ -n "$NGROK_AUTHTOKEN" ]]; then
  ngrok config add-authtoken "$NGROK_AUTHTOKEN"
else 
  echo "NGROK_AUTHTOKEN is not set" 1>&2
  exit 1
fi

# Authenticate the application
#./app authenticate

# Start your server in background
if [[ -n "$ALGOLIA_CREDS" ]]; then
  ./app start-server --credentials $ALGOLIA_CREDS --transport http &
else 
  echo "ALGOLIA_CREDS is not set" 1>&2
  exit 1
fi

# Start ngrok in background
ngrok http 4243 

# Wait a bit for ngrok to initialize
sleep 5

# Extract and print the public URL
curl --silent http://localhost:4040/api/tunnels | \
  grep -o 'https://[a-z0-9]*\.ngrok\.io' | \
  head -n 1

