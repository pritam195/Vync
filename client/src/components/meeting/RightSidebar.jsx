import ChatPanel from './ChatPanel.jsx';
import CodeEditorPanel from './CodeEditorPanel.jsx';
import FilePanel from './FilePanel.jsx';
import HostControlPanel from './HostControlPanel.jsx';
import NotesPanel from './NotesPanel.jsx';
import ParticipantList from './ParticipantList.jsx';
import WhiteboardPanel from './WhiteboardPanel.jsx';
import { Code, FileText, MessageSquare, NotebookPen, PenTool, Shield, Users, X } from 'lucide-react';
import { motion as Motion, AnimatePresence } from 'framer-motion';

const panelMeta = {
  participants: { icon: Users, title: 'Participants', subtitle: 'Live room roster' },
  chat: { icon: MessageSquare, title: 'Chat', subtitle: 'Team messages' },
  notes: { icon: NotebookPen, title: 'Notes', subtitle: 'Shared decisions' },
  files: { icon: FileText, title: 'Files', subtitle: 'Shared in this meeting' },
  host: { icon: Shield, title: 'Host controls', subtitle: 'Moderation and permissions' },
  whiteboard: { icon: PenTool, title: 'Whiteboard', subtitle: 'Sketch space' },
  code: { icon: Code, title: 'Code editor', subtitle: 'Shared workspace' },
};

function RightSidebar({
  activePanel,
  canModerate,
  chatMessages,
  codeEditorState,
  currentUser,
  localSocketId,
  meetingId,
  onAnnounceUploadedFile,
  onChangeSharedFilePage,
  onCloseSharedFile,
  onApproveUser,
  onClose,
  onEndMeeting,
  onHostStopScreenShare,
  onMakeCohost,
  onMuteAll,
  onSendChatMessage,
  onMuteParticipant,
  onRejectUser,
  onRemoveParticipant,
  onSendReaction,
  onSendTyping,
  onStopTyping,
  onUpdatePermissions,
  onCodeChange,
  onCursorPosition,
  onLanguageChange,
  onOpenSharedFile,
  onWhiteboardClear,
  onWhiteboardDraw,
  onWhiteboardUndo,
  participants,
  permissions,
  sharedFiles,
  sharedFileState,
  typingParticipants,
  waitingParticipants,
  whiteboardEvents,
}) {
  const meta = panelMeta[activePanel] || panelMeta.participants;
  const subtitle = activePanel === 'participants' ? `${participants.length} in meeting` : meta.subtitle;
  const PanelIcon = meta.icon;

  return (
    <Motion.aside
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full w-full flex-col overflow-hidden bg-transparent p-2 text-white sm:p-3"
      data-testid={`meeting-panel-${activePanel}`}
    >
      <header className="collab-panel mb-3 flex flex-col gap-3 rounded-2xl p-3 min-[380px]:flex-row min-[380px]:items-start min-[380px]:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white shadow-inner ring-1 ring-white/10">
            <PanelIcon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold tracking-tight text-white">{meta.title}</h2>
            <p className="mt-1 text-xs font-medium uppercase tracking-wider text-white/50">{subtitle}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-end min-[380px]:self-auto">
          {canModerate ? (
            <button
              className="min-h-9 rounded-full border border-error/20 bg-error/20 px-3 py-1.5 text-xs font-bold text-error transition-colors hover:bg-error/30"
              onClick={onEndMeeting}
              type="button"
              data-testid="end-meeting-button"
            >
              End Meeting
            </button>
          ) : null}
          <button
            aria-label="Close panel"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-transparent text-white/70 transition-colors hover:border-white/10 hover:bg-white/10 hover:text-white"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait">
          <Motion.div
            key={activePanel}
            initial={{ opacity: 0, x: 14, filter: 'blur(8px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, x: -14, filter: 'blur(8px)' }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="h-full flex flex-col"
          >
        {activePanel === 'participants' ? (
        <ParticipantList
            canModerate={canModerate}
            localSocketId={localSocketId}
            onApproveUser={onApproveUser}
            onHostStopScreenShare={onHostStopScreenShare}
            onMakeCohost={onMakeCohost}
            onMuteParticipant={onMuteParticipant}
            onRejectUser={onRejectUser}
            onRemoveParticipant={onRemoveParticipant}
            participants={participants}
            waitingParticipants={waitingParticipants}
          />
        ) : null}
        {activePanel === 'chat' ? (
          <ChatPanel
            currentUser={currentUser}
            localSocketId={localSocketId}
            messages={chatMessages}
            onSendMessage={onSendChatMessage}
            onSendReaction={onSendReaction}
            onSendTyping={onSendTyping}
            onStopTyping={onStopTyping}
            participants={participants}
            permissions={permissions}
            typingParticipants={typingParticipants}
          />
        ) : null}
        {activePanel === 'notes' ? (
          <NotesPanel currentUser={currentUser} meetingId={meetingId} />
        ) : null}
        {activePanel === 'host' && canModerate ? (
          <HostControlPanel
            onApproveUser={onApproveUser}
            onEndMeeting={onEndMeeting}
            onMuteAll={onMuteAll}
            onRejectUser={onRejectUser}
            onUpdatePermissions={onUpdatePermissions}
            permissions={permissions}
            waitingParticipants={waitingParticipants}
          />
        ) : null}
        {activePanel === 'files' ? (
          <FilePanel
            canModerate={canModerate}
            currentUser={currentUser}
            localSocketId={localSocketId}
            meetingId={meetingId}
            onAnnounceUpload={onAnnounceUploadedFile}
            onChangePage={onChangeSharedFilePage}
            onCloseFile={onCloseSharedFile}
            onOpenFile={onOpenSharedFile}
            permissions={permissions}
            sharedFiles={sharedFiles}
            sharedFileState={sharedFileState}
          />
        ) : null}
        {activePanel === 'code' ? (
          <CodeEditorPanel
            codeEditorState={codeEditorState}
            localSocketId={localSocketId}
            meetingId={meetingId}
            onCodeChange={onCodeChange}
            onCursorPosition={onCursorPosition}
            onLanguageChange={onLanguageChange}
          />
        ) : null}
        {activePanel === 'whiteboard' ? (
          <WhiteboardPanel
            canModerate={canModerate}
            localSocketId={localSocketId}
            meetingId={meetingId}
            onClear={onWhiteboardClear}
            onDraw={onWhiteboardDraw}
            onUndo={onWhiteboardUndo}
            permissions={permissions}
            whiteboardEvents={whiteboardEvents}
          />
        ) : null}
          </Motion.div>
        </AnimatePresence>
      </div>
    </Motion.aside>
  );
}

export default RightSidebar;
