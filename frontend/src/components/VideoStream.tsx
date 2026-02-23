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
  const videoWrapperRef = useRef<HTMLDivElement>(null);
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

  // Handle orientation changes on mobile
  useEffect(() => {
    const handleOrientationChange = () => {
      // Force a small delay to allow the browser to finish the orientation transition
      setTimeout(() => {
        if (overlayCanvasRef.current && webcamRef.current?.video) {
          const video = webcamRef.current.video;
          const canvas = overlayCanvasRef.current;
          
          // Reset canvas dimensions to match video dimensions exactly
          canvas.width = video.videoWidth || 1920;
          canvas.height = video.videoHeight || 1080;
          
          // Force the canvas to repaint
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
          }
        }
      }, 50);
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        // Exited fullscreen, unlock orientation
        if (screen.orientation && screen.orientation.unlock) {
          try {
            screen.orientation.unlock();
          } catch (err) {
            console.log('Orientation unlock failed:', err);
          }
        }
      }
    };

    // Listen for orientation changes and window resize
    window.addEventListener('orientationchange', handleOrientationChange);
    window.addEventListener('resize', handleOrientationChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    
    // Also handle when the video metadata is loaded for the first time
    if (webcamRef.current?.video) {
      webcamRef.current.video.addEventListener('loadedmetadata', handleOrientationChange);
    }

    return () => {
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.removeEventListener('resize', handleOrientationChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      if (webcamRef.current?.video) {
        webcamRef.current.video.removeEventListener('loadedmetadata', handleOrientationChange);
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

    // Request fullscreen on mobile devices
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile && videoWrapperRef.current) {
      const element = videoWrapperRef.current as any;
      
      // Try to lock the orientation to landscape for better streaming experience
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch((err: Error) => {
          console.log('Orientation lock failed:', err);
        });
      }
      
      if (element.requestFullscreen) {
        element.requestFullscreen().catch((err: Error) => console.log('Fullscreen request failed:', err));
      } else if (element.webkitRequestFullscreen) {
        element.webkitRequestFullscreen();
      } else if (element.mozRequestFullScreen) {
        element.mozRequestFullScreen();
      } else if (element.msRequestFullscreen) {
        element.msRequestFullscreen();
      }
    }
    
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
    
    // Unlock orientation when stopping stream
    if (screen.orientation && screen.orientation.unlock) {
      try {
        screen.orientation.unlock();
      } catch (err) {
        console.log('Orientation unlock failed:', err);
      }
    }
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

    // Helper function to get responsive font size based on viewport
    const getResponsiveFontSize = (baseSize: number): number => {
      const isMobile = window.innerWidth <= 768 || window.innerHeight <= 768;
      return isMobile ? Math.round(baseSize * 2.25) : baseSize;
    };

    // Helper function to wrap text with approximately 5 words per line
    const wrapText = (text: string, maxWordsPerLine: number = 5): string[] => {
      const words = text.split(' ');
      const lines: string[] = [];
      let currentLine: string[] = [];

      for (const word of words) {
        currentLine.push(word);
        if (currentLine.length >= maxWordsPerLine) {
          lines.push(currentLine.join(' '));
          currentLine = [];
        }
      }

      if (currentLine.length > 0) {
        lines.push(currentLine.join(' '));
      }

      return lines;
    };

    // Helper function to draw rounded rectangles
    const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number = 6) => {
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + width - radius, y);
      ctx.arcTo(x + width, y, x + width, y + radius, radius);
      ctx.lineTo(x + width, y + height - radius);
      ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
      ctx.lineTo(x + radius, y + height);
      ctx.arcTo(x, y + height, x, y + height - radius, radius);
      ctx.lineTo(x, y + radius);
      ctx.arcTo(x, y, x + radius, y, radius);
      ctx.closePath();
      ctx.fill();
    };

    // Helper function to draw an arrow between two points
    const drawArrow = (ctx: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number) => {
      const headLength = 10;
      const angle = Math.atan2(toY - fromY, toX - fromX);

      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(toX, toY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    };

    const drawFrame = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Show text labels with rounded background when NOT in debug mode
      if (!debugMode) {
        lastDetectionsRef.current.forEach((detection) => {
          const { x, y, width, height, definition } = detection;

          // Use definition if available, otherwise skip
          if (!definition) return;

          // Set up text with responsive font size
          const fontSize = getResponsiveFontSize(18);
          ctx.font = `${fontSize}px Arial`;
          const lines = wrapText(definition, 5);
          let maxWidth = 0;

          // Calculate max width
          for (const line of lines) {
            const textMetrics = ctx.measureText(line);
            maxWidth = Math.max(maxWidth, textMetrics.width);
          }

          const textHeight = fontSize + 2;
          const padding = 6;

          const boxX = x;
          const boxY = y - (lines.length * textHeight) - padding;
          const boxWidth = maxWidth + padding * 2;
          const boxHeight = (lines.length * textHeight) + padding;

          // Draw rounded background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
          drawRoundedRect(ctx, boxX, boxY, boxWidth, boxHeight, 6);

          // Draw arrow from text box to object center
          const fromX = boxX + boxWidth / 2;
          const fromY = boxY + boxHeight;
          const toX = x + width / 2;
          const toY = y + height / 2;
          ctx.strokeStyle = 'rgb(173, 216, 230)';
          ctx.fillStyle = 'rgb(173, 216, 230)';
          ctx.lineWidth = 2;
          drawArrow(ctx, fromX, fromY, toX, toY);

          // Draw definition text lines
          ctx.fillStyle = 'rgb(173, 216, 230)'; // Light blue
          ctx.font = `${fontSize}px Arial`;
          let textOffsetY = boxY + textHeight;
          for (const line of lines) {
            ctx.fillText(line, boxX + padding / 2, textOffsetY);
            textOffsetY += textHeight;
          }
        });
      } else {
        // Debug mode: show boxes, labels with confidence, and definitions
        lastDetectionsRef.current.forEach((detection) => {
          const { x, y, width, height, label, definition, confidence } = detection;

          // Draw bounding box (only in debug mode)
          ctx.strokeStyle = 'rgb(0, 255, 0)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, width, height);

          // Prepare text (label + confidence in debug mode)
          const labelText = `${label} ${(confidence * 100).toFixed(0)}%`;
          const defText = definition ? definition : '';
          
          // Wrap definition text to approximately 5 words per line
          const wrappedLines = defText ? wrapText(defText, 5) : [];
          
          const labelFontSize = getResponsiveFontSize(16);
          const defFontSize = getResponsiveFontSize(12);
          
          ctx.fillStyle = 'rgb(0, 255, 0)';
          ctx.font = `bold ${labelFontSize}px Arial`;
          const labelMetrics = ctx.measureText(labelText);
          
          let totalHeight = labelFontSize + 4;
          let maxWidth = labelMetrics.width;
          
          // Calculate total height needed for wrapped definition
          if (wrappedLines.length > 0) {
            ctx.font = `${defFontSize}px Arial`;
            for (const line of wrappedLines) {
              const lineMetrics = ctx.measureText(line);
              maxWidth = Math.max(maxWidth, lineMetrics.width);
            }
            totalHeight += wrappedLines.length * (defFontSize + 2); // per line for definition
          }

          // Background for text
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fillRect(x, y - totalHeight - 4, maxWidth + 8, totalHeight + 4);

          // Draw label text
          ctx.fillStyle = 'rgb(0, 255, 0)';
          ctx.font = `bold ${labelFontSize}px Arial`;
          ctx.fillText(labelText, x + 4, y - 6);
          
          // Draw wrapped definition text if available in light blue
          if (wrappedLines.length > 0) {
            ctx.fillStyle = 'rgb(173, 216, 230)'; // Light blue
            ctx.font = `${defFontSize}px Arial`;
            let defOffsetY = y + 10;
            for (const line of wrappedLines) {
              ctx.fillText(line, x + 4, defOffsetY);
              defOffsetY += 14;
            }
          }
        });
      }

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
      <div className="video-wrapper" ref={videoWrapperRef}>
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
