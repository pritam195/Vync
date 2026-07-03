import { motion as Motion, AnimatePresence } from 'framer-motion';

function WaitingRoomPanel({ onApproveUser, onRejectUser, waitingParticipants }) {
  if (!waitingParticipants.length) {
    return (
      <div className="flex h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 opacity-50 p-4 text-center">
        <p className="text-sm font-bold text-white">No one waiting</p>
        <p className="mt-1 text-xs font-medium text-white/60">
          New join requests will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <AnimatePresence mode="popLayout">
        {waitingParticipants.map((participant) => (
          <Motion.div
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="rounded-[1.35rem] border border-white/5 bg-white/5 p-4 backdrop-blur-xl shadow-lg ring-1 ring-white/5"
            key={participant.socketId || participant.userId}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-white/10 to-white/5 text-sm font-bold text-white shadow-inner ring-1 ring-white/10">
                {participant.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">
                  {participant.name}
                </p>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-white/50">
                  {participant.role}
                </p>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-glow focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                onClick={() => onApproveUser(participant)}
                type="button"
              >
                Admit
              </Motion.button>
              <Motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="rounded-xl bg-error/10 px-3 py-2 text-xs font-bold text-error hover:bg-error/20 border border-error/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-error"
                onClick={() => onRejectUser(participant)}
                type="button"
              >
                Deny
              </Motion.button>
            </div>
          </Motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default WaitingRoomPanel;
