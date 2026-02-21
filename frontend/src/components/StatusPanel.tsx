import React from 'react';
import './StatusPanel.css';

interface StatusPanelProps {
  status: 'connecting' | 'connected' | 'disconnected';
  detections: any[];
  stats: {
    framesSent: number;
    framesProcessed: number;
    avgLatency: number;
    currentFPS: number;
  };
  debugMode: boolean;
}

const StatusPanel: React.FC<StatusPanelProps> = ({ status, detections, stats, debugMode }) => {
  return (
    <div className="status-panel">
      <div className="panel-section">
        <h3>Connection</h3>
        <p><strong>Status:</strong> <span className={`status-badge ${status}`}>{status}</span></p>
      </div>

      <div className="panel-section">
        <h3>Performance</h3>
        <p><strong>Frames Sent:</strong> {stats.framesSent}</p>
        <p><strong>Frames Processed:</strong> {stats.framesProcessed}</p>
        <p><strong>Current FPS:</strong> {stats.currentFPS.toFixed(1)}</p>
        <p><strong>Avg Latency:</strong> {stats.avgLatency.toFixed(0)}ms</p>
      </div>

      <div className="panel-section">
        <h3>Current Detections</h3>
        {detections.length === 0 ? (
          <p className="no-detections">No objects detected</p>
        ) : (
          <ul className="detection-list">
            {detections.map((det, idx) => (
              <li key={idx} className="detection-item">
                <strong>{det.label}</strong>
                {debugMode && (
                  <>
                    <span className="confidence">{(det.confidence * 100).toFixed(0)}%</span>
                    <span className="coords">({det.x}, {det.y})</span>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {debugMode && (
        <div className="panel-section debug-section">
          <h3>Debug Info</h3>
          <p><strong>Total Detections:</strong> {detections.length}</p>
          <p><small>Show confidence scores, coordinates, and raw data</small></p>
        </div>
      )}
    </div>
  );
};

export default StatusPanel;
