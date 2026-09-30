FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=512
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system --gid 1001 academy && useradd --system --uid 1001 --gid academy academy
COPY --from=build --chown=academy:academy /app/.next/standalone ./
COPY --from=build --chown=academy:academy /app/.next/static ./.next/static
COPY --from=build --chown=academy:academy /app/public ./public
USER academy
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node","runtime-entrypoint.mjs"]
