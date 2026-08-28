import React, { useState, useEffect, useRef } from 'react';
import { Line } from 'react-chartjs-2';
import 'chart.js/auto';

export default function App() {
  const [telemetry, setTelemetry] = useState({ current_draw_mA: 0, active_mode: 'INITIALIZING...', battery_remaining: 100 });
  const [powerHistory, setPowerHistory] = useState([]);
  const [turbidity, setTurbidity] = useState(0);
  const [waterLevel, setWaterLevel] = useState(30);
  const [noiseLevel, setNoiseLevel] = useState(15);

  const ws = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    // 1. Establish WebSocket connection
    ws.current = new WebSocket('ws://localhost:8000/ws');

    ws.current.onopen = () => {
      // Synchronize initial UI control state with backend upon connect
      sendControlState(0, 30, 15);
    };

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setTelemetry(data.telemetry);

      // 2. Update Power Chart Array
      setPowerHistory(prev => {
        const newHistory = [...prev, { time: new Date().toLocaleTimeString(), power: data.telemetry.current_draw_mA }];
        if (newHistory.length > 20) newHistory.shift(); // Keep chart from overflowing
        return newHistory;
      });

      // 3. Trigger Spectrogram render
      drawWaterfall(data.wave_data);
    };

    return () => ws.current.close();
  }, []);

  // HTML5 Canvas approach for hyper-fast real-time spectrogram rendering
  const drawWaterfall = (waveArray) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Shift old pixels down by 4 pixels to create the "Waterfall" movement
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height - 4);
    ctx.putImageData(imgData, 0, 4);

    // Draw the new incoming wave data at the very top row
    const barWidth = canvas.width / waveArray.length;
    waveArray.forEach((val, index) => {
      // Map 0-255 amplitude to a heat-map color (Blue = cold/low, Red = hot/high)
      const r = val;
      const g = 50;
      const b = 255 - val;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(index * barWidth, 0, barWidth, 4);
    });
  };

  const sendControlState = (t, w, n) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({ turbidity: t, water_level: w, noise_level: n }));
    }
  };

  const handleTurbidityChange = (e) => {
    const val = parseInt(e.target.value, 10);
    setTurbidity(val);
    sendControlState(val, waterLevel, noiseLevel);
  };

  const handleWaterLevelChange = (e) => {
    const val = parseFloat(e.target.value);
    setWaterLevel(val);
    sendControlState(turbidity, val, noiseLevel);
  };

  const handleNoiseLevelChange = (e) => {
    const val = parseFloat(e.target.value);
    setNoiseLevel(val);
    sendControlState(turbidity, waterLevel, val);
  };

  // Chart.js Configuration
  const chartData = {
    labels: powerHistory.map(d => d.time),
    datasets: [{
      label: 'Power Draw (mA)',
      data: powerHistory.map(d => d.power),
      borderColor: '#10b981', // Tailwind Emerald 500
      tension: 0.1,
      pointRadius: 0
    }]
  };

  const chartOptions = { animation: false, scales: { y: { min: 0, max: 100 } } };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8 font-sans">
      <h1 className="text-3xl font-bold mb-8 text-emerald-400 border-b border-gray-700 pb-4">
        AUV Sonar Ground Control
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Module 1: The Interactive Environment Simulator */}
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-lg flex flex-col justify-between">
          <div>
            <h2 className="text-xl font-semibold mb-6 text-emerald-400">Environment Simulator</h2>
            
            {/* Turbidity Slider */}
            <div className="mb-5">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-300 font-medium">Turbidity (Mud Level)</span>
                <span className="text-emerald-400 font-mono">{turbidity} NTU</span>
              </div>
              <input
                type="range" min="0" max="100" value={turbidity} onChange={handleTurbidityChange}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="text-xs text-gray-500 mt-1 block font-sans">
                {turbidity > 50 ? "Adaptive Low-Freq LFM Active" : "High-Freq Ping Active"}
              </span>
            </div>

            {/* Water Depth Slider */}
            <div className="mb-5">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-300 font-medium">Water Depth</span>
                <span className="text-emerald-400 font-mono">{waterLevel} m</span>
              </div>
              <input
                type="range" min="0" max="100" value={waterLevel} onChange={handleWaterLevelChange}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="text-xs text-gray-500 mt-1 block font-sans">
                Controls signal propagation path & medium absorption.
              </span>
            </div>

            {/* Background Noise Slider */}
            <div className="mb-5">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-gray-300 font-medium">Ambient Acoustic Noise</span>
                <span className="text-emerald-400 font-mono">{noiseLevel}%</span>
              </div>
              <input
                type="range" min="0" max="100" value={noiseLevel} onChange={handleNoiseLevelChange}
                className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-emerald-500"
              />
              <span className="text-xs text-gray-500 mt-1 block font-sans">
                Adds random white noise to the acoustic return.
              </span>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-gray-700">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Active Transmission Mode</h3>
            <p className="text-2xl font-mono text-emerald-400 mt-2">{telemetry.active_mode}</p>
          </div>
        </div>

        {/* Module 2: The Real-Time Spectrogram */}
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-lg md:col-span-2">
          <h2 className="text-xl font-semibold mb-4 text-gray-300">Live Waveform Spectrogram</h2>
          <div className="w-full h-48 bg-black rounded overflow-hidden">
            <canvas ref={canvasRef} width={800} height={200} className="w-full h-full" />
          </div>
        </div>

        {/* Module 3: Power Profiling Analytics */}
        <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 shadow-lg md:col-span-3">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-300">Payload Power Profiling</h2>
            <p className="text-sm font-mono text-gray-400">Batt: {telemetry.battery_remaining}%</p>
          </div>
          <div className="h-64 w-full">
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

      </div>
    </div>
  );
}