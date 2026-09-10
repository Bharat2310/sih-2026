# Adaptive Underwater Sonar Transmitter for AUVs

## 1. Project Information

- **Project Title:** Adaptive Sonar — Software-Defined Chirp Transmitter for AUVs
- **PS ID:** _(fill in your actual SIH Problem Statement ID)_
- **PS Title:** _(fill in your actual PS title, e.g. "Adaptive sonar system for underwater vehicles operating across varying water conditions")_
- **Category:** Hardware
- **Theme:** Robotics and Drones / Defence

## 2. Problem Statement

Fixed-frequency sonar transmitters used in Autonomous Underwater Vehicles (AUVs) perform poorly when water conditions change. High turbidity, varying depth, and temperature gradients all affect how sound propagates underwater, causing loss of resolution, weak returns, or complete signal degradation. A sonar system tuned for clear, shallow water fails in turbid or deep-water conditions, and vice versa — there is no single fixed frequency/pulse configuration that works well everywhere.

## 3. Proposed Solution

We propose a **Software-Defined Sonar (SDS)** transmitter that adapts its waveform in real time based on sensed water conditions, instead of using a single fixed frequency.

The system continuously reads turbidity, depth, and temperature via ADC channels (mapped from potentiometer inputs at the current prototype stage) and uses this data to dynamically select:

- **Center frequency** (500 kHz / 250 kHz / 100 kHz) based on turbidity band — turbidity limits the base frequency band to prevent signal scattering
- **Pulse width (T_pulse)** (1 ms / 10 ms / 50 ms) based on depth band — depth dictates total pulse duration for deeper energy penetration
- **Modulation type** — automatically decided by the Mod_Select Decision Block, not manually selected: heavy silt (turbidity_voltage > 2.4V) forces Barker-13 phase-coded pulse (Mode 2, overrides all other conditions); deep water (depth_m > 30) forces Geometric Sweep (Mode 1); standard conditions default to LFM Chirp (Mode 0)
- **Sound velocity correction** using the Mackenzie (1981) formula, recalculated continuously from real-time temperature and fed directly into bandwidth correction every cycle
- A constant **2 cm range resolution (dR_target)** is maintained across all frequency bands via bandwidth compensation, so even at the worst case of 100 kHz no manual reconfiguration is needed

