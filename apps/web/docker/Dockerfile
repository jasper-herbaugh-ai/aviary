FROM oven/bun:1.3.6
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/playbooks/package.json packages/playbooks/package.json
COPY packages/proto/package.json packages/proto/package.json
RUN bun install --frozen-lockfile
COPY . .
RUN bun --filter=@aviary/web run build
EXPOSE 3000
CMD ["bun", "--filter=@aviary/web", "run", "start"]
