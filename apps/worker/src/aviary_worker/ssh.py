from typing import Optional


def resolve_ssh_username(server_username: Optional[str], credential_username: str) -> str:
    if server_username and server_username.strip():
        return server_username.strip()

    return credential_username
