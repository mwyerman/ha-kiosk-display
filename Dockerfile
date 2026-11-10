FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run check && npm run build

FROM node:22-alpine AS development
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
FROM nginxinc/nginx-unprivileged:stable-alpine AS production
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
