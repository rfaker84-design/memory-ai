FROM pytorch/pytorch:2.5.1-cuda12.4-cudnn9-runtime

RUN apt-get update && apt-get install -y \
    ffmpeg sox libsox-dev git curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install CosyVoice
RUN git clone https://github.com/FunAudioLLM/CosyVoice.git /tmp/CosyVoice && \
    cd /tmp/CosyVoice && pip install -e . --no-cache-dir

COPY server.py cosyvoice_engine.py cos_uploader.py ./

ENV PORT=8081
EXPOSE 8081

CMD ["python", "server.py"]
