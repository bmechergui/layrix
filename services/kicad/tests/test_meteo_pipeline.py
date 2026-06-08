"""
Test pipeline circuit_synth local — Station météo Arduino
Sans Docker. Level 1 : circuit_synth uniquement.

Sortie : C:\\Users\\Mechegui\\Downloads\\Kicadmcptest\\test\\meteo_arduino\\
"""

import logging
import os
import sys
from pathlib import Path

# --- Setup logging ---
logging.basicConfig(level=logging.WARNING)

# --- circuit_synth depuis le repo local ---
CS_SRC = Path(__file__).parents[1] / "circuit_synth" / "src"
sys.path.insert(0, str(CS_SRC))

from circuit_synth import Component, Net, circuit  # noqa: E402

OUTPUT_DIR = Path(r"C:\Users\Mechegui\Downloads\Kicadmcptest\test")
PROJECT_NAME = "meteo_arduino"


@circuit(name=PROJECT_NAME)
def station_meteo_arduino():
    """Station météo Arduino — DHT22 + résistance pull-up + découplage."""

    # Arduino UNO R3
    arduino = Component(
        symbol="MCU_Module:Arduino_UNO_R3",
        ref="U",
        value="Arduino_UNO_R3",
        footprint="Module:Arduino_UNO_R3",
    )

    # Capteur DHT22 (représenté comme module 3 broches)
    dht22 = Component(
        symbol="Connector_Generic:Conn_01x03",
        ref="J",
        value="DHT22",
        footprint="Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical",
    )

    # Résistance pull-up DATA 10k 0603
    r_pull = Component(
        symbol="Device:R",
        ref="R",
        value="10k",
        footprint="Resistor_SMD:R_0603_1608Metric",
    )

    # Condensateur de découplage 100nF 0603
    cap_dec = Component(
        symbol="Device:C",
        ref="C",
        value="100nF",
        footprint="Capacitor_SMD:C_0603_1608Metric",
    )

    # Connecteur alimentation 2 broches (5V + GND)
    pwr = Component(
        symbol="Connector_Generic:Conn_01x02",
        ref="J",
        value="PWR_5V",
        footprint="Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical",
    )

    # Nets
    vcc   = Net("VCC_5V")
    gnd   = Net("GND")
    data  = Net("DHT_DATA")

    # Arduino — noms exacts des broches MCU_Module:Arduino_UNO_R3
    arduino["+5V"] += vcc
    arduino["GND"]  += gnd
    arduino["D2"]   += data   # broche numérique D2 → données DHT22

    # DHT22 (module Conn_01x03) — Pin_1=VCC, Pin_2=DATA, Pin_3=GND
    dht22["Pin_1"] += vcc
    dht22["Pin_2"] += data
    dht22["Pin_3"] += gnd

    # Pull-up 10k entre VCC et DATA — Device:R broches '1','2'
    r_pull["1"] += vcc
    r_pull["2"] += data

    # Découplage — Device:C broches '1','2'
    cap_dec["1"] += vcc
    cap_dec["2"] += gnd

    # Connecteur alimentation Conn_01x02 — Pin_1=VCC, Pin_2=GND
    pwr["Pin_1"] += vcc
    pwr["Pin_2"] += gnd


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    project_path = str(OUTPUT_DIR / PROJECT_NAME)

    print(f"Génération schéma : {project_path}")

    circ = station_meteo_arduino()
    circ.generate_kicad_project(
        project_path,
        force_regenerate=True,
        generate_pcb=False,
    )

    # Chercher le .kicad_sch généré
    sch_files = list(OUTPUT_DIR.rglob("*.kicad_sch"))
    if sch_files:
        for f in sch_files:
            size = f.stat().st_size
            print(f"OK  {f}  ({size} octets)")
    else:
        print("ERREUR — aucun .kicad_sch trouvé dans", OUTPUT_DIR)
        sys.exit(1)


if __name__ == "__main__":
    main()
