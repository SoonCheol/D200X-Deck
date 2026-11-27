FROM python:3.13-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 STORE_DATA=/data
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt && groupadd -g 10001 store && useradd -r -u 10001 -g store -d /data store && mkdir /data && chown store:store /data
COPY server.py package_inspector.py signing.py ./
COPY web ./web
USER 10001:10001
EXPOSE 8080
CMD ["gunicorn","--bind","0.0.0.0:8080","--workers","1","--threads","2","--timeout","120","--worker-tmp-dir","/tmp","server:create_app()"]
