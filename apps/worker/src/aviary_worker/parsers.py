import re
from datetime import datetime
from typing import Any, Dict


def parse_output(kind: str, stdout: str) -> Dict[str, Any]:
    if kind == "df":
        max_percent = 0
        mounts = []
        for line in stdout.splitlines()[1:]:
            parts = line.split()
            if len(parts) < 6:
                continue
            usage = parts[4].rstrip("%")
            if usage.isdigit():
                value = int(usage)
                max_percent = max(max_percent, value)
                mounts.append({"mount": parts[5], "used_percent": value})
        return {"disk_percent": max_percent, "mounts": mounts}

    if kind == "free":
        for line in stdout.splitlines():
            if line.lower().startswith("mem:"):
                parts = [p for p in line.split() if p]
                if len(parts) >= 3 and parts[1].isdigit() and parts[2].isdigit():
                    total = int(parts[1])
                    used = int(parts[2])
                    used_percent = (used / total) * 100 if total else 0
                    return {"memory_percent": round(used_percent, 2), "memory_total_mb": total, "memory_used_mb": used}
        return {}

    if kind == "uptime":
        match = re.search(r"load average[s]?:\s*([0-9.,]+),\s*([0-9.,]+),\s*([0-9.,]+)", stdout)
        if not match:
            return {}
        return {
            "load_1": float(match.group(1).replace(",", "")),
            "load_5": float(match.group(2).replace(",", "")),
            "load_15": float(match.group(3).replace(",", "")),
        }

    if kind == "service_status":
        return {"service_status": stdout.strip()}

    if kind == "docker_ps":
        lines = [line for line in stdout.splitlines() if line.strip()]
        restarting = [line for line in lines if "Restarting" in line]
        return {"containers": len(lines), "restart_loop": len(restarting) > 0}

    if kind == "failed_logins":
        lines = [line for line in stdout.splitlines() if line.strip()]
        return {"failed_logins_24h": len(lines)}

    if kind == "cert_expiry":
        if "notAfter=" in stdout:
            expiry = stdout.strip().split("notAfter=")[-1]
            try:
                parsed = datetime.strptime(expiry, "%b %d %H:%M:%S %Y %Z")
                return {"cert_expiry": parsed.isoformat()}
            except ValueError:
                return {"cert_expiry_raw": expiry}
        return {}

    return {"raw": stdout.strip()}
