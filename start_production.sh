#!/bin/bash
# Production startup script

set -e

echo "Starting AR Object Detection Services..."

# Load environment
export $(cat .env | xargs)

# Start Redis
echo "Starting Redis..."
redis-server --daemonize yes --dir ./data

# Start backend
echo "Starting backend server..."
SSL_ARGS=""
if [[ -n "${SSL_CERT_FILE:-}" && -n "${SSL_KEY_FILE:-}" ]]; then
    SSL_ARGS="--ssl-certfile $SSL_CERT_FILE --ssl-keyfile $SSL_KEY_FILE"
elif [[ -f ./ssl/cert.pem && -f ./ssl/key.pem ]]; then
    SSL_ARGS="--ssl-certfile ./ssl/cert.pem --ssl-keyfile ./ssl/key.pem"
fi

python -m uvicorn backend.main:app --host 0.0.0.0 --port $BACKEND_PORT $SSL_ARGS &
BACKEND_PID=$!

# Start workers
echo "Starting detection workers (2 instances)..."
for i in {1..2}; do
    rq worker -u redis://localhost:$REDIS_PORT/$REDIS_DB --with-scheduler &
done

echo "✓ All services started!"
echo "Backend: http://0.0.0.0:$BACKEND_PORT"

trap "kill $BACKEND_PID; exit" INT TERM
wait
