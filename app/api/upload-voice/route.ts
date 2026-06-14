import { NextRequest, NextResponse } from "next/server";
import COS from "cos-nodejs-sdk-v5";

const cos = new COS({
  SecretId: process.env.TENCENT_SECRET_ID!,
  SecretKey: process.env.TENCENT_SECRET_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "未上传声音文件" }, { status: 400 });
    }

    const allowedTypes = [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
      "audio/m4a",
      "audio/aac",
    ];

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: "只支持 mp3、wav、m4a、aac 声音文件" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "mp3";
    const key = `voice-samples/${Date.now()}.${ext}`;

    await new Promise((resolve, reject) => {
      cos.putObject(
        {
          Bucket: process.env.COS_BUCKET!,
          Region: process.env.COS_REGION!,
          Key: key,
          Body: buffer,
        },
        (err, data) => {
          if (err) reject(err);
          else resolve(data);
        }
      );
    });

    const url = `${process.env.COS_DOMAIN}/${key}`;

    return NextResponse.json({
      success: true,
      url,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "声音上传失败" },
      { status: 500 }
    );
  }
}
