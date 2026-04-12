FROM python:3.12-slim

WORKDIR /app

RUN mkdir -p /app/data
RUN chmod -R 777 /app/data

RUN pip install uv

COPY pyproject.toml uv.lock ./
RUN uv sync

COPY . .

EXPOSE 8080

CMD ["sh", "-c", "uv run dbwarden migrate && uv run uvicorn app.main:app --host 0.0.0.0 --port 8080"]