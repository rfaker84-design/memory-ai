"""
CosyVoice engine wrapper for voice cloning.
Supports both real CosyVoice inference and a mock mode for testing.
"""

import logging
import os
import subprocess
import sys
from pathlib import Path
from typing import Optional

logger = logging.getLogger("cosyvoice-engine")


class CosyVoiceEngine:
    """Wrapper around CosyVoice for voice cloning."""

    def __init__(self, output_dir: str = "/tmp/voice-models"):
        self.output_dir = Path(output_dir)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self._check_availability()

    def _check_availability(self) -> bool:
        """Check if CosyVoice is installed and available."""
        try:
            result = subprocess.run(
                [sys.executable, "-c", "from cosyvoice.cli.cosyvoice import CosyVoice2"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                logger.info("CosyVoice2 is available")
                return True
        except Exception:
            pass

        # Try CosyVoice v1
        try:
            result = subprocess.run(
                [sys.executable, "-c", "from cosyvoice.cli.cosyvoice import CosyVoice"],
                capture_output=True, text=True, timeout=10
            )
            if result.returncode == 0:
                logger.info("CosyVoice v1 is available")
                return True
        except Exception:
            pass

        logger.warning("CosyVoice not found, using mock mode")
        return False

    def clone_voice(
        self,
        audio_path: str,
        output_path: str,
        speaker_name: str = "speaker",
        text: str = "",
    ) -> str:
        """
        Clone voice from audio sample and save model.
        Falls back to mock mode if CosyVoice is not installed.
        """
        audio_file = Path(audio_path)
        if not audio_file.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")

        output_dir = Path(output_path)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Try real CosyVoice inference
        if self._check_availability():
            return self._real_clone(audio_path, output_path, speaker_name, text)
        else:
            return self._mock_clone(audio_path, output_path, speaker_name)

    def _real_clone(self, audio_path: str, output_path: str, speaker_name: str, text: str = "") -> str:
        """Run real CosyVoice voice cloning."""
        # CosyVoice CLI command
        cmd = [
            sys.executable, "-m", "cosyvoice.cli.cosyvoice",
            "--mode", "3s????",
            "--audio", audio_path,
            "--text", text or "????????????????????",
            "--output", output_path,
            "--speaker", speaker_name,
        ]

        logger.info(f"Running CosyVoice: {' '.join(cmd)}")
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            logger.error(f"CosyVoice stderr: {result.stderr}")
            raise RuntimeError(f"CosyVoice failed: {result.stderr[-200:]}")

        logger.info(f"CosyVoice output: {result.stdout[-200:]}")
        return output_path

    def _mock_clone(self, audio_path: str, output_path: str, speaker_name: str) -> str:
        """
        Mock voice cloning for development/testing.
        Creates a placeholder model file with audio metadata.
        """
        import json
        import shutil

        audio_file = Path(audio_path)
        output_dir = Path(output_path)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Copy audio as placeholder model
        model_file = output_dir / f"{speaker_name}.pt"
        metadata = {
            "speaker": speaker_name,
            "source_audio": str(audio_file),
            "sample_rate": 16000,
            "model_type": "cosyvoice_mock",
            "created_at": str(audio_file.stat().st_mtime),
        }

        # Create a dummy model file
        model_file.write_bytes(audio_file.read_bytes()[:1024] + b"MOCK_MODEL")

        # Write metadata
        meta_file = output_dir / "metadata.json"
        meta_file.write_text(json.dumps(metadata, indent=2, ensure_ascii=False))

        logger.info(f"Mock clone complete: {output_path}")
        return output_path
