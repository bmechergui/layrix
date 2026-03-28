import subprocess
import tempfile
import pcbnew


def route_with_freerouting(pcb_path: str, output_path: str, timeout: int = 300) -> dict:
    """
    Pipeline : .kicad_pcb → .dsn → Freerouting (Java) → .ses → .kicad_pcb
    Timeouts : 90s (simple) | 300s (4 couches) | 600s (8 couches)
    """
    board = pcbnew.LoadBoard(pcb_path)

    with tempfile.TemporaryDirectory() as tmp:
        dsn_path = f"{tmp}/board.dsn"
        ses_path = f"{tmp}/board.ses"

        pcbnew.ExportSpecctraSession(board, dsn_path)

        result = subprocess.run(
            [
                "java", "-jar", "/opt/freerouting/freerouting.jar",
                "-de", dsn_path,
                "-do", ses_path,
                "-mp", "100",
                "-dr", f"{tmp}/freerouting.log",
            ],
            capture_output=True,
            timeout=timeout,
            text=True,
        )

        if result.returncode != 0:
            raise RuntimeError(f"Freerouting failed: {result.stderr[:500]}")

        pcbnew.ImportSpecctraSession(board, ses_path)

        # Ground pours
        for zone in board.Zones():
            zone.SetFilled(True)
        filler = pcbnew.ZONE_FILLER(board)
        filler.Fill(board.Zones())

        pcbnew.SaveBoard(output_path, board)

    return {"status": "ok", "path": output_path}
