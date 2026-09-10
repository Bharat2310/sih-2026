# Adaptive Underwater Sonar Transmitter for AUVs

## 1. Project Information

- **Project Title:** Adaptive Software-Defined Sonar Transmitter for AUVs
- **PS ID:** 26058
- **PS Title:** Development of a Low-Power, Real-Time Adaptive Software-Defined Sonar Transmitter Payload for Autonomous Underwater Vehicles (AUVs)
- **Category:** Hardware
- **Theme:** Robotics and Drones

## 2. Problem Statement

Fixed-frequency sonar transmitters used in Autonomous Underwater Vehicles (AUVs) perform poorly when water conditions change. High turbidity, varying depth and temperature gradients all affect how sound propagates underwater, causing loss of resolution, weak returns, or complete signal degradation. A sonar system tuned for clear, shallow water fails in turbid or deep-water conditions, and vice versa,  there is no single fixed frequency/pulse configuration that works well everywhere.

## 3. Proposed Solution

We propose a **Software-Defined Sonar (SDS)** transmitter that adapts its waveform in real time based on sensed water conditions, instead of using a single fixed frequency.

The system continuously reads **turbidity**, **depth**, and **temperature** via ADC channels (mapped from potentiometer inputs at the current prototype stage) and uses this data to dynamically determine the most suitable suitable transmission configuration and parameters.

**ADAPTIVE WAVEFORM AND PARAMETER SELECTION**

- **Center frequency** (500 kHz / 250 kHz / 100 kHz) based on turbidity band — turbidity limits the base frequency band to prevent signal scattering
- **Pulse width (T_pulse)** (1 ms / 10 ms / 50 ms) based on depth band — depth dictates total pulse duration for deeper energy penetration
- **Modulation type** — automatically decided by the Mod_Select Decision Block, not manually selected:
         1. heavy silt (turbidity_voltage > 2.4V) forces Barker-13 phase-coded pulse 
         2. deep water (depth_m > 30) forces Geometric Sweep (Mode 1)
         3. standard conditions default to LFM Chirp (Mode 0)
- **Sound velocity correction** using the Mackenzie (1981) formula, recalculated continuously from real-time temperature and fed directly into bandwidth correction every cycle
- **Bandwidth** dynamically compensated to maintain a target 2 cm range resolution (dR_target) across the operating frequency bands, eliminating the need for manual reconfiguration even at the 100 kHz operating point.

**DIGITAL WAVEFORM GENERATION AND LOW POWER TRANSMISSION**

The selected waveform is synthesized digitally by the ESP32. During the 5 ms TX window, the CPU computes a 100-sample waveform array corresponding to the required modulation, frequency, bandwidth and pulse duration.
The waveform then passes through mode-dependent digital windowing:
1. Blackman window for LFM chirps and geometric sweeps to control sidelobes and reduce spectral leakage
2. Rectangular/light Tukey window for Barker-13 phase-coded pulses, where preserving the individual phase-coded chips is important.

Once the waveform is prepared, the ESP32 arms a hardware timer and DMA transfer. The DMA autonomously transfers the 100 samples from RAM to the DAC at a 200 kHz sample rate, corresponding to a 5 μs Zero-Order Hold (ZOH) interval. This allows the CPU to immediately enter Light Sleep instead of continuously driving the DAC in software.
When the DMA transfer finishes, a hardware interrupt wakes the CPU briefly. The CPU shuts down the DAC to prevent unnecessary static power consumption and then returns to sleep during the remaining LISTEN period.
This creates a time-shared TX/LISTEN cycle, allowing the same transducer path to be used for transmission and reception without simultaneous TX/RX conflict.

**ANALOG SIGNAL CONDITIONING AND POWER DELIVERY**

After digital synthesis and DAC conversion, the waveform becomes a low-voltage (~3.3 V) analog signal. This signal is then processed by analog front end to clean, amplify, and efficiently couple it to the piezoelectric sonar transducer.

