import asyncio
import json
import math
import time
import random
# pyrefly: ignore [missing-import]
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
# pyrefly: ignore [missing-import]
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Allow React to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def generate_wave(turbidity=0.0, water_level=30.0, noise_level=15.0):
    """Generates an array of 200 data points simulating the DAC output.
    
    Dynamically computes start (f0) and end (f1) frequencies as continuous
    functions of turbidity, water level (depth), and noise level.
    """
    array = []
    # Normalized parameters (0.0 to 1.0)
    t_norm = turbidity / 100.0
    d_norm = water_level / 100.0
    n_norm = noise_level / 100.0
    
    # Calculate center frequency (in cycles per window)
    # Higher turbidity & depth decrease center frequency to resist attenuation
    f_c = 25.0 - 15.0 * t_norm - 7.0 * d_norm
    
    # Calculate bandwidth (sweep range)
    # Higher noise increases bandwidth to gain processing gain
    df = 8.0 + 12.0 * n_norm
    
    f0 = max(1.0, f_c - df / 2.0)
    f1 = max(2.0, f_c + df / 2.0)
    
    # Exponential absorption/attenuation factor (alpha increases with center frequency)
    # High frequency absorption is high (~1.8), low frequency is low (~0.4)
    alpha = 0.4 + 1.4 * (f_c / 25.0)
    attenuation = math.exp(-alpha * d_norm)
    
    for i in range(200):
        t = i / 200.0
        
        # 1. LFM Chirp Phase: phi = 2*pi*(f0*t + ((f1 - f0)/2)*t^2)
        phi = 2.0 * math.pi * (f0 * t + ((f1 - f0) / 2.0) * (t ** 2))
        signal = math.sin(phi)
        
        # 2. Hann Window: w(t) = 0.5 * (1 - cos(2*pi*t))
        hann = 0.5 * (1.0 - math.cos(2.0 * math.pi * t))
        windowed_signal = signal * hann
        
        # 3. Apply Attenuation
        attenuated_signal = windowed_signal * attenuation
        
        # 4. Additive Random Noise
        noise = random.uniform(-1.0, 1.0) * n_norm
        
        # Total signal
        total_val = attenuated_signal + noise
        
        # 5. Offset and clip to 8-bit DAC range (0 - 255)
        dac_val = int(127.5 + 127.5 * total_val)
        dac_val = max(0, min(255, dac_val))
        
        array.append(dac_val)
        
    return array

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    
    # Default Environment Variables
    turbidity = 0.0
    water_level = 30.0
    noise_level = 15.0
    
    # Default Hardware State
    battery = 100.0
    
    try:
        while True:
            # 1. Check if React UI sent a slider command
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.05)
                command = json.loads(data)
                
                # Update environmental parameters from sliders
                if "turbidity" in command:
                    turbidity = float(command["turbidity"])
                if "water_level" in command:
                    water_level = float(command["water_level"])
                if "noise_level" in command:
                    noise_level = float(command["noise_level"])
                    
            except asyncio.TimeoutError:
                pass # No slider movement received this cycle
                
            # 2. Dynamic Adaptive Sonar mode selection & frequency calculations
            f_c = 25.0 - 15.0 * (turbidity / 100.0) - 7.0 * (water_level / 100.0)
            phys_freq_kHz = f_c * 15.0  # Center frequency mapped to physical kHz range (45kHz to 375kHz)
            
            if phys_freq_kHz > 250.0:
                mode = f"HIGH-RES PING ({phys_freq_kHz:.1f} kHz)"
                base_power = 15.0
            elif phys_freq_kHz > 120.0:
                mode = f"MED-RES CHIRP ({phys_freq_kHz:.1f} kHz)"
                base_power = 40.0
            else:
                mode = f"DEEP PENETRATION CHIRP ({phys_freq_kHz:.1f} kHz)"
                base_power = 65.0
                
            power_draw = base_power + 25.0 * (water_level / 100.0)
            
            # Simulate battery drain if pulling power
            battery_drain = (power_draw / 3600.0) * 0.05
            battery = max(0.0, battery - battery_drain)
                
            # 3. Build the JSON API Contract
            payload = {
                "timestamp": int(time.time()),
                "telemetry": {
                    "current_draw_mA": round(power_draw + random.uniform(-1, 1), 1),
                    "active_mode": mode,
                    "battery_remaining": round(battery, 2)
                },
                "wave_data": generate_wave(turbidity, water_level, noise_level)
            }
            
            # 4. Stream to React
            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(0.3) # Stream rate: ~3 frames per second
            
    except WebSocketDisconnect:
        print("Frontend Client Disconnected")

# Run via terminal: uvicorn main:app --reload