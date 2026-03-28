import pcbnew


def run_drc(pcb_path: str) -> dict:
    board = pcbnew.LoadBoard(pcb_path)

    drc = pcbnew.DRC()
    drc.SetBoard(board)
    drc.RunTests(None)

    violations = []
    for item in board.GetDesignSettings().GetRules():
        pass  # placeholder — pcbnew DRC API varies by version

    # Utiliser BOARD_DRC_ITEMS_PROVIDER
    markers = board.GetMarkers()
    for marker in markers:
        violations.append({
            "severity": "error" if marker.GetErrorCode() < 100 else "warning",
            "message": marker.GetErrorText(),
            "x_mm": pcbnew.ToMM(marker.GetPos().x),
            "y_mm": pcbnew.ToMM(marker.GetPos().y),
        })

    return {
        "status": "ok",
        "violations": violations,
        "count": len(violations),
        "drc_clean": len(violations) == 0,
    }


def apply_drc_fixes(pcb_path: str, fixes: list[dict], output_path: str) -> dict:
    board = pcbnew.LoadBoard(pcb_path)
    applied = []

    for fix in fixes:
        fix_type = fix.get("type")

        if fix_type == "refill_zones":
            filler = pcbnew.ZONE_FILLER(board)
            filler.Fill(board.Zones())
            applied.append("refill_zones")

        elif fix_type == "apply_teardrops":
            # Teardrops via pcbnew API (KiCad 8+)
            pcbnew.ApplyTeardrops(board)
            applied.append("apply_teardrops")

        elif fix_type == "add_stitching_vias":
            # TODO : implémenter l'ajout de vias de couture
            applied.append("add_stitching_vias_skipped")

    pcbnew.SaveBoard(output_path, board)

    return {
        "status": "ok",
        "path": output_path,
        "applied": applied,
    }
