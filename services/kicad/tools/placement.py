import pcbnew


def place_components(pcb_path: str, components: list[dict], output_path: str) -> dict:
    board = pcbnew.LoadBoard(pcb_path)

    placed = []
    errors = []

    for comp in components:
        fp = board.FindFootprintByReference(comp["ref"])
        if not fp:
            errors.append(f"Footprint {comp['ref']} introuvable")
            continue

        fp.SetPosition(pcbnew.VECTOR2I(
            pcbnew.FromMM(comp["x_mm"]),
            pcbnew.FromMM(comp["y_mm"])
        ))
        fp.SetOrientationDegrees(comp["rotation"])

        if comp.get("side") == "back":
            fp.Flip(fp.GetPosition(), False)

        placed.append(comp["ref"])

    pcbnew.SaveBoard(output_path, board)

    return {
        "status": "ok",
        "path": output_path,
        "placed": len(placed),
        "errors": errors,
    }
