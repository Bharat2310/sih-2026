# Architecture

## Overview

The system is a **software-defined, real-time adaptive sonar transmitter** designed for Autonomous Underwater Vehicles (AUVs). It uses a time-shared **TX/LISTEN architecture** in which transmitted waveforms are dynamically adapted according to real-time environmental conditions such as turbidity, water depth, and temperature.

The architecture bridges a digital waveform-generation pipeline with an analog signal-conditioning and high-power delivery stage.

| Model | File Path | Functional Scope |
|---|---|---|
| **Before-DAC Digital Pipeline** | `src/simulink/before_dac_model.slx` | Decision Logic → Modulation Selection → Windowing → TX/LISTEN Gating → Buffer/ZOH → DAC |
| **After-DAC Analog Front-End** | `src/simulink/after_dac_model.slx` | DAC → CD4051 MUX → LT1058 Filter → Power Amplifier → LC Matching → Transducer |

---

## Complete System Flow Architecture

```text
  [ Turbidity ]   ──┐
  [ Depth ]       ──┼──> Decision Logic
  [ Temperature ] ──┘         │
                              ▼
                     Modulation Selection
                              │
                              ▼
                     Waveform Synthesis
                              │
                              ▼
                    Conditional Windowing
                              │
                              ▼
                     TX/LISTEN Gating
                              │
                              ▼
                     Buffer (100 Samples)
                              │
                              ▼
                          ZOH / DMA
                              │
                              ▼
                             DAC
                              │
                              ▼
                      CD4051 Analog MUX
                              │
                              ▼
                    LT1058 Active Filter
                              │
                              ▼
                LM318M + Class-AB Amplifier
                              │
                              ▼
                     LC Matching Network
                              │
                              ▼
                   Piezoelectric Transducer

```

---

## Simulink Transmit Pipeline

### 1. Environmental Adaptation & Decision Logic

The system maps analog environmental inputs to waveform parameters and dynamically calculates optimal transmission configurations:

* **Turbidity:** Selects the operating center-frequency band to minimize acoustic scattering.
* **Depth:** Determines the total pulse duration required for deep-water signal penetration.
* **Temperature:** Computes real-time acoustic sound velocity in water to correct required sweep bandwidth.
* **Resolution:** Bandwidth is dynamically adjusted to maintain a constant target range resolution of **2 cm**.

#### Operating Mappings

**Frequency Band Selection:**

| Turbidity (ADC Range) | Center Frequency ($f_c$) |
| --- | --- |
| `0 – 1000` | **500 kHz** |
| `1001 – 3000` | **250 kHz** |
| `3001 – 4095` | **100 kHz** |

**Pulse Duration Bands:**

| Depth Band | Pulse Duration ($\tau$) |
| --- | --- |
| **Shallow** | 1 ms |
| **Mid** | 10 ms |
| **Deep** | 50 ms |

> **Note:** Physical depth thresholds are provisional and subject to final hardware field validation.

---

### 2. Modulation Selection

Depending on environmental noise and operational objectives, the decision engine routes signal synthesis through one of three modulation schemes:

* **Mode 0:** Linear Frequency Modulation (LFM Chirp)
* **Mode 1:** Geometric Sweep
* **Mode 2:** Phase-Coded Pulse (Barker-13)

---

### 3. Digital Signal Synthesis & Windowing

During the transmit phase, the selected waveform is mathematically synthesized into a discrete **100-sample ring buffer**. To suppress spectral splatter and unwanted sidelobe energy during switching transitions, conditional windowing is applied:

* **Blackman Window:** Applied to LFM Chirp and Geometric Sweeps.
* **Tukey / Light Tukey Window:** Applied to Barker-13 Phase-Coded Pulses.

---

### 4. TX/LISTEN Gating

To maximize power efficiency and prevent receiver saturation, the system employs time-shared duty gating:

* **Cycle Period:** 20 ms
* **TX Window:** 5 ms
* **LISTEN Window:** 15 ms
* **TX Duty Cycle:** 25%

This timing structure drastically reduces idle CPU execution and DAC power dissipation during the echo-reception (LISTEN) phase.

---

### 5. DMA-Based Waveform Output

```text
┌──────────────────────┐      ┌──────────────────────┐      ┌──────────────────────┐
│  100-Sample Buffer   │ ───> │      Zero-Order      │ ───> │     Internal DAC     │
│  (Synthesized RAM)   │      │     Hold (ZOH)       │      │   (Hardware Output)  │
└──────────────────────┘      └──────────────────────┘      └──────────────────────┘

```

A hardware timer enforces determinism over sample intervals while direct memory access (**DMA**) transfers buffer contents to the DAC with zero CPU intervention. The baseline simulation operates at a **200 kHz ZOH rate** (5 $\mu$s sample interval).

---

## Analog Front-End

The output stage condition-matches, amplifies, and drives the acoustic output load:

```text
[ DAC Output ] ──> [ CD4051 MUX ] ──> [ LT1058 Filter ] ──> [ LM318M + Class-AB PA ] ──> [ LC Matching ] ──> [ Piezo Transducer ]

```

* **CD4051 Analog MUX:** Digitally switches the raw analog output across dedicated filter topologies depending on the selected operating frequency band.
* **LT1058 Sallen-Key Filter:** Active low-pass active filter stage configured to suppress high-frequency harmonic distortion and DAC quantization noise.
* **LM318M + Class-AB Power Amplifier:** Amplifies signal amplitude using a **7.2× driver gain** powered by **$\pm 18\text{ V}$ rails**, producing an target signal level of **24 $\text{V}_{\text{pp}}$**.
* **LC Impedance Matching Network:** Passive reactive network that cancels out the high intrinsic capacitive reactance of the transducer to maximize active real-power transfer at resonance.
* **Piezoelectric Transducer:** Electro-acoustic element converting high-voltage electrical waveforms into focused underwater acoustic pulses.

---

## Embedded & System Hardware Architecture

* **Microcontroller (ESP32):** Responsible for high-speed ADC sampling (environmental sensors), decision matrix evaluation, waveform math generation, digital windowing, DMA stream management, and hardware timer interrupt dispatching.
* **DAC Module:** Renders synthesized digital waveform vectors into precise analog voltages.
* **Analog Front-End Board:** Multi-stage signal processing unit handling active filtering, switching, driver gain, power amplification, and inductive load matching.
* **KiCad Design Suite:** Project platform for all physical schematic design, PCB routing, and high-frequency analog layout validation.

---

## Key Engineering & Design Principles

* **Adaptive Waveform Generation:** Real-time sensor-driven tuning of carrier frequency, envelope duration, bandwidth, and pulse modulation mode.
* **Constant Spatial Resolution:** Automatic calculation of sound velocity based on real-time water temperature to dynamically expand or contract sweep bandwidth, preserving a strict 2 cm spatial resolution target.
* **Deterministic Output Execution:** Hardware-driven timer interrupt loops bypass software timing jitter to supply jitter-free DAC sampling.
* **DMA-Driven Memory Offloading:** Continuous waveform streaming occurs asynchronously in hardware without occupying execution cycles on the core processor.
* **Low-Power Operational Profile:** ESP32 drops into low-power sleep modes immediately after initializing DMA streams, waking only upon transaction completion for LISTEN cycle management.
* **Modular Filter Selection:** Active multi-path signal conditioning dynamically matches attenuation characteristics to environmental frequency selection.

```

```
