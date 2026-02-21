import React from 'react';
import './DetectionDisplay.css';

interface DetectionDisplayProps {
  detections: any[];
  debugMode: boolean;
}

const DetectionDisplay: React.FC<DetectionDisplayProps> = ({ detections, debugMode }) => {
  return (
    <div className="detection-display">
      <h3>Detections ({detections.length})</h3>
      {detections.length === 0 ? (
        <p className="no-detections">No objects detected</p>
      ) : (
        <ul className="detections-list">
          {detections.map((det, idx) => (
            <li key={idx} className="detection-item">
              <span className="label">{det.label}</span>
              {debugMode && (
                <>
                  <span className="confidence">{(det.confidence * 100).toFixed(0)}%</span>
                  <span className="coords">
                    x:{det.x} y:{det.y} w:{det.width} h:{det.height}
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default DetectionDisplay;
