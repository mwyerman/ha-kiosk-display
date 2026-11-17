FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run test:server && npm run check && npm run build

FROM node:24-alpine AS development
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev"]

# Explicit preview target: static fixtures served by nginx, not the Vite dev server.
FROM build AS fixture-build
RUN npm run build -- --mode fixture --outDir dist-fixture

FROM nginxinc/nginx-unprivileged:stable-alpine AS fixture
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=fixture-build /app/dist-fixture /usr/share/nginx/html
EXPOSE 8080

# Keep production last so an unqualified docker build never enables fixtures.
FROM node:24-alpine AS production
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 SESSION_DB=/data/kiosk.sqlite STATIC_DIR=/app/dist
WORKDIR /app
COPY --chown=node:node server ./server
COPY --from=build --chown=node:node /app/dist ./dist
RUN mkdir /data && chown node:node /data
USER node
EXPOSE 8080
CMD ["node", "server/index.mjs"]
