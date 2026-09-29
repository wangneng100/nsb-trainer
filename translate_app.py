import re

with open("js/app.js", "r") as f:
    content = f.read()

def replace_innerhtml(m):
    prefix = m.group(1)
    expr = m.group(2)
    # Don't double wrap
    if expr.startswith("window.tH(") or expr.startswith("tH("):
        return m.group(0)
    # The expr might end with a semicolon. We strip it and put it outside.
    has_semi = expr.endswith(";")
    if has_semi:
        expr = expr[:-1]
    
    return f"{prefix}window.tH ? window.tH({expr}) : {expr}{';' if has_semi else ''}"

# Regex for .innerHTML = ...
# It matches `.innerHTML = ` followed by anything up to a newline or semicolon, but we have multi-line template literals!
# So we need to match .innerHTML = `...` explicitly first.

content = re.sub(r"(\.innerHTML\s*=\s*)(`[^`]*`;?)", replace_innerhtml, content)
content = re.sub(r"(\.innerHTML\s*=\s*)([^`\n;]+;)", replace_innerhtml, content)

# Also wrap toast(...)
def replace_toast(m):
    arg = m.group(1)
    return f"toast(window.tH ? window.tH({arg}) : {arg})"
content = re.sub(r"toast\((`[^`]*`)\)", replace_toast, content)
content = re.sub(r"toast\(('[^']*')\)", replace_toast, content)

# And MODE
content = content.replace(
    "const MODE = { dict: '👂 听写', calc: '🔔 听算', bank: '🎙 真题' };",
    "const MODE = { dict: window.t ? window.t('👂 听写') : '👂 听写', calc: window.t ? window.t('🔔 听算') : '🔔 听算', bank: window.t ? window.t('🎙 真题') : '🎙 真题' };"
)

with open("js/app.js", "w") as f:
    f.write(content)
