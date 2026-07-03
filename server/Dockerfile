FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/

RUN cd server && npm ci --omit=dev

FROM node:20-alpine AS runner

ENV NODE_ENV=production
WORKDIR /app/server

COPY --from=deps /app/server/node_modules ./node_modules
COPY server/package.json ./
COPY server/src ./src

EXPOSE 5000

CMD ["npm", "start"]
