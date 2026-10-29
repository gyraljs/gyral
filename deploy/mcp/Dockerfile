# Node 24 on Debian trixie, pinned by its multi-arch index digest: a Node patch release at least
# two weeks old, the tag's newest rebuild (docs/design-docs/0032-dependency-updates.md). Security
# exception (owner, 2026-10-29): 24.22.1, released 2026-10-20, fixes CVE-2026-111497 (Brotli
# decoder overflow) and HTTP agent and TLS flaws, and this server is public, so it came in early.
# The exception ends on 2026-11-03. `--build-arg NODE_IMAGE=...` overrides it for one build.
ARG NODE_IMAGE=node:24.22.1-trixie-slim@sha256:89c5244bc22a9bc3287d89ebc7e49b9cb5bb84cd40e6175ac3421d5a9f68b95a
FROM ${NODE_IMAGE}
ARG SOURCE_REVISION=development
ARG CORPUS_VERSION=development
ARG CORPUS_SHA256=unknown
LABEL org.opencontainers.image.source="https://github.com/gyraljs/gyral" \
    org.opencontainers.image.description="Public read-only Gyral documentation MCP over Streamable HTTP" \
    org.opencontainers.image.licenses="MIT" \
    org.opencontainers.image.revision="${SOURCE_REVISION}" \
    dev.gyral.corpus.version="${CORPUS_VERSION}" \
    dev.gyral.corpus.sha256="${CORPUS_SHA256}"
COPY gyral-mcp.tgz /tmp/gyral-mcp.tgz
RUN npm install --global --omit=dev --ignore-scripts /tmp/gyral-mcp.tgz \
    && rm /tmp/gyral-mcp.tgz
ENV NODE_ENV=production GYRAL_MCP_BIND=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
# The public HTTP mode of the single `gyral-mcp` bin (0.3.2 had a separate `gyral-mcp-http`).
CMD ["gyral-mcp", "http"]
