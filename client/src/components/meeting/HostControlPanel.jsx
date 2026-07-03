import WaitingRoomPanel from './WaitingRoomPanel.jsx';

const permissionItems = [
  { key: 'allowChat', label: 'Chat' },
  { key: 'allowScreenShare', label: 'Screen share' },
  { key: 'allowWhiteboard', label: 'Whiteboard' },
  { key: 'allowFileShare', label: 'File share' },
];

function HostControlPanel({
  onApproveUser,
  onEndMeeting,
  onMuteAll,
  onRejectUser,
  onUpdatePermissions,
  permissions,
  waitingParticipants,
}) {
  return (
    <div className="meeting-scrollbar min-h-0 space-y-6 overflow-y-auto pb-4 pr-1">
      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/50 pl-1">Waiting room</h3>
        <WaitingRoomPanel
          onApproveUser={onApproveUser}
          onRejectUser={onRejectUser}
          waitingParticipants={waitingParticipants}
        />
      </section>

      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/50 pl-1">Room actions</h3>
        <div className="grid gap-3">
          <button
            className="meeting-soft-panel flex min-h-10 items-center justify-center rounded-xl bg-white/10 px-4 text-sm font-bold text-white transition-all hover:bg-white/20 active:scale-95"
            onClick={onMuteAll}
            type="button"
          >
            Mute everyone
          </button>
          <button
            className="flex min-h-10 items-center justify-center rounded-xl border border-error/20 bg-error/20 px-4 text-sm font-bold text-error transition-all hover:bg-error/30 active:scale-95"
            onClick={onEndMeeting}
            type="button"
          >
            End meeting for all
          </button>
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/50 pl-1">Participant permissions</h3>
        <div className="space-y-2">
          {permissionItems.map((item) => (
            <label
              className="meeting-soft-panel group flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-black/15 p-4 transition-colors hover:bg-white/5"
              key={item.key}
            >
              <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">{item.label}</span>
              <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-white/10 transition-colors">
                <input
                  checked={Boolean(permissions[item.key])}
                  className="peer sr-only"
                  onChange={(event) =>
                    onUpdatePermissions({ ...permissions, [item.key]: event.target.checked })
                  }
                  type="checkbox"
                />
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${permissions[item.key] ? 'translate-x-5 shadow-glow' : 'translate-x-1'} peer-checked:bg-primary`} />
              </div>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

export default HostControlPanel;
