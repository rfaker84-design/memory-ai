"""
MemoryAI Voice Clone Worker
FastAPI server that wraps CosyVoice / GPT-SoVITS for voice cloning.
"""

import asyncio
import hashlib
import logging
import os
import time
from pathlib import Path
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from cos_uploader import COSUploader
from cosyvoice_engine import CosyVoiceEngine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voice-clone-worker")

app = FastAPI(title="MemoryAI Voice Clone Worker", version="1.0.0")

# Configuration
VOICE_SAMPLE_DIR = Path(os.getenv("VOICE_SAMPLE_DIR", "/tmp/voice-samples"))
OUTPUT_DIR = Path(os.getenv("OUTPUT_DIR", "/tmp/voice-models"))
CALLBACK_BASE_URL = os.getenv("CALLBACK_BASE_URL", "")
COS_BUCKET = os.getenv("COS_BUCKET", "")
COS_REGION = os.getenv("COS_REGION", "ap-guangzhou")
COS_SECRET_ID = os.getenv("COS_SECRET_ID", "")
COS_SECRET_KEY = os.getenv("COS_SECRET_KEY", "")

VOICE_SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

# In-memory job store (use Redis/DB in production)
jobs: dict[str, dict] = {}

# Lazy-loaded engine
engine: Optional[CosyVoiceEngine] = None
cos_uploader: Optional[COSUploader] = None


class CreateJobRequest(BaseModel):
    job_id: str
    memory_id: str
    voice_sample_url: str
    name: str = ""
    relationship: str = ""
    speech_style: str = ""
    callback_url: str = ""


class JobStatus(BaseModel):
    job_id: str
    status: str  # pending, processing, succeeded, failed
    progress: int  # 0-100
    output_url: Optional[str] = None
    error: Optional[str] = None


async def download_file(url: str, dest: Path) -> bool:
    """Download a file from URL to local path."""
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            response = await client.get(url, follow_redirects=True)
            response.raise_for_status()
            dest.write_bytes(response.content)
            logger.info(f"Downloaded {len(response.content)} bytes to {dest}")
            return True
    except Exception as e:
        logger.error(f"Download failed: {e}")
        return False


async def run_clone_job(job_id: str, request: CreateJobRequest):
    """Run voice cloning in background."""
    global engine, cos_uploader

    try:
        jobs[job_id]["status"] = "processing"
        jobs[job_id]["progress"] = 10

        # Step 1: Download voice sample
        sample_path = VOICE_SAMPLE_DIR / f"{job_id}.mp3"
        jobs[job_id]["progress"] = 20
        success = await download_file(request.voice_sample_url, sample_path)
        if not success:
            raise Exception("Failed to download voice sample")

        # Step 2: Run voice cloning
        jobs[job_id]["progress"] = 30

        if engine is None:
            engine = CosyVoiceEngine(output_dir=str(OUTPUT_DIR))
            logger.info("CosyVoice engine initialized")

        output_path = OUTPUT_DIR / f"{job_id}_model"
        await asyncio.to_thread(
            engine.clone_voice,
            audio_path=str(sample_path),
            output_path=str(output_path),
            speaker_name=request.name or request.memory_id,
        )
        jobs[job_id]["progress"] = 80

        # Step 3: Upload model to COS
        model_url = None
        if cos_uploader or (COS_SECRET_ID and COS_SECRET_KEY and COS_BUCKET):
            if cos_uploader is None:
                cos_uploader = COSUploader(
                    secret_id=COS_SECRET_ID,
                    secret_key=COS_SECRET_KEY,
                    bucket=COS_BUCKET,
                    region=COS_REGION,
                )
            model_url = cos_uploader.upload_file(
                local_path=str(output_path),
                cos_key=f"voice-models/{job_id}",
            )
            logger.info(f"Model uploaded to: {model_url}")

        jobs[job_id]["status"] = "succeeded"
        jobs[job_id]["progress"] = 100
        jobs[job_id]["output_url"] = model_url

        # Step 4: Callback to Next.js
        if request.callback_url:
            await send_callback(request.callback_url, job_id, "succeeded", model_url)

        # Cleanup
        if sample_path.exists():
            sample_path.unlink()

    except Exception as e:
        logger.error(f"Job {job_id} failed: {e}")
        jobs[job_id]["status"] = "failed"
        jobs[job_id]["progress"] = 0
        jobs[job_id]["error"] = str(e)

        if request.callback_url:
            await send_callback(request.callback_url, job_id, "failed", error=str(e))


async def send_callback(url: str, job_id: str, status: str, output_url: str = "", error: str = ""):
    """Notify Next.js app of job completion."""
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.post(url, json={
                "job_id": job_id,
                "status": status,
                "output_url": output_url,
                "error": error,
            })
    except Exception as e:
        logger.error(f"Callback failed: {e}")


@app.get("/health")
async def health():
    return {"status": "ok", "provider": "cosyvoice"}


@app.post("/jobs")
async def create_job(request: CreateJobRequest):
    """Create a new voice clone job."""
    if request.job_id in jobs:
        raise HTTPException(status_code=409, detail="Job already exists")

    jobs[request.job_id] = {
        "job_id": request.job_id,
        "status": "pending",
        "progress": 0,
        "output_url": None,
        "error": None,
        "created_at": time.time(),
    }

    # Start processing in background
    asyncio.create_task(run_clone_job(request.job_id, request))

    return {
        "provider_job_id": request.job_id,
        "status": "pending",
        "progress": 0,
    }


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get job status."""
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@app.get("/jobs")
async def list_jobs():
    """List all jobs."""
    return {"jobs": list(jobs.values())}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("PORT", "8081")))
