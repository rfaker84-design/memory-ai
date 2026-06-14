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
      return NextResponse.json(
        { error: "未上传文件" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const ext = file.name.split(".").pop();

    const key = `memory-images/${Date.now()}.${ext}`;

    const result = await new Promise<unknown>((resolve, reject) => {
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

    const url =
      `${process.env.COS_DOMAIN}/${key}`;

    return NextResponse.json({
      success: true,
      url,
      data: result,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "上传失败" },
      { status: 500 }
    );
  }
}
