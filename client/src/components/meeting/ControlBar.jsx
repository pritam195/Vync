import { motion as Motion, AnimatePresence } from 'framer-motion';
import {
  Circle, Code, FolderOpen, Hand, MessageSquare, Mic, MicOff, MonitorUp,
  NotebookPen, PenTool, Shield, Users, Video, VideoOff, X,
} from 'lucide-react';

const controlsMeta = {
  mic: { icon: Mic, iconOff: MicOff, label: 'Microphone', activeLabel: 'Mic on', offLabel: 'Muted' },
  camera: { icon: Video, iconOff: VideoOff, label: 'Camera', activeLabel: 'Camera on', offLabel: 'Camera off' },
  screen: { icon: MonitorUp, label: 'Screen share', activeLabel: 'Sharing' },
  chat: { icon: MessageSquare, label: 'Chat' },
  notes: { icon: NotebookPen, label: 'Notes' },
  participants: { icon: Users, label: 'People' },
  whiteboard: { icon: PenTool, label: 'Whiteboard' },
  code: { icon: Code, label: 'Code editor' },
  files: { icon: FolderOpen, label: 'Shared files' },
  hand: { icon: Hand, label: 'Raise hand' },
  host: { icon: Shield, label: 'Host Controls' },
  recording: { icon: Circle, label: 'Record' }
};

