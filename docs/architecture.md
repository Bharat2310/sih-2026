# Architecture

## Overview

The system is a software-defined, adaptive chirp sonar transmitter for AUVs, based on the time-shared TX/LISTEN cycle architecture described in Zhou et al. (Software-Defined Sonar, IET Radar, Sonar & Navigation), with additional adaptive-frequency logic informed by Das, Malik & Pandey (2026) on underwater sonar challenges.

Team A owns the digital signal chain (Simulink model **before the DAC** + ESP32 embedded firmware). Team B owns the analog front-end (Simulink/Simscape model **after the DAC** + KiCad schematics).

| Model | File | Owner | Scope |
|---|---|---|---|
| Before-DAC digital pipeline | `src/simulink/before_dac_model.slx` | Team A | Decision Logic -> Modulation Selector -> Windowing -> TX/LISTEN Gating -> Buffer/ZOH -> DAC input |
| After-DAC analog front-end | `src/simulink/after_dac_model.slx` | Team B | DAC output -> CD4051 MUX -> LT1058 Sallen-Key filter -> LT1122/Class-AB amplifier -> LC impedance match -> transducer |

## Simulink Transmit Pipeline (Team A — finalized, verified in MATLAB R2026a)

**Inputs:**
- Turbidity ADC
- Depth ADC
- Temperature ADC
- Modulation Select

**1. Decision Logic (MATLAB Function block)**
- Turbidity ADC thresholds map to center frequency:
  | Turbidity ADC | Center Frequency |
  |---|---|
  | 0–1000 | 500 kHz |
  | 1001–3000 | 250 kHz |
  | 3001–4095 | 100 kHz |
- Depth ADC thresholds map to pulse width (T_pulse):
  | Depth ADC | T_pulse |
  |---|---|
  | Band 1 (shallow, midpoint ~2.5 m — placeholder) | 1 ms |
  | Band 2 (mid, midpoint ~17.5 m — placeholder) | 10 ms |
  | Band 3 (deep, midpoint ~30 m — placeholder) | 50 ms |

  > **Note:** Depth band midpoint values (2.5 m / 17.5 m / 30 m) are placeholders pending confirmation from Team B. Update this table once confirmed.

- Temperature is used to continuously recalculate sound velocity via the **Mackenzie (1981)** formula.
- Target range resolution **dR_target = 0.02 m (2 cm)** is held constant across all frequency bands.

**2. Modulation Selector (single MATLAB Function, if/elseif/else)**
- Mode 0: LFM chirp
- Mode 1: Geometric sweep
- Mode 2: Barker-13 phase-coded pulse

**3. Conditional Windowing**
- Blackman window for Modes 0 and 1 (chirp / geometric sweep)
- Rectangular / light Tukey window for Mode 2 (Barker-13)

**4. TX/LISTEN Pulse Gating**
- Period: 0.02 s
- Pulse width: 25% duty cycle (5 ms ON / 15 ms OFF)

**5. Output Stage**
```
Buffer(100) -> Unbuffer -> ZOH (5e-6 s / 200 kHz) -> DAC (MCP4725, Phase 2 hardware scope)
```

> **Known limitation:** The current 200 kHz ZOH sample rate cannot support the 500 kHz center frequency band without violating the Nyquist criterion. This must be resolved — either by increasing the ZOH rate to 1.25 MHz+ or via discussion with Team B on the achievable analog bandwidth.

## Hardware / Embedded Architecture

- **ESP32:** Digital waveform synthesis (LFM chirp generation, Hamming windowing) via hardware timers and ISR-driven execution. See `src/esp32-firmware/`.
- **MCP4725 I2C DAC (Phase 2):** Converts final digital waveform to analog for transducer drive. I2C speed is a known potential bottleneck at high frequencies — planned fix is DMA + hardware timer streaming.
- **After-DAC analog front-end (Team B, modeled in `src/simulink/after_dac_model.slx`):**
  - **CD4051 analog MUX:** Routes signal through the correct analog filter path for each of the three water-condition modes.
  - **LT1058 Sallen-Key active filter:** Band-shaping per selected mode.
  - **LT1122 / Class-AB power amplifier:** Drives output to 24 Vpp.
  - **LC impedance matching network:** Matches amplifier output to transducer impedance.
- **KiCad schematics:** Team B's PCB and schematic design for the analog front-end, in `src/kicad/` (or a link to a separate hardware repo if kept elsewhere).

## Key Design Principles

- **Simulink-first methodology:** All chirp math, windowing, and FFT behavior is validated in Simulink before porting to ESP32 C. This avoids hardware damage and keeps debugging tractable.
- **Fixed-step solver required:** Variable-step solvers cause aliased waveforms in the simulated output.
- **Buffer sizing:** Keep Buffer block size small (100, not 1000) to avoid blocking output within short simulation stop times.
- **Chirp frequency wrapping:** `mod(t,T)` wrapping is required in the chirp generator to prevent unbounded frequency growth.

## Team B Integration Point

Team A's adaptive chirp signal output needs to be injected at the top-left reference input of Team B's Simscape buck converter model for full system-level simulation.

## Diagram

See the ASCII block diagram in the main [README.md](../README.md#6-architecture) for a high-level view of the full signal chain.
