#!/bin/bash
# Verify project setup

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "🔍 Verifying AR Object Detection Project Setup..."
echo ""

CHECKS=0
PASSED=0

# Check Python
echo -n "Python 3.10+: "
if command -v python3 &> /dev/null && python3 -c "import sys; assert sys.version_info >= (3, 10)"; then
    echo -e "${GREEN}✓${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗${NC}"
fi
((CHECKS++))

# Check Node.js
echo -n "Node.js 16+: "
if command -v node &> /dev/null && node -v | grep -E "v(1[6-9]|[2-9][0-9])"; then
    echo -e "${GREEN}✓${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠${NC} (only needed for frontend)"
fi
((CHECKS++))

# Check Redis
echo -n "Redis: "
if command -v redis-cli &> /dev/null || docker ps 2>/dev/null | grep -q redis; then
    echo -e "${GREEN}✓${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠${NC} (will start in dev.sh)"
fi
((CHECKS++))

# Check Docker
echo -n "Docker: "
if command -v docker &> /dev/null && docker --version &> /dev/null; then
    echo -e "${GREEN}✓${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠${NC} (optional, can run locally)"
fi
((CHECKS++))

# Check NVIDIA GPU
echo -n "NVIDIA GPU (CUDA): "
if command -v nvidia-smi &> /dev/null; then
    echo -e "${GREEN}✓${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗${NC}"
fi
((CHECKS++))

echo ""
echo "Project Files:"
echo -n "Backend: "
if [ -f "backend/main.py" ]; then
    echo -e "${GREEN}✓${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗${NC}"
fi
((CHECKS++))

echo -n "Workers: "
if [ -f "workers/detector.py" ]; then
    echo -e "${GREEN}✓${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗${NC}"
fi
((CHECKS++))

echo -n "Frontend: "
if [ -f "frontend/package.json" ]; then
    echo -e "${GREEN}✓${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗${NC}"
fi
((CHECKS++))

echo -n "Training: "
if [ -f "training/train.py" ]; then
    echo -e "${GREEN}✓${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗${NC}"
fi
((CHECKS++))

echo -n "Documentation: "
if [ -f "README.md" ] && [ -f "GETTING_STARTED.md" ]; then
    echo -e "${GREEN}✓${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗${NC}"
fi
((CHECKS++))

echo ""
echo "Result: $PASSED/$CHECKS checks passed"
echo ""

if [ $PASSED -eq $CHECKS ]; then
    echo -e "${GREEN}✨ All systems ready!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Read GETTING_STARTED.md"
    echo "2. Run: ./dev.sh"
    echo "3. Open: http://localhost:3000"
else
    echo -e "${YELLOW}⚠️  Some checks failed or skipped${NC}"
    echo ""
    echo "Missing CUDA? Install:"
    echo "  pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121"
    echo ""
    echo "Missing Redis? Install:"
    echo "  brew install redis  # macOS"
    echo "  sudo apt-get install redis-server  # Ubuntu/Debian"
fi
