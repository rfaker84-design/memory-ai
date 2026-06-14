#!/bin/bash
# MemoryAI Voice Clone Worker Setup
# Run on a GPU server (Ubuntu 22.04+)

set -e

echo "=== Installing system dependencies ==="
apt-get update && apt-get install -y \
    python3.10 python3.10-venv python3-pip \
    ffmpeg sox libsox-dev \
    git curl wget

echo "=== Creating virtual environment ==="
python3.10 -m venv venv
source venv/bin/activate

echo "=== Installing Python packages ==="
pip install --upgrade pip
pip install -r requirements.txt

echo "=== Installing CosyVoice ==="
git clone https://github.com/FunAudioLLM/CosyVoice.git /tmp/CosyVoice || true
cd /tmp/CosyVoice
pip install -e .

echo "=== Downloading CosyVoice model ==="
python -c "
from modelscope import snapshot_download
snapshot_download('iic/CosyVoice2-0.5B', local_dir='./pretrained_models/CosyVoice2-0.5B')
"

echo "=== Setup complete ==="
echo "Start worker with: source venv/bin/activate && python server.py"
