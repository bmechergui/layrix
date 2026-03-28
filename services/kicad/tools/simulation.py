import subprocess
import os
import json


def run_simulation(netlist_path: str, sim_type: str, output_dir: str) -> dict:
    """
    Simulation ngspice (plan Pro uniquement).
    sim_type : "dc" | "transient" | "ac" | "noise"
    """
    os.makedirs(output_dir, exist_ok=True)

    # Générer le fichier de commandes ngspice
    spice_cmd = _build_spice_command(netlist_path, sim_type)
    cmd_path = os.path.join(output_dir, "sim.sp")
    with open(cmd_path, "w") as f:
        f.write(spice_cmd)

    result = subprocess.run(
        ["ngspice", "-b", "-o", os.path.join(output_dir, "sim.log"), cmd_path],
        capture_output=True,
        text=True,
        timeout=60,
    )

    if result.returncode != 0:
        raise RuntimeError(f"ngspice failed: {result.stderr[:500]}")

    # Parser les résultats (simplifié)
    return {
        "status": "ok",
        "sim_type": sim_type,
        "output_dir": output_dir,
        "raw_log": result.stdout[:2000],
    }


def _build_spice_command(netlist_path: str, sim_type: str) -> str:
    cmds = {
        "dc": ".op\n.end",
        "transient": ".tran 1n 1m\n.end",
        "ac": ".ac dec 100 1 10Meg\n.end",
        "noise": ".noise V(out) Vin dec 100 1 10Meg\n.end",
    }
    return f".include {netlist_path}\n{cmds.get(sim_type, '.op\n.end')}"
