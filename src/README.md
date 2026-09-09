# src/

```
src/
├── simulink/
│   ├── before_dac_model.slx   # Team A — digital chirp pipeline (before DAC)
│   └── after_dac_model.slx    # Team B — analog front-end Simscape model (after DAC)
├── esp32-firmware/
│   └── (ESP32 .ino / .c / .h source files)
└── kicad/
    └── (Team B's KiCad schematic and PCB files, if kept in this repo)
```

- **`simulink/before_dac_model.slx`** — Team A's finalized digital pipeline: Decision Logic -> Modulation Selector -> Conditional Windowing -> TX/LISTEN Pulse Gating -> Buffer -> Unbuffer -> ZOH -> DAC input. Details in [../docs/architecture.md](../docs/architecture.md).
- **`simulink/after_dac_model.slx`** — Team B's analog front-end, modeled in Simulink/Simscape: DAC output -> CD4051 MUX -> LT1058 Sallen-Key filter -> LT1122/Class-AB power amplifier -> LC impedance matching network -> transducer.
- **`esp32-firmware/`** — Embedded C firmware for real-time waveform synthesis and DAC streaming, ported from the before-DAC Simulink design.
- **`kicad/`** — Team B's schematic/PCB files (or link to a separate hardware repo if kept elsewhere).

Keep each team's work in its own subfolder to avoid merge conflicts.
