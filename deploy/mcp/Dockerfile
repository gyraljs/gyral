# Node 24 on Debian trixie: an exact patch release at least two weeks old, pinned by its
# multi-arch index digest (docs/design-docs/0032-dependency-updates.md). Move it with the
# dependency updates; `--build-arg NODE_IMAGE=...` overrides it for one build.
ARG NODE_IMAGE=node:24.22.0-trixie-slim@sha256:a6155384446670e9719bdc4fd0ebe4d4b29fb32a8d6aa523da3547a6cfbcf22c
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
