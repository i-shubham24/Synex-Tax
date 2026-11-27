# Protean FVU 1.2 in an isolated container: non-root, no network (run with --network none
# and --read-only), one statement per run. The Protean files are not in git: put the contents
# of TDS_STANDALONE_FVU_1.2.zip in ./protean (see docs/procurement/protean-fvu.md). The build
# fails if any file differs from protean.sha256, so a changed or tampered JAR cannot slip in.
FROM eclipse-temurin:21-jre-alpine

RUN addgroup -g 10001 fvuuser &&     adduser -u 10001 -G fvuuser -D -s /sbin/nologin fvuuser

WORKDIR /opt/protean/fvu-1.2
COPY protean/ /opt/protean/fvu-1.2/
COPY protean.sha256 /opt/protean/fvu-1.2/protean.sha256
RUN sha256sum -c /opt/protean/fvu-1.2/protean.sha256 && chmod -R a-w /opt/protean/fvu-1.2

COPY fvu-runner.sh /app/fvu-runner.sh
RUN chmod 0555 /app/fvu-runner.sh

ENV JAVA_TOOL_OPTIONS="-Djava.awt.headless=true"
USER fvuuser:fvuuser
ENTRYPOINT ["/app/fvu-runner.sh"]
