import React, { useState, useRef, useEffect, useCallback } from 'react';
import Webcam from 'react-webcam';
import './App.css';
import VideoStream from './components/VideoStream';
import DetectionDisplay from './components/DetectionDisplay';
import StatusPanel from './components/StatusPanel';

function App() {
  const [serverStatus, setServerStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const [detections, setDetections] = useState<any[]>([]);
  const [debug, setDebug] = useState(false);
  const [stats, setStats] = useState({
    framesSent: 0,
    framesProcessed: 0,
    avgLatency: 0,
    currentFPS: 0,
  });

  const handleDetectionsUpdate = useCallback((newDetections: any[]) => {
    setDetections(newDetections);
  }, []);

  const handleStatusChange = useCallback((status: 'connecting' | 'connected' | 'disconnected') => {
    setServerStatus(status);
  }, []);

  const handleStatsUpdate = useCallback((newStats: any) => {
    setStats(newStats);
  }, []);

  const toggleDebug = () => {
    setDebug(!debug);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🎯 Real-time Object Detection</h1>
        <div className="header-controls">
          <button 
            className={`debug-btn ${debug ? 'active' : ''}`}
            onClick={toggleDebug}
          >
            {debug ? '🐛 Debug ON' : '🐛 Debug OFF'}
          </button>
          <div className={`status-indicator ${serverStatus}`}>
            {serverStatus.toUpperCase()}
          </div>
        </div>
      </header>

      <main className="main-container">
        <div className="video-section">
          <VideoStream
            onDetectionsUpdate={handleDetectionsUpdate}
            onStatusChange={handleStatusChange}
            onStatsUpdate={handleStatsUpdate}
            debugMode={debug}
          />
        </div>

        <aside className="sidebar">
          <StatusPanel 
            status={serverStatus}
            detections={detections}
            stats={stats}
            debugMode={debug}
          />
        </aside>
      </main>

      <footer className="footer">
        <p>RTX 4070 • YOLOv8m • 1080p @ ~20-25 FPS</p>
      </footer>
    </div>
  );
}

export default App;
