FROM oven/bun:1.3.6
WORKDIR /app
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile
COPY . .
RUN bun --filter=@aviary/web run build
EXPOSE 3000
CMD ["bun", "--filter=@aviary/web", "run", "start"]
