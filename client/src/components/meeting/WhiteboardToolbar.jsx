import { Pen, Eraser, Undo, Download, Trash2, X } from 'lucide-react';

const colors = ['#000000', '#ffffff', '#0d9488', '#2563eb', '#dc2626', '#f59e0b', '#7c3aed'];

function WhiteboardToolbar({
  canClear,
  canDraw,
  color,
  isOpen,
  onClear,
  onClose,
  onColorChange,
  onSave,
  onSizeChange,
  onToolChange,
  onUndo,
  size,
  tool,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="collab-toolbar absolute left-0 right-0 top-0 z-30 m-2 flex flex-wrap items-center gap-3 rounded-2xl p-2 pr-3">
      <div className="flex rounded-xl border border-white/5 bg-white/5 p-1">
        {[
          { id: 'pen', icon: <Pen className="h-4 w-4" />, label: 'Pen' },
          { id: 'eraser', icon: <Eraser className="h-4 w-4" />, label: 'Eraser' },
        ].map(({ id, icon, label }) => (
          <button
            key={id}
            title={label}
            className={`flex h-9 w-10 items-center justify-center rounded-lg transition-colors ${
              tool === id
                ? 'bg-primary text-primary-foreground shadow-glow'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            } disabled:opacity-30`}
            disabled={!canDraw}
            onClick={() => onToolChange(id)}
            type="button"
          >
            {icon}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5 border-r border-white/10 px-1 pr-4">
        {colors.map((swatch) => (
          <button
            aria-label={`Use ${swatch}`}
            className={`h-6 w-6 rounded-full border-[3px] transition-transform hover:scale-110 ${
              color === swatch ? 'border-primary scale-110 shadow-glow' : 'border-transparent'
            } disabled:opacity-30`}
            disabled={!canDraw}
            key={swatch}
            onClick={() => onColorChange(swatch)}
            style={{ backgroundColor: swatch, boxShadow: color === swatch ? undefined : '0 2px 4px rgba(0,0,0,0.5)' }}
            type="button"
          />
        ))}
        <input
          aria-label="Custom color"
          className="ml-1 h-7 w-7 cursor-pointer overflow-hidden rounded-full border border-white/20 bg-transparent disabled:opacity-30"
          disabled={!canDraw}
          onChange={(event) => onColorChange(event.target.value)}
          type="color"
          value={color}
        />
      </div>

      <label className="flex min-w-24 flex-1 items-center gap-3 text-xs font-bold uppercase tracking-wider text-white/70">
        Size
        <input
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-primary disabled:opacity-30"
          disabled={!canDraw}
          max="32"
          min="2"
          onChange={(event) => onSizeChange(Number(event.target.value))}
          type="range"
          value={size}
        />
      </label>

      <div className="flex items-center gap-2">
        <button
          className="collab-icon-button"
          disabled={!canDraw}
          onClick={onUndo}
          title="Undo"
          type="button"
        >
          <Undo className="h-4 w-4" />
        </button>
        <button
          className="collab-icon-button"
          onClick={onSave}
          title="Save as PNG"
          type="button"
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          className="collab-icon-button border border-error/20 bg-error/20 text-error hover:bg-error/30"
          disabled={!canClear}
          onClick={onClear}
          title="Clear Board"
          type="button"
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button
          className="collab-icon-button border border-white/10 bg-white/5"
          onClick={onClose}
          title="Close tools"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default WhiteboardToolbar;
