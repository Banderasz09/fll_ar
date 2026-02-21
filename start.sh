#!/bin/bash
# Start Redis in the background (if not using Docker)
redis-server &
REDIS_PID=$!

echo "✓ Redis started (PID: $REDIS_PID)"

# Wait a moment for Redis to start
sleep 2

# Start backend server
echo "Starting backend server..."
cd "$(dirname "$0")"
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
BACKEND_PID=$!

echo "✓ Backend started (PID: $BACKEND_PID)"
sleep 2

# Start worker(s)
NUM_WORKERS=${1:-2}
echo "Starting $NUM_WORKERS worker(s)..."

for i in $(seq 1 $NUM_WORKERS); do
    echo "Starting worker $i..."
    rq worker -u redis://localhost:6379/0 --with-scheduler &
done

echo "✓ All services started!"
echo "Backend: http://localhost:8000"
echo "Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services"

# Keep script running
trap "kill $REDIS_PID $BACKEND_PID; exit" INT
wait
