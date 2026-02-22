import React, { useRef, useEffect, useState, useCallback } from 'react';
import Webcam from 'react-webcam';
import './VideoStream.css';

interface VideoStreamProps {
  onDetectionsUpdate: (detections: any[]) => void;
  onStatusChange: (status: 'connecting' | 'connected' | 'disconnected') => void;
  onStatsUpdate: (stats: any) => void;
  debugMode: boolean;
  onToggleDebug: () => void;
  serverStatus: 'connecting' | 'connected' | 'disconnected';
}

const VideoStream: React.FC<VideoStreamProps> = ({
  onDetectionsUpdate,
  onStatusChange,
  onStatsUpdate,
  debugMode,
  onToggleDebug,
  serverStatus,
}) => {
  const webcamRef = useRef<Webcam>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const isStreamingRef = useRef(false);
  const frameCountRef = useRef(0);
  const lastDetectionsRef = useRef<any[]>([]);
  const currentFpsRef = useRef(0);
  const statsRef = useRef({
    framesSent: 0,
    framesProcessed: 0,
    latencies: [] as number[],
    timestamps: [] as number[],
  });

  // Connect to WebSocket on mount
  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const resolveWebSocketUrl = useCallback(() => {
    const envUrl = process.env.REACT_APP_WS_URL?.trim();
    if (envUrl) {
      return envUrl;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.hostname}:8000/ws/stream`;
  }, []);

  const connectWebSocket = useCallback(() => {
    onStatusChange('connecting');

    const wsUrl = resolveWebSocketUrl();

    try {
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        onStatusChange('connected');
      };

      ws.onmessage = (event) => {
        try {
          const detectionData = JSON.parse(event.data);
          
          if (detectionData.status === 'success') {
            lastDetectionsRef.current = detectionData.detections || [];
            onDetectionsUpdate(detectionData.detections);
            
            // Track latency
            statsRef.current.framesProcessed++;
            if (detectionData.inference_time_ms) {
              statsRef.current.latencies.push(detectionData.inference_time_ms);
              if (statsRef.current.latencies.length > 100) {
                statsRef.current.latencies.shift();
              }
            }
          }
        } catch (error) {
          console.error('Error parsing detection data:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onStatusChange('disconnected');
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        onStatusChange('disconnected');
        // Attempt to reconnect after 3 seconds
        setTimeout(connectWebSocket, 3000);
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      onStatusChange('disconnected');
      setTimeout(connectWebSocket, 3000);
    }
  }, [onStatusChange, onDetectionsUpdate, resolveWebSocketUrl]);

  // Start streaming video frames
  const startStreaming = useCallback(() => {
    setIsStreaming(true);
    isStreamingRef.current = true;
    
    const captureAndSend = () => {
      if (!isStreamingRef.current || !webcamRef.current || !canvasRef.current) return;

      const video = webcamRef.current.video;
      if (!video) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Set canvas size to match video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // Convert to JPEG blob and send
      canvas.toBlob(
        (blob) => {
          if (blob && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(blob);
            statsRef.current.framesSent++;
            frameCountRef.current++;
          }
        },
        'image/jpeg',
        0.8 // 80% quality
      );

      // Schedule next frame (aim for 20 FPS: 50ms interval)
      setTimeout(captureAndSend, 50);
    };

    captureAndSend();
  }, [isStreaming]);

  const stopStreaming = useCallback(() => {
    setIsStreaming(false);
    isStreamingRef.current = false;
  }, []);

  const toggleCamera = useCallback(() => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  }, []);

  // Update stats periodically
  useEffect(() => {
    const statsInterval = setInterval(() => {
      const avgLatency =
        statsRef.current.latencies.length > 0
          ? statsRef.current.latencies.reduce((a, b) => a + b, 0) /
            statsRef.current.latencies.length
          : 0;

      // Calculate FPS from timestamps
      const now = Date.now();
      const recentTimestamps = statsRef.current.timestamps.filter((t) => now - t < 1000);
      const currentFPS = recentTimestamps.length;
      currentFpsRef.current = currentFPS;

      onStatsUpdate({
        framesSent: statsRef.current.framesSent,
        framesProcessed: statsRef.current.framesProcessed,
        avgLatency,
        currentFPS,
      });

      statsRef.current.timestamps.push(now);
      if (statsRef.current.timestamps.length > 300) {
        statsRef.current.timestamps.shift();
      }
    }, 1000);

    return () => clearInterval(statsInterval);
  }, [onStatsUpdate]);

  // Draw detections on overlay canvas
  useEffect(() => {
    if (!overlayCanvasRef.current || !webcamRef.current?.video) return;

    const video = webcamRef.current.video;
    const canvas = overlayCanvasRef.current;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
    }

    const drawFrame = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw detections
      lastDetectionsRef.current.forEach((detection) => {
        const { x, y, width, height, label, confidence } = detection;

        // Draw bounding box
        ctx.strokeStyle = 'rgb(0, 255, 0)';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, width, height);

        // Draw label
        const text = debugMode ? `${label} ${(confidence * 100).toFixed(0)}%` : label;
        ctx.fillStyle = 'rgb(0, 255, 0)';
        ctx.font = 'bold 16px Arial';
        const textMetrics = ctx.measureText(text);
        const textHeight = 20;

        // Background for text
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(x, y - textHeight - 4, textMetrics.width + 8, textHeight + 4);

        // Text
        ctx.fillStyle = 'rgb(0, 255, 0)';
        ctx.fillText(text, x + 4, y - 6);
      });

      if (isStreamingRef.current) {
        requestAnimationFrame(drawFrame);
      }
    };

    if (isStreaming) {
      drawFrame();
    }
  }, [isStreaming, debugMode]);

  return (
    <div className="video-stream-container">
      <div className="video-wrapper">
        <Webcam
          ref={webcamRef}
          audio={false}
          videoConstraints={{
            width: 1920,
            height: 1080,
            facingMode: facingMode,
          }}
          className="webcam"
        />
        <canvas ref={overlayCanvasRef} className="overlay-canvas" />
        
        <div className="camera-info">
          <div className="info-text">
            Frames: {statsRef.current.framesSent} | Detected: {statsRef.current.framesProcessed} | FPS: {currentFpsRef.current || 0}
          </div>
          <div className="info-text">
            Objects: {lastDetectionsRef.current.length}
          </div>
        </div>

        <div className="floating-controls">
          {!isStreaming ? (
            <button className="btn-circle btn-primary" onClick={startStreaming} title="Start Streaming">
              ▶
            </button>
          ) : (
            <button className="btn-circle btn-danger" onClick={stopStreaming} title="Stop Streaming">
              ⏹
            </button>
          )}
          <button className="btn-circle btn-secondary" onClick={toggleCamera} title="Turn Camera">
            🔄
          </button>
          <button 
            className={`btn-circle btn-debug ${debugMode ? 'active' : ''}`} 
            onClick={onToggleDebug} 
            title={debugMode ? 'Debug ON' : 'Debug OFF'}
          >
            🐛
          </button>
          <div className={`status-badge ${serverStatus}`}>
            {serverStatus.charAt(0).toUpperCase() + serverStatus.slice(1)}
          </div>
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
};

export default VideoStream;
