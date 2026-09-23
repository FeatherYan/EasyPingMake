import base64
import contextlib
import io
import json
import sys

import cv2
import numpy as np
from perfect_pixel import get_perfect_pixel


def main() -> None:
    payload = json.load(sys.stdin)
    image_base64 = payload.get("imageBase64")
    if not isinstance(image_base64, str) or not image_base64:
        raise ValueError("imageBase64 is required")

    raw = base64.b64decode(image_base64)
    encoded = np.frombuffer(raw, dtype=np.uint8)
    bgr = cv2.imdecode(encoded, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("unable to decode the input image")

    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    logs = io.StringIO()
    with contextlib.redirect_stdout(logs):
        width, height, output = get_perfect_pixel(
            rgb,
            sample_method=payload.get("sampleMethod", "center"),
            debug=False,
        )

    if output is None or width is None or height is None:
        raise ValueError("PerfectPixel did not return a pixel image")

    ok, png = cv2.imencode(".png", cv2.cvtColor(output, cv2.COLOR_RGB2BGR))
    if not ok:
        raise ValueError("unable to encode the PerfectPixel output")

    print(json.dumps({
        "width": int(width),
        "height": int(height),
        "imageBase64": base64.b64encode(png.tobytes()).decode("ascii"),
        "logs": logs.getvalue().splitlines(),
    }, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"PerfectPixel runner error: {error}", file=sys.stderr)
        raise
