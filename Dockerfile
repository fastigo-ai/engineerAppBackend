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

# Install dumb-init for proper process management and signal handling
RUN apk add --no-cache dumb-init

# Set working directory
WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Copy only production node_modules and the built source code from the builder stage
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src ./src

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
RUN chown -R appuser:appgroup /app
USER appuser

# Expose the application port
EXPOSE 8080

# Use dumb-init as the entrypoint
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["npm", "start"]
