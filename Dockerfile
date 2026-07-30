# Barnebingo trenger én varm, langlevd prosess: rommene bor i minnet, og
# Socket.IO holder forbindelsen åpen hele runden. Derfor en vanlig container
# framfor en funksjon som skaleres til null.

FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Kjøretiden trenger ikke Playwright og resten av testverktøyet.
FROM node:24-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY package.json next.config.ts tsconfig.json server.ts ./
COPY src ./src

EXPOSE 8080
CMD ["npm", "start"]
