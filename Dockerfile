FROM node:22

# Install dependencies and Ngrok
RUN apt-get update && \
    apt-get install -y curl unzip && \
    curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null && \
    echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | tee /etc/apt/sources.list.d/ngrok.list && \
    apt-get update && apt-get install ngrok

# Set working directory
WORKDIR /app

# Clone your repo
RUN git clone --single-branch --branch=feat/sse-server https://github.com/algolia/mcp-node.git ./mcp-sse

WORKDIR /app/mcp-sse

# Install npm packages and build
RUN npm install && npm run build

WORKDIR /app/mcp-sse/dist

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]

