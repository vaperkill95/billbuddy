# Build stage - React client
FROM node:20-alpine AS client-build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ ./
ARG REACT_APP_GOOGLE_CLIENT_ID
ENV REACT_APP_GOOGLE_CLIENT_ID=$REACT_APP_GOOGLE_CLIENT_ID
RUN npm run build

# Production stage - Express server
FROM node:20-alpine
WORKDIR /app

# Copy server files
COPY server/package*.json ./server/
RUN cd server && npm install --production

COPY server/ ./server/

# Copy built React app
COPY --from=client-build /app/client/build ./client/build

# Set environment
ENV NODE_ENV=production

EXPOSE 3001

CMD ["node", "server/index.js"]