The design uses a time-shared TX/LISTEN cycle (based on Zhou et al.'s SDS architecture) so the same transducer path handles transmit and receive without conflict. Windowing is switched automatically depending on the modulation mode (Blackman for chirp/sweep, rectangular/light Tukey for phase-coded pulses) to control sidelobes correctly for each waveform type.

The full transmit-side signal chain (Team A) is validated in Simulink before being ported to embedded C for real-time execution on an ESP32, minimizing the risk of hardware damage during development and keeping debugging tractable. On the firmware side, the CPU synthesizes a 100-sample waveform array during the 5 ms TX window, arms a DMA transfer paced by a hardware timer to simulate a 200 kHz Zero-Order Hold, and immediately drops into Light Sleep — waking only briefly on a DMA-completion interrupt to shut the DAC down before sleeping through the remaining LISTEN window. The resulting analog signal is then routed and conditioned by Team B's analog front end (MUX → filter → amplifier → LC match → transducer).

## 4. Key Features

- Real-time adaptive frequency band switching based on turbidity, depth, and temperature
- Fully automatic modulation mode selection (LFM chirp / geometric sweep / Barker-13) via the Mod_Select Decision Block — no manual mode input required
- Continuous sound-velocity compensation (Mackenzie 1981 formula)
- Constant 2 cm range resolution maintained across all operating bands
- Time-shared TX/LISTEN pulse gating cycle (0.02s period, 25% duty — 5ms TX / 15ms LISTEN), Software-Defined Sonar architecture
- Simulink-verified signal chain before embedded firmware porting, reducing hardware risk
- DMA-driven ZOH output with CPU Light Sleep during transmission for power optimization

## 5. Technology Stack

- **Simulation / Signal Design:** MATLAB R2026a (Simulink, DSP System Toolbox)
- **Embedded Firmware:** ESP32 (C, hardware timers, ISR-driven waveform synthesis, DMA)
- **Analog Front End:** CD4051 analog MUX, LT1058 Sallen-Key active filters, LT1122 / Class-AB power amplifier, LC impedance matching network
- **DAC (Phase 2 hardware):** MCP4725 (I2C)
- **PCB / Schematic Design:** KiCad
- **Version Control:** Git / GitHub

## 6. Architecture

See [docs/architecture.md](docs/architecture.md) for the full block diagram and signal chain explanation.

```
Turbidity ADC ─┐
Depth ADC ─────┼──> Decision Logic + Mod_Select Decision Block ──> Center Freq, T_pulse, Sound Velocity, Mode (0/1/2)
Temperature ───┘                     |
                                      v
Modulation Selector (Mode 0: LFM Chirp / Mode 1: Geometric Sweep / Mode 2: Barker-13, auto-selected)
                                      |
                                      v
                        Conditional Windowing (Blackman / Rectangular-Tukey)
                                      |
                                      v
                    TX/LISTEN Pulse Gating (0.02s period, 25% duty cycle)
                                      |
                                      v
              Buffer(100) -> Unbuffer -> ZOH (5e-6s / 200kHz) -> DAC        [ Team A: digital chain ]
                                      |
                                      v
              MUX -> Sallen-Key Filter -> Amplifier (24Vpp) -> LC Match -> Transducer   [ Team B: analog front end ]
```

**Team A (digital chain):** ESP32 generates the raw waveform (LFM/sweep/Barker-13), applies Hamming/Blackman/Tukey windowing in software, and streams it through the buffer → ZOH → DAC pipeline via DMA while the CPU sleeps.

**Team B (analog front end):** The CD4051 MUX dynamically routes the DAC output to one of three environment-specific filter profiles (Clear/Murky/Muddy), driven by ESP32's routing signal as the frequency changes — a dedicated-path topology that avoids dynamically switching individual passive components. The LT1058 Sallen-Key stage (2nd-order Butterworth low-pass, 3 cutoff profiles) removes switching noise/harmonics before the LT1122 + Class-AB amplifier (7.2x gain, BD139/BD140 push-pull on 18V rails) delivers a clean 24Vpp signal with no crossover distortion. The LC impedance matching network then cancels the transducer's capacitive reactance to minimize reflected energy and heat.

## 7. Repository Structure

```
sih-2026/
├── README.md
├── SUBMISSION_GUIDE.md
├── submission/
│   ├── PRESENTATION.md      # link to final PPT
│   └── DEMO.md              # link to prototype demo video
├── src/
│   ├── simulink/
│   │   ├── before_dac_model.slx     # Team A - digital chirp pipeline (Decision Logic -> ... -> ZOH -> DAC)
│   │   └── after_dac_model.slx      # Team B - analog front-end Simscape model (MUX -> Filter -> Amp -> LC Match)
│   └── esp32-firmware/
│       └── (ESP32 .ino / .c / .h source files)
├── docs/
│   └── architecture.md
├── assets/
│   └── screenshots/
│       ├── before-dac-result.png    # Team A simulation result screenshot
│       ├── after-dac-result.png     # Team B simulation result screenshot
│       └── README.md
├── auv-backend/          # existing backend code
├── sih_tech_frontend/    # existing frontend code
├── requirements.txt
├── .gitignore
└── LICENSE
```

### What goes where?

| Item                                          | Location                                |
| ------------------------------------------------ | ------------------------------------------ |
| Simulink model - before DAC (Team A)            | `src/simulink/before_dac_model.slx`         |
| Simulink/Simscape model - after DAC (Team B)    | `src/simulink/after_dac_model.slx`          |
| ESP32 firmware                                  | `src/esp32-firmware/`                       |
| Backend code                                    | `auv-backend/`                              |
| Frontend / dashboard code                       | `sih_tech_frontend/`                        |
| Architecture / technical documentation          | `docs/`                                     |
| Screenshots of both models' results             | `assets/screenshots/`                       |
| Final PPT link                                  | `submission/PRESENTATION.md`                |
| Prototype demo video link                       | `submission/DEMO.md`                        |
| Project overview                                | `README.md`                                 |

## 8. Final Presentation

See [submission/PRESENTATION.md](submission/PRESENTATION.md) for the presentation summary and link.

If the PPT is too large for GitHub, use Google Drive/OneDrive and put the accessible viewer link in `submission/PRESENTATION.md`.

## 9. Demo Video

Add the YouTube/Google Drive demo link in [submission/DEMO.md](submission/DEMO.md).

## 10. Screenshots / Prototype Photos

Add Simulink model screenshots, scope captures, and hardware/prototype photos to:

`assets/screenshots/`

See [assets/screenshots/README.md](assets/screenshots/README.md) for naming conventions.

## 11. Installation

```
git clone <YOUR_REPOSITORY_URL>
cd sih-2026
pip install -r requirements.txt
```

MATLAB/Simulink models require **MATLAB R2026a** with the **DSP System Toolbox** installed. Open `src/` and load the `.slx` model directly in Simulink.

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

- Update the ZOH sample rate (currently 200 kHz) to at least 1.25 MHz+ to properly support the 500 kHz band without Nyquist violation
- Confirm actual depth threshold values with the analog/hardware team (currently placeholder midpoints: 2.5 m / 17.5 m / 30 m)
- **Ping-Pong Buffering:** Dual-buffer DMA scheme so the CPU synthesizes the next 100-sample frame while DMA transmits the current one, minimizing CPU active time with zero inter-frame latency/jitter (trade-off: doubles RAM footprint). Planned refinement: hardware-level automatic buffer-pointer swap on DMA interrupt.
- **ADC Hysteresis & Deadbanding (EMA filtering):** Smooths turbidity/temperature ADC reads so the system reacts to real environmental trends instead of chattering between modes around hard thresholds (e.g. 2.4V turbidity), at the cost of slight reaction lag. Planned refinement: bit-shifting EMA calculations instead of division to remove CPU overhead.
- Dynamic Voltage Scaling (DVS) via a digitally controlled DC-DC boost converter for extended battery life (~40% projected improvement)
- Migrate MCP4725 I2C DAC output to DMA + hardware-timer-driven streaming to remove I2C speed bottlenecks at high frequencies
- Integrate the adaptive chirp signal into the full power-delivery Simscape model (buck converter reference input)

## Important

Before submission, make sure the repository is accessible to reviewers. Do **not** upload passwords, API keys, access tokens, `.env` files containing secrets, or other confidential credentials.
