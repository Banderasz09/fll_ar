#!/bin/bash
# Start all services for development

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo -e "${BLUE}🚀 AR Object Detection - Development Setup${NC}"
echo ""

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${GREEN}Using local Python installation...${NC}"
    
    # Start Redis
    if ! pgrep -x "redis-server" > /dev/null; then
        echo -e "${BLUE}Starting Redis...${NC}"
        redis-server --daemonize yes
        sleep 2
    fi
    
    # Install Python dependencies
    if [ ! -d "venv" ]; then
        echo -e "${BLUE}Creating virtual environment...${NC}"
        python3 -m venv venv
    fi
    
    source venv/bin/activate
    
    echo -e "${BLUE}Installing Python dependencies...${NC}"
    pip install -q -r requirements.txt
    
    # Start backend
    echo -e "${BLUE}Starting backend server...${NC}"
    python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload &
    BACKEND_PID=$!
    
    # Start workers
    echo -e "${BLUE}Starting detection workers...${NC}"
    for i in {1..2}; do
        rq worker -u redis://localhost:6379/0 --with-scheduler &
    done
    
    echo ""
    echo -e "${GREEN}✓ All services started!${NC}"
    echo -e "Backend: ${BLUE}http://localhost:8000${NC}"
    echo -e "Docs: ${BLUE}http://localhost:8000/docs${NC}"
    echo ""
    echo "Press Ctrl+C to stop all services"
    
    wait $BACKEND_PID
else
    echo -e "${GREEN}Using Docker...${NC}"
    echo -e "${BLUE}Starting Docker Compose services...${NC}"
    docker-compose up
fi
