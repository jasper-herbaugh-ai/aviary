FROM oven/bun:1.3.6
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/playbooks/package.json packages/playbooks/package.json
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aviary bun --filter=@aviary/db run prisma:generate && bun --filter=@aviary/api run build
EXPOSE 4000
EXPOSE 50051
CMD ["bun", "--filter=@aviary/api", "run", "start"]