Analog chain: 
1. Signal Routing: CD4051 Analog MUX
The CD4051 MUX routes the waveform to one of three dedicated Clear, Murky, or Muddy filter paths based on the environmental condition provided by the ESP32.
2. Signal Conditioning: LT1058 Filter
The selected path uses an LT1058 Sallen-Key 2nd-order Butterworth low-pass filter with a condition-specific cutoff frequency. It removes unwanted high-frequency switching noise and harmonics, producing a cleaner ~3.3 V waveform.
3. Power Amplification: LM318M + Class-AB Stage
The filtered signal is amplified using an LM318M driver with a 7.2× feedback gain, followed by a Class-AB BD139/BD140 push-pull stage powered from 18 V rails. This provides the high-voltage, high-current drive required by the transducer, targeting approximately 24 Vpp output.
4. Impedance Matching: LC Network
Since the piezoelectric transducer behaves predominantly as a capacitive load, the LC network uses an inductive component to compensate for its capacitive reactance, improve electrical resonance, and enable more efficient power transfer.
5. Acoustic Transmission: Piezoelectric Transducer
The matched high-voltage waveform is applied to the piezoelectric transducer, which converts the electrical excitation into mechanical vibration and generates the acoustic sonar pulse in water.

This completes the transmitter-side signal chain, with the transducer converting the conditioned electrical waveform into the acoustic sonar pulse for underwater transmission.

## 4. Key Features

- **Real-Time Environmental Adaptation:** Dynamically adapts waveform parameters using turbidity, depth, and temperature.
- **Adaptive 100–500 kHz Operation:** Shifts frequency according to turbidity to reduce scattering.
- **Consistent 2 cm Resolution:** Dynamically compensates bandwidth across operating frequencies.
- **3-Mode Waveform Selection:** Automatically switches between LFM Chirp, Geometric Sweep, and Barker-13 Phase Coding.
- **Temperature-Based Correction:** Continuously calculates acoustic velocity for accurate bandwidth control.
- **Dual-Stage Signal Conditioning:** Combines digital windowing with dedicated analog filtering to reduce sidelobes, noise, and harmonics.
- **DMA-Based Low-Power Operation:** Uses hardware-timed DMA waveform output with a 5 ms TX / 15 ms LISTEN cycle.
- **Impedance-Matched Transducer Drive:** Uses amplification and LC matching for efficient power transfer to the piezoelectric transducer.

## 5. Technology Stack

- **Simulation / Signal Design:** MATLAB R2026a (Simulink, DSP System Toolbox), LTSpice 
- **Embedded Firmware:** ESP32 (C, hardware timers, ISR-driven waveform synthesis, DMA)
- **DAC (Phase 2 hardware):** MCP4921 (SPI)
- **Analog Front End:** CD4051 analog MUX, LT1058 Sallen-Key active filters, LM318M / Class-AB power amplifier, LC impedance matching network
- **Version Control:** Git / GitHub

## 6. Architecture

The system follows an adaptive digital-to-analog signal chain in which environmental inputs determine the transmission frequency, pulse duration, sound-velocity correction, and modulation mode. 
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
                  │ Mode 0: LFM Chirp           │
                  │ Mode 1: Geometric Sweep     │
                  │ Mode 2: Barker-13           │
                  └─────────────────────────────┘
                                    │
                                    ▼
                       Conditional Windowing
                       (Blackman / Tukey)
                                    │
                                    ▼
                       TX/LISTEN Pulse Gating
                         (0.02 s, 25% duty)
                                    │
                                    ▼
                        Buffer (100) → Unbuffer
                                    │
                                    ▼
                         ZOH (5 μs / 200 kHz)
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

## 7. Repository Structure

