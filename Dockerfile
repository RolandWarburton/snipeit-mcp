FROM denoland/deno:2.6.8

WORKDIR /app

# Cache location baked into the image so the deno user can read it at runtime.
ENV DENO_DIR=/deno-dir

# Warm the dependency cache first for better layer reuse.
COPY deno.json deno.lock ./
COPY src/ ./src/
RUN deno cache src/main.ts && chown -R deno:deno /deno-dir /app

# Drop the root user shipped in the base image.
USER deno

# HTTP transport, bound to all interfaces so Traefik can reach it.
ENV MCP_TRANSPORT=http \
    MCP_HOST=0.0.0.0 \
    MCP_PORT=8080

EXPOSE 8080

CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "src/main.ts"]
