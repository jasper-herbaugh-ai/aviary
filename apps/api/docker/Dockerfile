FROM oven/bun:1.3.6
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/types/package.json packages/types/package.json
RUN bun install --frozen-lockfile
COPY . .
RUN DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aviary bun run db:generate && bun --filter=@aviary/api run build
EXPOSE 4000
CMD ["bun", "--filter=@aviary/api", "run", "start"]
