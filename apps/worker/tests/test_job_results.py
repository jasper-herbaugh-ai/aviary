from aviary_worker.job_results import build_failure_job_result


def test_build_failure_job_result_for_connect_error() -> None:
    row = build_failure_job_result(
        step_order=0,
        command="__connect__",
        status="failed",
        message="ConnectionRefusedError: [Errno 61] Connection refused",
    )

    assert row["step_order"] == 0
    assert row["command"] == "__connect__"
    assert row["exit_code"] == -1
    assert row["stdout"] == ""
    assert "ConnectionRefusedError" in row["stderr"]
    assert row["parsed_values"]["status"] == "failed"


def test_build_failure_job_result_for_timeout() -> None:
    row = build_failure_job_result(
        step_order=2,
        command="systemctl status redis",
        status="timeout",
        message="Command timed out after 90 seconds.",
    )

    assert row["step_order"] == 2
    assert row["command"] == "systemctl status redis"
    assert row["exit_code"] == 124
    assert row["parsed_values"]["status"] == "timeout"
