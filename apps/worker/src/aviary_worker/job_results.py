from typing import Any, Dict


def build_failure_job_result(
    *,
    step_order: int,
    command: str,
    status: str,
    message: str,
) -> Dict[str, Any]:
    normalized_command = command.strip() or "__worker__"
    normalized_message = message.strip() or "Job failed before output was captured."

    return {
        "step_order": step_order if step_order > 0 else 0,
        "command": normalized_command,
        "exit_code": 124 if status == "timeout" else -1,
        "stdout": "",
        "stderr": normalized_message,
        "duration_ms": 0,
        "parsed_values": {
            "status": status,
            "error": normalized_message,
        },
    }
