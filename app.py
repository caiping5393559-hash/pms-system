from pathlib import Path
import base64
import gzip
import hashlib

EXPECTED_SOURCE_SHA256 = "97ae924e65f39b35025c506e1e1823bfa1afde4c12b2fa47572dd10742a1f3c2"

payload = "".join(
    (Path(__file__).with_name(f"pms_payload_{index:02d}.txt")).read_text(encoding="utf-8").strip()
    for index in range(1, 7)
)
source = gzip.decompress(base64.b64decode(payload))
actual = hashlib.sha256(source).hexdigest()
if actual != EXPECTED_SOURCE_SHA256:
    raise RuntimeError(f"PMS payload checksum mismatch: {actual}")

exec(compile(source.decode("utf-8"), __file__, "exec"))
