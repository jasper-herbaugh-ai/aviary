from aviary_worker.parsers import parse_output


def test_df_parser_extracts_percent() -> None:
    output = "Filesystem Size Used Avail Use% Mounted on\n/dev/sda1 100G 50G 50G 50% /"
    parsed = parse_output("df", output)
    assert parsed["disk_percent"] == 50


def test_free_parser_extracts_memory_percent() -> None:
    output = "              total        used        free\nMem:           1000         250         750"
    parsed = parse_output("free", output)
    assert round(parsed["memory_percent"], 2) == 25.0
