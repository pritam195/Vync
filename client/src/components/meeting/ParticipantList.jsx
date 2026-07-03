import { Mic, MicOff, MonitorUp, Hand, Shield, ShieldAlert, X } from 'lucide-react';

function ParticipantList({
  canModerate,
  localSocketId,
  onApproveUser,
  onHostStopScreenShare,
  onMakeCohost,
  onMuteParticipant,
  onRejectUser,
  onRemoveParticipant,
  participants,
  waitingParticipants = [],
}) {
  return (
    <div className="meeting-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto pb-4 pr-1">
      {canModerate && waitingParticipants.length > 0 ? (
        <section className="rounded-2xl border border-warning/20 bg-warning/10 p-4 backdrop-blur-md">
          <p className="text-xs font-bold uppercase tracking-wider text-warning mb-3">
            Waiting room ({waitingParticipants.length})
          </p>
          <div className="space-y-2">
            {waitingParticipants.map((participant) => (
              <div
                className="meeting-soft-panel flex items-center justify-between gap-2 rounded-xl bg-black/30 p-3"
                key={participant.socketId || participant.userId}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">
                    {participant.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="truncate text-sm font-semibold text-white">
                    {participant.name}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:bg-primary/30"
                    onClick={() => onApproveUser(participant)}
                    type="button"
                  >
                    Admit
                  </button>
                  <button
                    className="rounded-lg bg-error/20 px-3 py-1.5 text-xs font-bold text-error transition-colors hover:bg-error/30"
                    onClick={() => onRejectUser(participant)}
                    type="button"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-2">
        {participants.map((participant) => {
          const isLocal = participant.socketId === localSocketId;
          const initials = participant.name.charAt(0).toUpperCase();

          return (
            <div
              className="meeting-soft-panel group flex items-center justify-between gap-3 rounded-2xl bg-black/15 p-3 transition-all hover:-translate-y-0.5 hover:bg-white/[0.075]"
              key={participant.socketId || participant.userId}
              data-testid="participant-list-item"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-bold text-white shadow-lg">
                  {initials}
                  {participant.role === 'host' && (
                    <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-warning text-black ring-2 ring-black">
                      <Shield className="h-2.5 w-2.5" />
                    </div>
                  )}
                  {participant.role === 'cohost' && (
                    <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-black ring-2 ring-black">
                      <ShieldAlert className="h-2.5 w-2.5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate text-sm font-bold text-white">
                    {participant.name}
                    {isLocal && <span className="text-[10px] text-white/50 font-normal bg-white/10 px-1.5 py-0.5 rounded-md">(You)</span>}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
                    {participant.role}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                {participant.handRaised && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-warning/20 text-warning" title="Hand raised">
                    <Hand className="h-3.5 w-3.5" />
                  </div>
                )}
                {participant.isScreenSharing && (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary" title="Sharing screen">
                    <MonitorUp className="h-3.5 w-3.5" />
                  </div>
                )}
                <div className={`flex h-7 w-7 items-center justify-center rounded-full ${participant.micOn ? 'bg-white/10 text-white' : 'bg-error/20 text-error'}`} title={participant.micOn ? 'Mic on' : 'Muted'}>
                  {participant.micOn ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                </div>

                {/* Moderation Controls on Hover */}
                {canModerate && !isLocal && (
                  <div className="ml-2 hidden items-center gap-1.5 border-l border-white/10 pl-2 group-hover:flex">
                    <button
                      className="flex h-7 items-center justify-center rounded-md bg-white/10 px-2 text-[10px] font-bold text-white transition-colors hover:bg-white/20"
                      onClick={() => onMuteParticipant(participant)}
                      type="button"
                    >
                      Mute
                    </button>
                    {participant.isScreenSharing && (
                      <button
                        className="flex h-7 items-center justify-center rounded-md bg-warning/20 px-2 text-[10px] font-bold text-warning hover:bg-warning/30 transition-colors"
                        onClick={() => onHostStopScreenShare(participant)}
                        type="button"
                      >
                        Stop share
                      </button>
                    )}
                    {(participant.role === 'participant' || participant.role === 'guest') && (
                      <button
                        className="flex h-7 items-center justify-center rounded-md bg-primary/20 px-2 text-[10px] font-bold text-primary transition-colors hover:bg-primary/30"
                        onClick={() => onMakeCohost(participant)}
                        type="button"
                      >
                        Co-host
                      </button>
                    )}
                    <button
                      className="flex h-7 w-7 items-center justify-center rounded-md bg-error/20 text-error transition-colors hover:bg-error/30"
                      onClick={() => onRemoveParticipant(participant)}
                      type="button"
                      title="Remove participant"
                      data-testid="remove-participant-button"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ParticipantList;
