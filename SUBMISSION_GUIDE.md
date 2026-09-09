# Submission Guide

This guide explains how to finalize this repository before submitting the GitHub link for SIH 2026.

## Checklist

- [ ] `README.md` filled with accurate project title, PS ID, PS title, category, and theme
- [ ] Problem statement and proposed solution sections reflect the final version presented to evaluators
- [ ] Architecture diagram in `docs/architecture.md` matches the final Simulink pipeline and hardware block diagram
- [ ] `src/` contains the final Simulink model(s) and ESP32 firmware source (not intermediate/debug versions)
- [ ] `auv-backend/` and `sih_tech_frontend/` are up to date and runnable
- [ ] Screenshots of the Simulink model, key scope outputs, and hardware/prototype photos added to `assets/screenshots/`
- [ ] `submission/PRESENTATION.md` updated with the final PPT or an accessible viewer link
- [ ] `submission/DEMO.md` updated with the demo video link (if available)
- [ ] `requirements.txt` reflects actual Python dependencies used in `auv-backend/`
- [ ] No API keys, tokens, passwords, or `.env` secrets committed anywhere in the repo
- [ ] Repository visibility is set to **Public** (or otherwise accessible to reviewers)
- [ ] All team members are added as collaborators (optional, but recommended)

## Notes for This Project

- Team A (Simulink + ESP32 firmware) and Team B (analog circuits + KiCad schematics) each own separate parts of `src/` — keep folders clearly separated (e.g. `src/simulink/`, `src/esp32-firmware/`, `src/kicad/`) to avoid overwriting each other's work.
- Flag any placeholder values (e.g. depth thresholds) clearly in `docs/architecture.md` so evaluators understand what is confirmed vs. pending.
- Keep the Benefits list and Impact list in the presentation clearly separated, as finalized in the PPT.

## Final Check

Before submitting, open the repository in an incognito/private browser window (logged out of GitHub) to confirm reviewers without special access can view everything.
