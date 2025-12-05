'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';

// Available neon colors for annotation
const NEON_COLORS = [
  { name: 'Neonrosa/Magenta', value: '#FF00FF', label: '🟣' },
  { name: 'Neongrön/Lime', value: '#00FF00', label: '🟢' },
  { name: 'Cyan/Turkos', value: '#00FFFF', label: '🔵' },
  { name: 'Neongul', value: '#FFFF00', label: '🟡' }
] as const;

const LINE_WIDTH = 5; // Thickness of drawing lines

type DrawingPoint = {
  x: number;
  y: number;
  color: string;
};

type DrawingStroke = DrawingPoint[];

interface ImageAnnotatorProps {
  imageFile: File;
  onSave: (annotatedFile: File) => void;
  onCancel: () => void;
}

export default function ImageAnnotator({ imageFile, onSave, onCancel }: ImageAnnotatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedColor, setSelectedColor] = useState(NEON_COLORS[0].value);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [currentStroke, setCurrentStroke] = useState<DrawingStroke>([]);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Load image onto canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    imageRef.current = img;

    img.onload = () => {
      // Set canvas size to match image
      canvas.width = img.width;
      canvas.height = img.height;
      
      // Draw the image
      ctx.drawImage(img, 0, 0);
      setImageLoaded(true);
    };

    img.src = URL.createObjectURL(imageFile);

    return () => {
      URL.revokeObjectURL(img.src);
    };
  }, [imageFile]);

  // Redraw canvas with all strokes
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear and redraw image
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    // Draw all completed strokes
    strokes.forEach(stroke => {
      if (stroke.length < 2) return;
      
      ctx.beginPath();
      ctx.strokeStyle = stroke[0].color;
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.moveTo(stroke[0].x, stroke[0].y);
      for (let i = 1; i < stroke.length; i++) {
        ctx.lineTo(stroke[i].x, stroke[i].y);
      }
      ctx.stroke();
    });

    // Draw current stroke if any
    if (currentStroke.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = currentStroke[0].color;
      ctx.lineWidth = LINE_WIDTH;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      
      ctx.moveTo(currentStroke[0].x, currentStroke[0].y);
      for (let i = 1; i < currentStroke.length; i++) {
        ctx.lineTo(currentStroke[i].x, currentStroke[i].y);
      }
      ctx.stroke();
    }
  }, [strokes, currentStroke]);

  // Redraw whenever strokes change
  useEffect(() => {
    if (imageLoaded) {
      redrawCanvas();
    }
  }, [imageLoaded, redrawCanvas]);

  // Get coordinates relative to canvas
  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    if ('touches' in e) {
      const touch = e.touches[0];
      return {
        x: (touch.clientX - rect.left) * scaleX,
        y: (touch.clientY - rect.top) * scaleY
      };
    } else {
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY
      };
    }
  };

  // Start drawing
  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    setIsDrawing(true);
    const coords = getCoordinates(e);
    setCurrentStroke([{ ...coords, color: selectedColor }]);
  };

  // Continue drawing
  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const coords = getCoordinates(e);
    setCurrentStroke(prev => [...prev, { ...coords, color: selectedColor }]);
  };

  // End drawing
  const endDrawing = () => {
    if (isDrawing && currentStroke.length > 0) {
      setStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke([]);
    }
    setIsDrawing(false);
  };

  // Undo last stroke
  const handleUndo = () => {
    if (strokes.length > 0) {
      setStrokes(prev => prev.slice(0, -1));
    }
  };

  // Clear all strokes
  const handleClear = () => {
    setStrokes([]);
    setCurrentStroke([]);
  };

  // Save annotated image
  const handleSave = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob((blob) => {
      if (!blob) {
        console.error('Failed to create blob from canvas');
        // Just cancel instead of showing an error - user can try again
        onCancel();
        return;
      }

      // Create a new File from the blob with the same name as original
      const annotatedFile = new File([blob], imageFile.name, {
        type: 'image/png',
        lastModified: Date.now()
      });

      onSave(annotatedFile);
    }, 'image/png');
  };

  return (
    <>
      <div className="annotator-overlay" onClick={onCancel} />
      <div className="annotator-modal">
        <div className="annotator-header">
          <h3>Rita på bilden</h3>
          <p className="annotator-instructions">
            Rita med fingret/musen för att markera skador
          </p>
        </div>

        <div className="annotator-canvas-container">
          <canvas
            ref={canvasRef}
            className="annotator-canvas"
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={endDrawing}
            onMouseLeave={endDrawing}
            onTouchStart={startDrawing}
            onTouchMove={draw}
            onTouchEnd={endDrawing}
          />
        </div>

        <div className="annotator-controls">
          <div className="color-selector">
            <label className="color-label">Färg:</label>
            <div className="color-buttons">
              {NEON_COLORS.map(color => (
                <button
                  key={color.value}
                  type="button"
                  className={`color-btn ${selectedColor === color.value ? 'active' : ''}`}
                  style={{ 
                    backgroundColor: color.value,
                    border: selectedColor === color.value ? '3px solid #000' : '2px solid #ccc'
                  }}
                  onClick={() => setSelectedColor(color.value)}
                  title={color.name}
                >
                  {color.label}
                </button>
              ))}
            </div>
          </div>

          <div className="action-buttons">
            <button
              type="button"
              className="annotator-btn undo-btn"
              onClick={handleUndo}
              disabled={strokes.length === 0}
            >
              ↩️ Ångra
            </button>
            <button
              type="button"
              className="annotator-btn clear-btn"
              onClick={handleClear}
              disabled={strokes.length === 0 && currentStroke.length === 0}
            >
              🗑️ Rensa
            </button>
          </div>
        </div>

        <div className="annotator-footer">
          <button
            type="button"
            className="annotator-btn cancel-btn"
            onClick={onCancel}
          >
            Avbryt
          </button>
          <button
            type="button"
            className="annotator-btn save-btn"
            onClick={handleSave}
          >
            ✅ Klar
          </button>
        </div>
      </div>

      <style jsx>{`
        .annotator-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.85);
          z-index: 200;
        }

        .annotator-modal {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background-color: white;
          border-radius: 12px;
          z-index: 201;
          max-width: 95vw;
          max-height: 95vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
        }

        .annotator-header {
          padding: 1.5rem;
          border-bottom: 1px solid #e5e7eb;
          text-align: center;
        }

        .annotator-header h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
          font-weight: 700;
          color: #1f2937;
        }

        .annotator-instructions {
          margin: 0;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .annotator-canvas-container {
          flex: 1;
          overflow: auto;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1rem;
          background-color: #f9fafb;
          touch-action: none;
        }

        .annotator-canvas {
          max-width: 100%;
          max-height: 100%;
          display: block;
          cursor: crosshair;
          border: 2px solid #d1d5db;
          border-radius: 8px;
          background-color: white;
        }

        .annotator-controls {
          padding: 1rem 1.5rem;
          border-top: 1px solid #e5e7eb;
          border-bottom: 1px solid #e5e7eb;
          background-color: white;
        }

        .color-selector {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }

        .color-label {
          font-weight: 600;
          font-size: 0.875rem;
          color: #374151;
        }

        .color-buttons {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        .color-btn {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.2s;
          font-size: 1.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }

        .color-btn:hover {
          transform: scale(1.1);
        }

        .color-btn.active {
          transform: scale(1.15);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }

        .action-buttons {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
          flex-wrap: wrap;
        }

        .annotator-btn {
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          border: none;
          font-size: 0.875rem;
        }

        .annotator-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .annotator-btn:not(:disabled):hover {
          filter: brightness(1.1);
        }

        .undo-btn,
        .clear-btn {
          background-color: #f3f4f6;
          color: #374151;
          border: 1px solid #d1d5db;
        }

        .annotator-footer {
          padding: 1.5rem;
          display: flex;
          gap: 1rem;
          justify-content: flex-end;
          background-color: white;
        }

        .cancel-btn {
          background-color: #f3f4f6;
          color: #374151;
        }

        .save-btn {
          background-color: #16a34a;
          color: white;
        }

        @media (max-width: 640px) {
          .annotator-modal {
            max-width: 100vw;
            max-height: 100vh;
            width: 100%;
            height: 100%;
            border-radius: 0;
          }

          .annotator-header {
            padding: 1rem;
          }

          .annotator-canvas-container {
            padding: 0.5rem;
          }

          .color-selector {
            flex-direction: column;
            align-items: flex-start;
          }

          .action-buttons {
            flex-direction: column;
          }

          .annotator-btn {
            width: 100%;
          }

          .annotator-footer {
            flex-direction: column;
          }
        }
      `}</style>
    </>
  );
}
