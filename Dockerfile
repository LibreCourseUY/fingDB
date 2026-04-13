FROM python:3.12-slim

WORKDIR /app

RUN mkdir -p /app/data
RUN chmod -R 777 /app/data

RUN pip install uv

COPY pyproject.toml uv.lock ./
RUN uv sync

COPY . .

RUN chmod +x entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["./entrypoint.sh"]