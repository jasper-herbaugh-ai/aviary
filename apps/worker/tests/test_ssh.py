from aviary_worker.ssh import resolve_ssh_username


def test_resolve_ssh_username_prefers_server_username() -> None:
    assert resolve_ssh_username("ubuntu", "root") == "ubuntu"


def test_resolve_ssh_username_falls_back_to_credential_username() -> None:
    assert resolve_ssh_username(None, "root") == "root"


def test_resolve_ssh_username_ignores_blank_server_username() -> None:
    assert resolve_ssh_username("   ", "ec2-user") == "ec2-user"
