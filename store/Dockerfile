FROM python:3.13-slim@sha256:7249d5587b78209a006dc4a3b5340678f84ea729239193aa559962cd8c1fce50
ARG STORE_REVISION=unknown
LABEL org.opencontainers.image.title="DeckForge Store" org.opencontainers.image.version="0.1.15" org.opencontainers.image.revision=$STORE_REVISION
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 STORE_DATA=/data
WORKDIR /app
COPY requirements.txt .
RUN apt-get update && apt-get install -y --no-install-recommends librsvg2-bin util-linux && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir -r requirements.txt && pip check && groupadd -g 10001 store && useradd -r -u 10001 -g store -d /data store && mkdir /data && chown store:store /data
COPY server.py package_inspector.py signing.py folder_pack.py svg_raster.py verify_data.py ./
COPY web ./web
USER 10001:10001
EXPOSE 8080
CMD ["gunicorn","--bind","0.0.0.0:8080","--workers","1","--threads","2","--timeout","120","--worker-tmp-dir","/tmp","server:create_app()"]
