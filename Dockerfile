# Stage 1: Builder
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files and .npmrc
COPY package*.json ./
COPY .npmrc ./

# Install all dependencies (including devDependencies if needed for builds)
RUN npm install

# Copy application source code
COPY . .

# (Optional) If you have a build step (like TypeScript), it goes here
# RUN npm run build

# Prune devDependencies to keep the image small
RUN npm prune --production

# Stage 2: Production Runner
FROM node:22-alpine

# Install dumb-init and utilities for Alloy
RUN apk add --no-cache dumb-init wget unzip

# Download Grafana Alloy binary directly into the container
RUN wget https://github.com/grafana/alloy/releases/download/v1.0.0/alloy-linux-amd64.zip && \
    unzip alloy-linux-amd64.zip && \
    mv alloy-linux-amd64 /usr/local/bin/alloy && \
    chmod +x /usr/local/bin/alloy && \
    rm alloy-linux-amd64.zip

# Set working directory
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy only production node_modules and the built source code from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src

# Copy the Alloy config and our new startup script
COPY --from=builder /app/config.alloy ./config.alloy
COPY --from=builder /app/start.sh ./start.sh

# Ensure the script is executable
RUN chmod +x ./start.sh

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

# Expose the application port
EXPOSE 8080

# Use dumb-init as the entrypoint
ENTRYPOINT ["dumb-init", "--"]

# Start both Alloy and the Node app using the entrypoint script
CMD ["./start.sh"]
