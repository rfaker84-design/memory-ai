import os

filepath = r"C:\Users\Administrator\MemoryAi\src\lib\tts.ts"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

first_lines = content[:500]
if " + "
import" + @" in first_lines:
    print("FILE IS CORRUPTED")
else:
    print("File OK, first lines:")
    for i, line in enumerate(content.split(chr(10))[:5]):
        print(f"  {i}: {line[:80]}")
