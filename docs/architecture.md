# Adaptive Software-Defined Sonar Transmitter

## 1. Overview

The transmitter adapts its waveform in real time based on sensed water conditions (turbidity, depth, temperature) instead of relying on a single fixed frequency/pulse configuration. The architecture is split into two halves that map directly onto the two Simulink models in this repo:

- **Digital pipeline (pre-DAC)** — `src/simulink/before_dac_model.slx`: sensing → decision logic → waveform synthesis → windowing → buffering → DAC.
- **Analog front end (post-DAC)** — `src/ltspice/after_dac_model.asc`: DAC output → filtering → amplification → impedance matching → transducer.

The ESP32 (`src/esp32-firmware/`) is the bridge between the two: it runs the decision logic and digital synthesis in firmware, then drives the analog chain via the DAC and MUX control lines.

## 2. Full Signal Chain

```
Turbidity ADC ─┐
Depth ADC ─────┼──> Decision Logic + Mod_Select Decision Block
Temperature ───┘                    │
                                     ▼
                  Center Freq, T_pulse, Sound Velocity,
                          Bandwidth, Mode (0/1/2)
                                     │
                                     ▼
                        Modulation Selector
                   ┌─────────────────────────────┐
                   │ Mode 0: LFM Chirp            │
                   │ Mode 1: Geometric Sweep       │
                   │ Mode 2: Barker-13             │
                   └─────────────────────────────┘
                                     │
                                     ▼
                        Conditional Windowing
                        (Blackman / Tukey)
                                     │
                                     ▼
                        TX/LISTEN Pulse Gating
                          (0.02 s cycle, 25% duty)
                                     │
                                     ▼
                         Buffer (100) → Unbuffer
                                     │
                                     ▼
                          ZOH (5 µs / 200 kHz)
                                     │
                                     ▼
                                   DAC
                                     │
                                     ▼
                          3.3 V Analog Signal
                                     │
                                     ▼
                          CD4051 Analog MUX
                                     │
                                     ▼
                       Sallen-Key Active Filter
                                     │
                                     ▼
                     LM318M + Class-AB Amplifier
                               (~24 Vpp)
                                     │
                                     ▼
                        LC Impedance Matching
                                     │
                                     ▼
                       Piezoelectric Transducer
```

## 3. Digital Pipeline (Pre-DAC)

**Model:** `src/simulink/before_dac_model.slx`

### 3.1 Sensing
Turbidity, depth, and temperature are read via ADC channels (currently mapped from potentiometer inputs at the prototype stage).

### 3.2 Decision Logic + Mod_Select
Environmental readings are converted into transmission parameters:

| Input | Drives | Effect |
|---|---|---|
| Turbidity | Center frequency band (500 / 250 / 100 kHz) | Limits base frequency to prevent signal scattering |
| Depth | Pulse width T_pulse (1 / 10 / 50 ms) | Longer pulses for deeper energy penetration |
| Temperature | Sound velocity (Mackenzie, 1981) | Recalculated continuously and fed into bandwidth correction every cycle |

The **Mod_Select Decision Block** automatically chooses the modulation mode — not manually selected:
1. Turbidity voltage > 2.4 V → **Mode 2: Barker-13** phase-coded pulse (heavy silt)
2. Depth > 30 m → **Mode 1: Geometric Sweep** (deep water)
3. Otherwise → **Mode 0: LFM Chirp** (standard conditions)

Bandwidth is dynamically compensated to hold a target **2 cm range resolution (dR_target)** across all operating frequency bands, including at 100 kHz.

### 3.3 Digital Waveform Synthesis
During the 5 ms TX window, the ESP32 computes a 100-sample waveform array for the selected modulation, frequency, bandwidth, and pulse duration.

### 3.4 Conditional Windowing
- **Blackman window** — LFM chirps and geometric sweeps, to control sidelobes and reduce spectral leakage.
- **Rectangular / light Tukey window** — Barker-13 pulses, to preserve individual phase-coded chips.

### 3.5 TX/LISTEN Gating, Buffering, ZOH, DAC
- Pulse gating enforces a 0.02 s cycle at 25% duty (5 ms TX / 15 ms LISTEN).
- The 100-sample buffer is unbuffered and output through a Zero-Order Hold at 200 kHz (5 µs interval) via hardware-timed DMA.
- DMA transfers samples from RAM to the DAC autonomously, letting the CPU enter Light Sleep during transmission and wake only on the DMA-finish interrupt to shut down the DAC before sleeping through the remainder of LISTEN.

## 4. Analog Front End (Post-DAC) 

**Model:** `src/ltspice/before_dac_model.asc` 

| Stage | Component | Function |
|---|---|---|
| Signal routing | CD4051 Analog MUX | Routes the waveform to one of three condition-specific paths — Clear / Murky / Muddy |
| Signal conditioning | LT1058 Sallen-Key filter | 2nd-order Butterworth low-pass, condition-specific cutoff, removes switching noise/harmonics |
| Power amplification | LM318M + Class-AB (BD139/BD140) | 7.2× feedback gain driver + push-pull stage on 18 V rails → ~24 Vpp output |
| Impedance matching | LC network | Compensates the transducer's capacitive reactance for efficient power transfer |
| Acoustic transmission | Piezoelectric transducer | Converts the conditioned electrical waveform into the acoustic sonar pulse |

## 5. Key Architectural Features
1. **Real-Time Environmental Adaptation:** Turbidity, depth, and temperature directly influence transmission parameters.
2. **Adaptive Frequency Selection:** Operating frequency shifts between 100 kHz, 250 kHz, and 500 kHz according to turbidity.
3. **Adaptive Pulse Duration:** Pulse duration changes between 1 ms, 10 ms, and 50 ms according to depth.
4. **Dynamic Bandwidth Compensation:** Temperature-based sound velocity correction dynamically determines the required bandwidth.
5. **2 cm Target Resolution:** Bandwidth is calculated using the acoustic range-resolution relationship.
6. **Three Modulation Modes:** LFM Chirp, Geometric Sweep, and Barker-13 Phase Coding.
7. **Digital + Analog Signal Conditioning:** Digital windowing is followed by analog filtering.
8. **TX/LISTEN Operation:** A 5 ms TX window followed by a 15 ms LISTEN window enables time-shared sonar operation.
9. **DMA-Compatible Waveform Streaming:** Buffered waveform generation reduces continuous CPU involvement during transmission.
10. **Efficient Transducer Drive:** Power amplification and LC impedance matching improve energy transfer to the piezoelectric transducer.

