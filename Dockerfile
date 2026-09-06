FROM node:22-alpine

WORKDIR /app

# Install dependencies for Node & system
RUN apk add --no-cache curl

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Environment Defaults
ENV PORT=3000
ENV NODE_ENV=production
ENV DATA_DIR=/data

EXPOSE 3000

CMD ["npm", "start"]