```
sih-2026/
├── README.md
├── submission/
│   ├── PRESENTATION.md      # link to final PPT
│   └── DEMO.md              # link to prototype demo video
├── src/
│   ├── simulink/
│   │   └── before_dac_model.slx     # digital pipeline (Decision Logic -> ... -> ZOH -> DAC)
│   ├── esp32-firmware/
│   │   └── esp32-firmware.ino       # ESP32 firmware (tested build)
│   └── ltspice/
│       ├── after_dac_model.asc      # analog front-end circuit (after DAC)
│       └── working_analog.asc       # working analog reference circuit
├── docs/
│   └── architecture.md
├── assets/
│   └── screenshots/
        ├── after_dac_schematic.jpeg
│       ├── after_dac_waveform.jpeg
│       ├── before_dac_full_pipeline.png
│       ├── decision_logic.jpeg
│       ├── mod_select_decision.jpeg
│       ├── modulation_selector.jpeg
│       ├── mode0_lfm_final.jpeg
│       ├── mode0_lfm_raw.jpeg
│       ├── mode1_geometricalsweep_final.jpeg
│       ├── mode1_geometricalsweep_raw.jpeg
│       ├── mode2_phasecoded_final.jpeg
│       └── mode2_phasecoded_raw.jpeg
│       └── README.md
├── .gitignore
└── LICENSE
```

## 8. Final Presentation

[View the Final Presentation](submission/PRESENTATION.md)

## 9. Demo Video

[View the Prototype Demo](submission/DEMO.md)

## 10. Screenshots / Prototype Photos

Simulink model screenshots, waveform captures, decision-logic results and analog front-end/prototype images are available in: [assets/screenshots/README.md](assets/screenshots/README.md) 

## 11. Installation

Clone the repository and install the required dependencies:
```
bash
git clone https://github.com/Bharat2310/sih-2026.git
cd sih-2026

```

Prerequisites
1. MATLAB R2026a with Simulink and DSP System Toolbox
2. LTspice
3. Arduino IDE or PlatformIO for ESP32 firmware

## 12. Run

- **Before-DAC Simulink model (Team A):** Open `src/simulink/before_dac_model.slx` in MATLAB R2026a and run. Remember to redefine the Blackman window variable in the Command Window after every MATLAB restart:
  ```matlab
  N=100; n=(0:N-1)'; w=0.42-0.5*cos(2*pi*n/(N-1))+0.08*cos(4*pi*n/(N-1));
  ```
- **After-DAC analog front-end model (Team B):** Open `src/simulink/after_dac_model.slx` in MATLAB R2026a (Simscape) and run.
- **ESP32 firmware:** Flash `src/esp32-firmware/` to the ESP32 board using the Arduino IDE or PlatformIO.
- **Backend:** see `auv-backend/README.md` (or its own run instructions) for setup.
- **Frontend:** see `sih_tech_frontend/README.md` (or its own run instructions) for setup.

## 13. Future Scope

- **Higher-Rate ZOH:** Increase the ZOH sample rate from 200 kHz to ≥1.25 MHz to support the 500 kHz operating band without Nyquist violation
- **Ping-Pong Buffering:** Dual-buffer DMA scheme so the CPU synthesizes the next 100-sample frame while DMA transmits the current one, minimizing CPU active time with zero inter-frame latency/jitter (trade-off: doubles RAM footprint). Planned refinement: hardware-level automatic buffer-pointer swap on DMA interrupt.
- **Fixed-Point DSP:** Replace floating-point calculations with Q15 arithmetic and SRAM lookup tables for faster, low-overhead waveform generation.
- **ADC Hysteresis & Deadbanding (EMA filtering):** Smooths turbidity/temperature ADC reads so the system reacts to real environmental trends instead of chattering between modes around hard thresholds (e.g. 2.4V turbidity), at the cost of slight reaction lag. Planned refinement: bit-shifting EMA calculations instead of division to remove CPU overhead.
- **Dynamic Voltage Scaling:** Dynamically adjust the amplifier supply from approximately 9 V to 24 V according to environmental conditions, with up to 40% projected battery-life improvement.
- **High-Slew Analog Drive:** Use high-slew-rate op-amps with appropriate windowing to reliably support phase-coded waveforms such as Barker-13.

