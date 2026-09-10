#include <Arduino.h>
#include <math.h>
#include <SPI.h> // Included for DAC hardware communication

// --- Hardware Input Pins ---
#define PIN_TURB 32
#define PIN_DEPTH 33
#define PIN_TEMP 34

// --- DAC SPI Pins (Standard ESP32 VSPI) ---
#define PIN_DAC_CS 5 // Chip Select for the 8-pin DAC

// --- System Constants ---
const float dR_target = 0.02;          // 2 cm baseline range resolution
const int BUFFER_SIZE = 100;           // N = 100 samples per block
const float SAMPLE_RATE = 200000.0;    // 200 kHz
const float dt = 1.0 / SAMPLE_RATE;    // 5 microseconds (ZOH timestep)

// --- Barker-13 Code ---
const int barker13[13] = {1, 1, 1, 1, 1, -1, -1, 1, 1, -1, 1, -1, 1};

// --- Buffers ---
float wave_buffer[BUFFER_SIZE];

void setup() {
    Serial.begin(115200);
    
    // Initialize SPI bus for the DAC
    SPI.begin(); // Defaults: SCK = GPIO 18, MISO = GPIO 19, MOSI = GPIO 23
    pinMode(PIN_DAC_CS, OUTPUT);
    digitalWrite(PIN_DAC_CS, HIGH); // Unselect DAC initially to prevent floating writes
    
    delay(1000); // Allow ADCs to settle
}

void loop() {
    // ==========================================
    // STEP 1 & 2: INPUTS & DECISION LOGIC
    // ==========================================
    float turb_adc = analogRead(PIN_TURB);
    float depth_adc = analogRead(PIN_DEPTH);
    float temp_adc = analogRead(PIN_TEMP);

    float turbidity_voltage = (turb_adc / 4095.0) * 3.3;
    float depth_m = (depth_adc / 4095.0) * 100.0; 
    float temp = (temp_adc / 4095.0) * 40.0;      

    float f_center = map(turb_adc, 0, 4095, 500000, 100000); 
    float T_pulse = map(depth_adc, 0, 4095, 10, 100) / 1000.0; 

    float velocity = 1449.2 + 4.6 * temp - 0.055 * (temp * temp); 
    float B_req = velocity / (2 * dR_target); 
    float f0new = f_center - (B_req / 2.0);   
    float f1new = f_center + (B_req / 2.0);   

    // ==========================================
    // STEP 3: MOD SELECT DECISION BLOCK
    // ==========================================
    int mod_select;
    if (turbidity_voltage > 2.4) {            
        mod_select = 2; // Heavy silt: Phase-coded (Barker13)
    } else if (depth_m > 30.0) {              
        mod_select = 1; // Deep water: Geometric Sweep
    } else {
        mod_select = 0; // Shallow/Clear: LFM Chirp
    }

    // ==========================================
    // STEP 4, 5 & 6: SYNTHESIS & CONDITIONAL WINDOWING
    // ==========================================
    for (int i = 0; i < BUFFER_SIZE; i++) {
        float cycle_time = i * dt; 
        float sample_val = 0.0;

        if (mod_select == 0) { 
            float k = (f1new - f0new) / T_pulse;
            sample_val = sin(2 * PI * (f0new * cycle_time + (k / 2.0) * cycle_time * cycle_time));
        } 
        else if (mod_select == 1) { 
            float base = f1new / f0new;
            float exponent = cycle_time / T_pulse;
            float freq_inst = f0new * pow(base, exponent);
            sample_val = sin(2 * PI * freq_inst * cycle_time);
        } 
        else if (mod_select == 2) { 
            int chip_index = (int)(cycle_time / (T_pulse / 13.0));
            sample_val = sin(2 * PI * f_center * cycle_time) * barker13[min(chip_index, 12)];
        }

        float window_multiplier = 1.0;

        if (mod_select == 0 || mod_select == 1) {
            window_multiplier = 0.42 
                                - 0.5 * cos(2 * PI * i / (BUFFER_SIZE - 1)) 
                                + 0.08 * cos(4 * PI * i / (BUFFER_SIZE - 1));
        } 
        else if (mod_select == 2) {
            float taper = 0.1; 
            int t_samples = BUFFER_SIZE * taper / 2.0;

            if (i < t_samples) {
                window_multiplier = 0.5 * (1 + cos(PI * ((float)i / t_samples - 1)));
            } else if (i > (BUFFER_SIZE - t_samples)) {
                window_multiplier = 0.5 * (1 + cos(PI * ((float)(i - BUFFER_SIZE) / t_samples + 1)));
            }
        }

        wave_buffer[i] = sample_val * window_multiplier;
    }

    // ==========================================
    // STEP 7: HARDWARE DAC OUTPUT via SPI
    // ==========================================
    for (int i = 0; i < BUFFER_SIZE; i++) {
        // 1. Calculate the 12-bit value (0 to 4095)
        int dac_value = (int)((wave_buffer[i] + 1.0) * 2047.5);
        
        // 2. Hardware fail-safe constraint to prevent bit overflow
        if (dac_value > 4095) dac_value = 4095;
        if (dac_value < 0) dac_value = 0;

        // 3. Construct the 16-bit SPI payload (MCP4921 format)
        // 0x3000 adds the configuration bits: DAC A, Unbuffered, 1x Gain, Active Mode
        uint16_t spi_packet = 0x3000 | dac_value;

        // 4. Send the data to the DAC
        SPI.beginTransaction(SPISettings(20000000, MSBFIRST, SPI_MODE0));
        digitalWrite(PIN_DAC_CS, LOW);   // Select the DAC
        SPI.transfer16(spi_packet);      // Push the 16 bits
        digitalWrite(PIN_DAC_CS, HIGH);  // Deselect the DAC to latch the analog voltage
        SPI.endTransaction();
    }

    // Delay simulating the "Listen" phase before computing the next pulse
    delay(100); 
}
