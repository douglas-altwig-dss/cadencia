FROM node:24-alpine AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# The base image runs every executable script here before starting nginx.
COPY --chmod=755 docker-entrypoint.d/ /docker-entrypoint.d/
COPY --from=build /web/dist /usr/share/nginx/html
EXPOSE 80
