import pcbnew
import zipfile
import os
import subprocess
import csv


GERBER_LAYERS = {
    "F.Cu":     pcbnew.F_Cu,
    "B.Cu":     pcbnew.B_Cu,
    "F.SilkS":  pcbnew.F_SilkS,
    "B.SilkS":  pcbnew.B_SilkS,
    "F.Mask":   pcbnew.F_Mask,
    "B.Mask":   pcbnew.B_Mask,
    "Edge.Cuts": pcbnew.Edge_Cuts,
}


def export_gerbers(pcb_path: str, output_dir: str) -> dict:
    board = pcbnew.LoadBoard(pcb_path)
    os.makedirs(output_dir, exist_ok=True)

    ctrl = pcbnew.PLOT_CONTROLLER(board)
    opts = ctrl.GetPlotOptions()
    opts.SetOutputDirectory(output_dir)
    opts.SetUseGerberProtelExtensions(True)
    opts.SetGerberPrecision(6)
    opts.SetCreateGerberJobFile(True)

    for name, layer_id in GERBER_LAYERS.items():
        ctrl.SetLayer(layer_id)
        ctrl.OpenPlotfile(name, pcbnew.PLOT_FORMAT_GERBER, name)
        ctrl.PlotLayer()
    ctrl.ClosePlot()

    # Fichiers de perçage
    drill = pcbnew.EXCELLON_WRITER(board)
    drill.SetOptions(False, False, pcbnew.VECTOR2I(0, 0), False)
    drill.SetFormat(True)
    drill.CreateDrillandMapFilesSet(output_dir, True, False)

    # ZIP
    zip_path = os.path.join(output_dir, "gerbers.zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in os.listdir(output_dir):
            if not f.endswith(".zip"):
                zf.write(os.path.join(output_dir, f), f)

    return {
        "status": "ok",
        "zip_path": zip_path,
        "files": [f for f in os.listdir(output_dir) if not f.endswith(".zip")],
    }


def export_step(pcb_path: str, output_dir: str) -> dict:
    os.makedirs(output_dir, exist_ok=True)
    step_path = os.path.join(output_dir, "board.step")

    result = subprocess.run(
        ["kicad-cli", "pcb", "export-step", "--output", step_path, pcb_path],
        capture_output=True,
        text=True,
        timeout=120,
    )

    if result.returncode != 0:
        raise RuntimeError(f"kicad-cli STEP export failed: {result.stderr}")

    return {"status": "ok", "step_path": step_path}


def export_bom(pcb_path: str, output_dir: str) -> dict:
    board = pcbnew.LoadBoard(pcb_path)
    os.makedirs(output_dir, exist_ok=True)

    bom_path = os.path.join(output_dir, "bom.csv")
    cpl_path = os.path.join(output_dir, "cpl.csv")

    # BOM CSV (JLCPCB format)
    components: dict[str, dict] = {}
    for fp in board.GetFootprints():
        value = fp.GetValue()
        ref = fp.GetReference()
        lcsc = fp.GetFieldByName("LCSC").GetText() if fp.GetFieldByName("LCSC") else ""

        key = f"{value}_{lcsc}"
        if key not in components:
            components[key] = {"Comment": value, "Designator": [], "Footprint": fp.GetFPIDAsString(), "LCSC": lcsc}
        components[key]["Designator"].append(ref)

    with open(bom_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["Comment", "Designator", "Footprint", "LCSC Part #"])
        writer.writeheader()
        for comp in components.values():
            writer.writerow({
                "Comment": comp["Comment"],
                "Designator": ",".join(comp["Designator"]),
                "Footprint": comp["Footprint"],
                "LCSC Part #": comp["LCSC"],
            })

    # CPL CSV (centroid)
    with open(cpl_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["Designator", "Mid X", "Mid Y", "Layer", "Rotation"])
        writer.writeheader()
        for fp in board.GetFootprints():
            pos = fp.GetPosition()
            writer.writerow({
                "Designator": fp.GetReference(),
                "Mid X": f"{pcbnew.ToMM(pos.x):.3f}mm",
                "Mid Y": f"{pcbnew.ToMM(pos.y):.3f}mm",
                "Layer": "T" if fp.GetLayer() == pcbnew.F_Cu else "B",
                "Rotation": fp.GetOrientationDegrees(),
            })

    return {
        "status": "ok",
        "bom_path": bom_path,
        "cpl_path": cpl_path,
    }
