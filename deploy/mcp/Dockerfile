# Supply the approved digest through --build-arg NODE_IMAGE=node:24-bookworm-slim@sha256:...
ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE}
COPY gyral-mcp.tgz /tmp/gyral-mcp.tgz
RUN npm install --global --omit=dev --ignore-scripts /tmp/gyral-mcp.tgz \
    && rm /tmp/gyral-mcp.tgz
ENV NODE_ENV=production GYRAL_MCP_BIND=0.0.0.0 PORT=3000
USER node
EXPOSE 3000
CMD ["gyral-mcp-http"]
