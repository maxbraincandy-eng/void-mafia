# Railway build context: repo root (.)
# Dockerfile path:       coturn/Dockerfile
FROM coturn/coturn:latest

COPY coturn/run.sh /run.sh
RUN chmod +x /run.sh

ENTRYPOINT ["/run.sh"]