function ControlButton({ controlKey, disabled, isActive, isPanelActive, onClick, badge }) {
  const meta = controlsMeta[controlKey];
  if (!meta) return null;

  const Icon = (!isActive && meta.iconOff) ? meta.iconOff : meta.icon;
  const isDangerState = !isActive && (controlKey === 'mic' || controlKey === 'camera');
  const isAccentState = isActive && (controlKey === 'screen' || controlKey === 'hand' || controlKey === 'recording');
  const tooltip = isDangerState ? meta.offLabel : isAccentState ? (meta.activeLabel || meta.label) : meta.label;

  return (
    <div className="relative group">
      <Motion.button
        whileHover={{ scale: 1.06, y: -1 }}
        whileTap={{ scale: 0.94 }}
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:h-12 sm:w-12 ${
          isPanelActive
            ? 'bg-primary text-primary-foreground shadow-glow'
            : isAccentState
            ? controlKey === 'recording' ? 'bg-error text-white animate-pulse-slow shadow-[0_0_30px_rgba(248,113,113,0.28)]' : 'bg-primary text-primary-foreground shadow-glow'
            : isDangerState
            ? 'bg-error/18 text-error ring-1 ring-error/20 hover:bg-error/28'
            : 'bg-white/9 text-white/86 ring-1 ring-white/5 hover:bg-white/16 hover:text-white'
        } disabled:cursor-not-allowed disabled:opacity-30`}
        disabled={disabled}
        onClick={onClick}
        type="button"
        aria-label={meta.label}
        data-testid={`meeting-control-${controlKey}`}
      >
        <Icon className="h-5 w-5" strokeWidth={2.5} />
        {badge > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-error text-[10px] font-bold text-white ring-2 ring-black">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </Motion.button>
      
      {/* Tooltip */}
      <div className="meeting-tooltip pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 -translate-x-1/2 scale-95 opacity-0 transition-all duration-200 group-hover:scale-100 group-hover:opacity-100">
        <div className="meeting-chrome whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold text-white">
          {tooltip}
        </div>
      </div>
    </div>
  );
}

function ControlBar({
  activePanel,
  canModerate,
  isCameraOn,
  isHandRaised,
  isMicOn,
  isRecording,
  isScreenSharing,
  isUiVisible,
  onLeave,
  onPanelChange,
  onToggleRecording,
  onToggleCamera,
  onToggleHand,
  onToggleMic,
  onToggleScreenShare,
  permissions,
  waitingCount = 0,
}) {
  const handlers = {
    mic: onToggleMic,
    camera: onToggleCamera,
    screen: onToggleScreenShare,
    chat: () => onPanelChange('chat'),
    notes: () => onPanelChange('notes'),
    participants: () => onPanelChange('participants'),
    whiteboard: () => onPanelChange('whiteboard'),
    code: () => onPanelChange('code'),
    files: () => onPanelChange('files'),
    hand: onToggleHand,
    host: () => onPanelChange('host'),
    recording: onToggleRecording,
  };

  const activeStates = {
    mic: isMicOn,
    camera: isCameraOn,
    screen: isScreenSharing,
    hand: isHandRaised,
    recording: isRecording,
  };
  
  const disabledStates = canModerate
    ? {}
    : {
        chat: permissions?.allowChat === false,
        files: permissions?.allowFileShare === false,
        screen: permissions?.allowScreenShare === false,
        whiteboard: permissions?.allowWhiteboard === false,
      };

  const mainControls = ['mic', 'camera', 'screen', 'hand'];
  const panelControls = ['chat', 'notes', 'participants', 'whiteboard', 'code', 'files'];

  return (
    <AnimatePresence>
      {isUiVisible && (
        <Motion.div
          initial={{ opacity: 0, x: '-50%', y: 32 }}
          animate={{ opacity: 1, x: '-50%', y: 0 }}
          exit={{ opacity: 0, x: '-50%', y: 32 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="meeting-bottom-safe absolute left-1/2 z-40 w-[calc(100vw-1rem)] max-w-[54rem] sm:w-[calc(100vw-2rem)] sm:max-w-max"
        >
      <div className="meeting-control-rail mx-auto flex max-w-full flex-col gap-2 overflow-hidden rounded-2xl p-2 scrollbar-hide sm:flex-row sm:items-center sm:gap-3 sm:overflow-x-auto sm:rounded-full">
        <div className="flex items-center justify-between gap-2 sm:justify-start">
          <div className="flex items-center gap-1.5 px-0.5 sm:gap-2 sm:px-2">
            {mainControls.map(key => (
              <ControlButton
                key={key}
                controlKey={key}
                isActive={Boolean(activeStates[key])}
                disabled={Boolean(disabledStates[key])}
                onClick={handlers[key]}
              />
            ))}
          </div>

          <button
            className="flex h-11 w-14 shrink-0 items-center justify-center rounded-full bg-error text-white shadow-[0_12px_32px_rgba(248,113,113,0.24)] transition-all hover:bg-error/90 hover:shadow-[0_0_28px_rgba(255,69,58,0.36)] focus:outline-none focus-visible:ring-2 focus-visible:ring-error sm:hidden"
            onClick={onLeave}
            type="button"
            title="Leave Meeting"
          >
            <X className="h-5 w-5" strokeWidth={3} />
          </button>
        </div>

        <div className="hidden h-8 w-px shrink-0 bg-white/10 sm:block" />

        <div className="meeting-scrollbar flex w-full items-center gap-1.5 overflow-x-auto px-0.5 pb-0.5 sm:w-auto sm:gap-2 sm:overflow-visible sm:px-2 sm:pb-0">
          {panelControls.map(key => (
            <ControlButton
              key={key}
              controlKey={key}
              isPanelActive={activePanel === key || (activePanel === 'participants' && key === 'participants')}
              disabled={Boolean(disabledStates[key])}
              onClick={handlers[key]}
            />
          ))}
          {canModerate && (
            <ControlButton
              controlKey="host"
              isPanelActive={activePanel === 'host'}
              onClick={handlers.host}
              badge={waitingCount}
            />
          )}
          {onToggleRecording && (
            <ControlButton
              controlKey="recording"
              isActive={isRecording}
              onClick={handlers.recording}
            />
          )}
        </div>

        <div className="hidden h-8 w-px shrink-0 bg-white/10 sm:block" />

        <div className="hidden pl-2 pr-1 sm:block">
          <button
            className="flex h-12 w-16 items-center justify-center rounded-full bg-error text-white shadow-[0_12px_32px_rgba(248,113,113,0.24)] transition-all hover:bg-error/90 hover:shadow-[0_0_28px_rgba(255,69,58,0.36)] focus:outline-none focus-visible:ring-2 focus-visible:ring-error"
            onClick={onLeave}
            type="button"
            title="Leave Meeting"
            data-testid="meeting-control-leave"
          >
            <X className="h-6 w-6" strokeWidth={3} />
          </button>
        </div>

      </div>
        </Motion.div>
      )}
    </AnimatePresence>
  );
}

export default ControlBar;
