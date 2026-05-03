# ---- Builder stage ----
# Installs all dependencies into a virtual environment
FROM python:3.11-slim AS builder

WORKDIR /app

# Install build tools needed for some Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Create and activate a virtual environment
RUN python -m venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Install dependencies first (layer-cached unless requirements.txt changes)
COPY requirements.txt .
RUN pip install --upgrade pip --quiet \
    && pip install --no-cache-dir -r requirements.txt

# ---- Production stage ----
FROM python:3.11-slim AS production

WORKDIR /app

# Copy the virtual environment from the builder stage
COPY --from=builder /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Copy application source only — no tests, no dev files
COPY app/ ./app/

# GEMINI_API_KEY and MCP_BASE_URL must be supplied at runtime.
# Never bake secrets into the image.
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
