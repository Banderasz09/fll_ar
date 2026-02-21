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
python -m uvicorn backend.main:app --host 0.0.0.0 --port $BACKEND_PORT &
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
