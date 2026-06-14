"""
Tencent Cloud COS uploader for voice models.
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger("cos-uploader")


class COSUploader:
    """Upload files to Tencent Cloud COS."""

    def __init__(self, secret_id: str, secret_key: str, bucket: str, region: str = "ap-guangzhou"):
        self.secret_id = secret_id
        self.secret_key = secret_key
        self.bucket = bucket
        self.region = region
        self.domain = f"https://{bucket}.cos.{region}.myqcloud.com"

    def upload_file(self, local_path: str, cos_key: str) -> str:
        """Upload a file to COS. Returns the public URL."""
        local = Path(local_path)

        if not local.exists():
            raise FileNotFoundError(f"File not found: {local_path}")

        try:
            from qcloud_cos import CosConfig, CosS3Client

            config = CosConfig(
                Region=self.region,
                SecretId=self.secret_id,
                SecretKey=self.secret_key,
            )
            client = CosS3Client(config)

            # Upload file or directory
            if local.is_file():
                with open(local_path, "rb") as f:
                    client.put_object(
                        Bucket=self.bucket,
                        Key=cos_key,
                        Body=f,
                    )
            else:
                # Upload directory contents
                for file_path in local.rglob("*"):
                    if file_path.is_file():
                        relative = file_path.relative_to(local)
                        key = f"{cos_key}/{relative.as_posix()}"
                        with open(file_path, "rb") as f:
                            client.put_object(
                                Bucket=self.bucket,
                                Key=key,
                                Body=f,
                            )

            url = f"{self.domain}/{cos_key}"
            logger.info(f"Uploaded to COS: {url}")
            return url

        except ImportError:
            logger.warning("qcloud_cos not installed, returning local path")
            return str(local_path.absolute())

        except Exception as e:
            logger.error(f"COS upload failed: {e}")
            raise
