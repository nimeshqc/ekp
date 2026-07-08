# Build the SPA, then serve it from nginx (which also proxies /api).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# server config is mounted by docker-compose from nginx/nginx.conf
