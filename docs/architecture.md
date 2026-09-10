```
# Architecture

## Overview

The system is a **software-defined, real-time adaptive sonar transmitter** for Autonomous Underwater Vehicles (AUVs). It uses a time-shared **TX/LISTEN architecture** in which the transmitted waveform is dynamically adapted according to environmental conditions such as turbidity, depth, and temperature.

The system combines a digital waveform-generation pipeline with an analog signal-conditioning and power-delivery stage.

| Model | File | Scope |
|---|---|---|
| Before-DAC Digital Pipeline | `src/simulink/before_dac_model.slx` | Decision Logic → Modulation Selection → Windowing → TX/LISTEN Gating → Buffer/ZOH → DAC |
| After-DAC Analog Front-End | `src/simulink/after_dac_model.slx` | DAC → CD4051 MUX → LT1058 Filter → Power Amplifier → LC Matching → Transducer |

## Simulink Transmit Pipeline

### 1. Environmental Adaptation & Decision Logic

The system maps environmental inputs to waveform parameters and dynamically determines the transmission configuration.

- **Turbidity:** Selects the operating center-frequency band to reduce scattering.
- **Depth:** Determines the pulse duration required for deeper-water penetration.
- **Temperature:** Used to calculate the real-time speed of sound and correct the required bandwidth.
- **Resolution:** Bandwidth is dynamically adjusted to maintain a target range resolution of **2 cm**.

The current frequency mapping is:

| Turbidity ADC | Center Frequency |
|---|---|
| 0–1000 | 500 kHz |
| 1001–3000 | 250 kHz |
| 3001–4095 | 100 kHz |

The current depth mapping uses three pulse-duration bands:

| Depth Band | Pulse Duration |
|---|---|
| Shallow | 1 ms |
| Mid | 10 ms |
| Deep | 50 ms |

> **Note:** The exact physical depth thresholds are provisional and will be finalized during hardware validation.

### 2. Modulation Selection

The system automatically selects the appropriate waveform according to the environmental conditions:

- **Mode 0:** LFM Chirp
- **Mode 1:** Geometric Sweep
- **Mode 2:** Barker-13 Phase-Coded Pulse

### 3. Digital Signal Synthesis & Windowing

During the transmit phase, the selected waveform is mathematically synthesized and stored in a **100-sample discrete buffer**.

Windowing is applied to reduce sudden voltage transitions and unwanted sidelobe energy:

- **Blackman window:** LFM Chirp and Geometric Sweep
- **Tukey / light Tukey window:** Barker-13 Phase-Coded Pulse

### 4. TX/LISTEN Gating

The transmitter operates using a time-shared cycle:

- **Cycle period:** 20 ms
- **TX window:** 5 ms
- **LISTEN window:** 15 ms
- **TX duty cycle:** 25%

This reduces unnecessary CPU and DAC activity during the listening phase.

### 5. DMA-Based Waveform Output

A hardware timer controls the output sampling interval while DMA transfers the prepared waveform buffer to the DAC with minimal CPU intervention.

The current simulation uses a **200 kHz ZOH rate (5 μs interval)**.

## Analog Front-End

The DAC output passes through the following signal-conditioning and power-delivery chain:

```text
DAC Output
    ↓
CD4051 Analog MUX
    ↓
LT1058 Sallen-Key Filter
    ↓
LM318M + Class-AB Power Amplifier
    ↓
LC Impedance Matching Network
    ↓
Piezoelectric Transducer
```

* **CD4051 Analog MUX:** Routes the signal through the appropriate filter path for the selected environmental condition.
* **LT1058 Sallen-Key Filter:** Provides condition-specific low-pass filtering to suppress high-frequency switching noise and harmonics.
* **LM318M + Class-AB Stage:** Amplifies the conditioned signal using an approximately **7.2× driver gain** and 18 V supply rails, targeting approximately **24 Vpp** output.
* **LC Matching Network:** Compensates for the predominantly capacitive transducer load to improve resonance and power transfer.
* **Piezoelectric Transducer:** Converts the amplified electrical waveform into the transmitted acoustic pulse.

## Hardware / Embedded Architecture

* **ESP32:** Performs ADC acquisition, decision logic, waveform synthesis, digital windowing, buffer management, and hardware-timed waveform output.
* **DAC:** Converts the digitally synthesized waveform into the analog signal supplied to the analog front-end.
* **Analog Front-End:** Filters, amplifies, and impedance-matches the waveform before driving the transducer.
* **KiCad:** Used for schematic and hardware design of the analog front-end.

## Key Design Principles

* **Adaptive Waveform Generation:** Environmental inputs influence frequency, pulse duration, bandwidth, and modulation selection.
* **Constant Resolution:** Temperature-based acoustic velocity correction and bandwidth adaptation maintain the target **2 cm resolution** across operating conditions.
* **Hardware-Timed Output:** Hardware timers provide deterministic DAC sample timing independent of CPU execution latency.
* **DMA-Based Streaming:** DMA reduces continuous CPU involvement during waveform transmission.
* **Low-Power Operation:** The CPU enters a low-power state after initiating DMA transmission and wakes briefly on DMA completion before returning to sleep during the LISTEN phase.
* **Modular Signal Conditioning:** Dedicated analog filter paths are selected according to environmental conditions.

## System Architecture

```text
Turbidity ─┐
Depth ─────┼──→ Decision Logic
Temperature ┘          │
                       ↓
               Modulation Selection
                       │
                       ↓
                Waveform Synthesis
                       │
                       ↓
               Conditional Windowing
                       │
                       ↓
                TX/LISTEN Gating
                       │
                       ↓
                  Buffer (100)
                       │
                       ↓
                    ZOH / DMA
                       │
                       ↓
                      DAC
                       │
                       ↓
                CD4051 Analog MUX
                       │
                       ↓
              LT1058 Active Filter
                       │
                       ↓
          LM318M + Class-AB Amplifier
                       │
                       ↓
              LC Matching Network
                       │
                       ↓
           Piezoelectric Transducer
```
