import io, sys
p = r"js\app.js"
raw = open(p, "rb").read()
print("CRLF:", raw.count(b"\r\n"), "LF:", raw.count(b"\n"))
t = raw.decode("utf-8")
try:
    fixed = t.encode("cp1252").decode("utf-8")
    print("roundtrip ok")
except Exception as e:
    print("FAIL", e); sys.exit(1)
import re
print("mojibake after:", len(re.findall(r"Ã|Â|â€", fixed)))
print("accents after:", len(re.findall(r"[éèàçùôîêû]", fixed)))
open(p, "wb").write(fixed.encode("utf-8"))
print("written bytes:", len(fixed.encode("utf-8")))
