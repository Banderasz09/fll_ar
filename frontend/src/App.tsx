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
      <main className="main-container">
        <div className="video-section">
          <VideoStream
            onDetectionsUpdate={handleDetectionsUpdate}
            onStatusChange={handleStatusChange}
            onStatsUpdate={handleStatsUpdate}
            debugMode={debug}
            onToggleDebug={toggleDebug}
            serverStatus={serverStatus}
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
    </div>
  );
}

export default App;
