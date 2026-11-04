import { useCallback, useEffect, useRef, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import WhiteboardToolbar from './WhiteboardToolbar.jsx';

const boardWidth = 1280;
const boardHeight = 720;

function drawStroke(context, stroke) {
  const points = Array.isArray(stroke?.points) ? stroke.points : [];

  if (points.length < 2) {
    return;
  }

  context.save();
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.lineWidth = stroke.size || 4;
  context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = stroke.color || '#0f172a';
  context.beginPath();
  context.moveTo(points[0].x * boardWidth, points[0].y * boardHeight);

  points.slice(1).forEach((point) => {
    context.lineTo(point.x * boardWidth, point.y * boardHeight);
  });

  context.stroke();
  context.restore();
}

function WhiteboardPanel({
  canModerate,
  localSocketId,
  meetingId,
  onClear,
  onDraw,
  onUndo,
  permissions,
  whiteboardEvents,
}) {
  const canvasRef = useRef(null);
  const strokesRef = useRef([]);
  const activeStrokeRef = useRef(null);
  const handledEventsRef = useRef(new Set());
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#0f172a');
  const [size, setSize] = useState(5);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isToolbarOpen, setIsToolbarOpen] = useState(true);
  const [strokeCount, setStrokeCount] = useState(0);
  const canDraw = canModerate || permissions?.allowWhiteboard !== false;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');

    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach((stroke) => drawStroke(context, stroke));
  }, []);

  const pointFromEvent = useCallback((event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    return {
      x: Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1),
      y: Math.min(Math.max((event.clientY - rect.top) / rect.height, 0), 1),
    };
  }, []);

  const appendStroke = useCallback(
    (stroke) => {
      if (strokesRef.current.some((existingStroke) => existingStroke.id === stroke.id)) {
        return;
      }

      strokesRef.current = [...strokesRef.current, stroke];
      setStrokeCount(strokesRef.current.length);
      const context = canvasRef.current?.getContext('2d');

      if (context) {
        drawStroke(context, stroke);
      }
    },
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }
    const ratio = window.devicePixelRatio || 1;

    canvas.width = boardWidth * ratio;
    canvas.height = boardHeight * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    redraw();
  }, [redraw]);

  useEffect(() => {
    whiteboardEvents.forEach((event) => {
      if (!event?.id || handledEventsRef.current.has(event.id)) {
        return;
      }

      handledEventsRef.current.add(event.id);

      if (event.type === 'state') {
        strokesRef.current = event.strokes || [];
        setStrokeCount(strokesRef.current.length);
        redraw();
      }

      if (event.type === 'draw') {
        appendStroke(event.stroke);
      }

      if (event.type === 'clear') {
        strokesRef.current = [];
        setStrokeCount(0);
        redraw();
      }

      if (event.type === 'undo') {
        strokesRef.current = strokesRef.current.filter((stroke) => stroke.id !== event.strokeId);
        setStrokeCount(strokesRef.current.length);
        redraw();
      }
    });
  }, [appendStroke, redraw, whiteboardEvents]);

  const startDrawing = (event) => {
    if (!canDraw) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event);
    activeStrokeRef.current = {
      id: `${localSocketId || 'local'}-${Date.now()}`,
      tool,
      color,
      size,
      points: [point],
    };
    setIsDrawing(true);
  };

  const continueDrawing = (event) => {
    if (!isDrawing || !activeStrokeRef.current) {
      return;
    }

    const point = pointFromEvent(event);
    const activeStroke = activeStrokeRef.current;
    activeStroke.points = [...activeStroke.points, point];
    redraw();
    drawStroke(canvasRef.current?.getContext('2d'), activeStroke);
  };

  const finishDrawing = () => {
    const activeStroke = activeStrokeRef.current;

    if (!activeStroke) {
      return;
    }

    activeStrokeRef.current = null;
    setIsDrawing(false);

    if (activeStroke.points.length < 2) {
      redraw();
      return;
    }

    const nextStroke = {
      ...activeStroke,
      authorSocketId: localSocketId,
    };
    strokesRef.current = [...strokesRef.current, nextStroke];
    setStrokeCount(strokesRef.current.length);
    redraw();
    onDraw(nextStroke);
  };

  const saveWhiteboard = () => {
    const sourceCanvas = canvasRef.current;

    if (!sourceCanvas) {
      return;
    }

    const exportCanvas = document.createElement('canvas');
    const exportContext = exportCanvas.getContext('2d');
    const safeMeetingId = String(meetingId || 'vync-whiteboard')
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');

    exportCanvas.width = sourceCanvas.width;
    exportCanvas.height = sourceCanvas.height;
    exportContext.fillStyle = '#ffffff';
    exportContext.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    exportContext.drawImage(sourceCanvas, 0, 0);
    exportCanvas.toBlob((blob) => {
      if (!blob) {
        return;
      }

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      link.href = url;
      link.download = `${safeMeetingId}-whiteboard.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      <WhiteboardToolbar
        canClear={canDraw && strokeCount > 0}
        canDraw={canDraw}
        color={color}
        isOpen={isToolbarOpen}
        onClear={onClear}
        onClose={() => setIsToolbarOpen(false)}
        onColorChange={setColor}
        onSave={saveWhiteboard}
        onSizeChange={setSize}
        onToolChange={setTool}
        onUndo={onUndo}
        size={size}
        tool={tool}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white shadow-2xl ring-1 ring-black/10">
        <button
          className="collab-toolbar absolute right-3 top-3 z-20 flex h-10 w-10 items-center justify-center rounded-full text-white/80 transition hover:bg-white/10 hover:text-white"
          onClick={() => setIsToolbarOpen((value) => !value)}
          title="Whiteboard tools"
          type="button"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </button>
        <canvas
          className={`block h-full min-h-[28rem] w-full touch-none ${
            canDraw ? 'cursor-crosshair' : 'cursor-not-allowed'
          }`}
          onPointerCancel={finishDrawing}
          onPointerDown={startDrawing}
          onPointerLeave={finishDrawing}
          onPointerMove={continueDrawing}
          onPointerUp={finishDrawing}
          ref={canvasRef}
          style={{ aspectRatio: `${boardWidth} / ${boardHeight}` }}
        />

        {!canDraw ? (
          <div className="absolute inset-0 grid place-items-center bg-black/60 p-6 text-center text-white backdrop-blur-md">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-warning">
                Whiteboard locked
              </p>
              <p className="mt-2 text-xs font-medium text-white/70">
                The host has disabled whiteboard access.
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default WhiteboardPanel;
