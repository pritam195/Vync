import { AnimatePresence, motion as Motion } from 'framer-motion';
import {
  AtSign,
  Bell,
  ChevronDown,
  Hash,
  MessageSquare,
  Pin,
  PinOff,
  Reply,
  Search,
  Send,
  Smile,
  Sparkles,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const quickReactions = [
  { id: '+1', label: '👍' },
  { id: 'Clap', label: '👏' },
  { id: 'Yay', label: '🎉' },
  { id: 'Smile', label: '😊' },
];

const emojiChoices = ['👍', '👏', '🎉', '😊', '🔥', '✅', '💡', '👀'];

function messageId(message, index) {
  return message._id || `${message.createdAt || 'message'}-${index}`;
}

function formatTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateLabel(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Earlier';
  }

  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }

  return date.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  });
}

function getInitials(name = '?') {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';
}

function highlightMentions(text) {
  const chunks = String(text || '').split(/(@[\w.-]+)/g);

  return chunks.map((chunk, index) => {
    if (/^@[\w.-]+/.test(chunk)) {
      return (
        <span className="rounded-md bg-primary/15 px-1 font-bold text-primary" key={`${chunk}-${index}`}>
          {chunk}
        </span>
      );
    }

    return chunk;
  });
}

function EmptyChat({ hasSearch }) {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="max-w-56">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/10 shadow-inner">
          {hasSearch ? <Search className="h-6 w-6 text-primary" /> : <MessageSquare className="h-6 w-6 text-primary" />}
        </div>
        <p className="mt-4 text-sm font-bold text-white">
          {hasSearch ? 'No matching messages' : 'No messages yet'}
        </p>
        <p className="mt-1 text-xs leading-5 text-white/55">
          {hasSearch ? 'Try a different search term.' : 'Start the conversation with a clear update or quick reaction.'}
        </p>
      </div>
    </div>
  );
}

function DateSeparator({ label }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <div className="h-px flex-1 bg-white/10" />
      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/45">
        {label}
      </span>
      <div className="h-px flex-1 bg-white/10" />
    </div>
  );
}

function ChatPanel({
  currentUser,
  localSocketId,
  messages,
  onSendMessage,
  onSendReaction,
  onSendTyping,
  onStopTyping,
  participants,
  permissions,
  typingParticipants,
}) {
  const [draft, setDraft] = useState('');
  const [receiverSocketId, setReceiverSocketId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [isEmojiOpen, setIsEmojiOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const typingTimerRef = useRef(null);
  const previousCountRef = useRef(messages.length);
  const privateParticipants = participants.filter(
    (participant) => participant.socketId !== localSocketId,
  );
  const localParticipant = participants.find(
    (participant) => participant.socketId === localSocketId,
  );
  const selectedParticipant = participants.find(
    (participant) => participant.socketId === receiverSocketId,
  );
  const isChatAllowed = permissions?.allowChat !== false;
  const currentUserId = currentUser?.id || currentUser?._id || '';

  const isOwnMessage = useCallback(
    (message) =>
      Boolean(
        message?.sender?.socketId === localSocketId ||
          (currentUserId && String(message?.sender?.userId || '') === String(currentUserId)) ||
          (!message?.sender?.socketId && message?.sender?.name === currentUser?.name),
      ),
    [currentUser?.name, currentUserId, localSocketId],
  );

  const visibleMessages = useMemo(() => {
    const isSameParticipant = (person, participant) =>
      Boolean(
        person &&
          participant &&
          ((person.socketId && person.socketId === participant.socketId) ||
            (person.userId && person.userId === participant.userId)),
      );

    return messages.filter((message) => {
      if (!receiverSocketId) {
        return !message.receiver;
      }

      return (
        (isSameParticipant(message.sender, localParticipant) &&
          isSameParticipant(message.receiver, selectedParticipant)) ||
        (isSameParticipant(message.sender, selectedParticipant) &&
          isSameParticipant(message.receiver, localParticipant))
      );
    });
  }, [localParticipant, messages, receiverSocketId, selectedParticipant]);

  const filteredMessages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return visibleMessages;
    }

    return visibleMessages.filter((message) =>
      `${message.sender?.name || ''} ${message.message || ''}`.toLowerCase().includes(query),
    );
  }, [searchQuery, visibleMessages]);

  const pinnedMessages = useMemo(
    () => visibleMessages.filter((message, index) => pinnedIds.includes(messageId(message, index))),
    [pinnedIds, visibleMessages],
  );

  const typingText = typingParticipants
    .filter((participant) => !receiverSocketId || participant.socketId === receiverSocketId)
    .map((participant) => participant.name)
    .join(', ');

  useEffect(() => {
    const nextCount = visibleMessages.length;
    const previousCount = previousCountRef.current;
    const didReceive = nextCount > previousCount;
    const latestMessage = visibleMessages[nextCount - 1];
    const isOwnLatest = isOwnMessage(latestMessage);
    previousCountRef.current = nextCount;

    if (!didReceive) {
      return;
    }

    if ((isAtBottom || isOwnLatest) && !searchQuery) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
      return;
    }

    setUnreadCount((count) => count + (nextCount - previousCount));
  }, [isAtBottom, isOwnMessage, searchQuery, visibleMessages]);

  const handleScroll = useCallback(() => {
    const element = scrollRef.current;

    if (!element) {
      return;
    }

    const distanceFromBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
    const nearBottom = distanceFromBottom < 80;
    setIsAtBottom(nearBottom);

    if (nearBottom) {
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    previousCountRef.current = visibleMessages.length;
    setUnreadCount(0);
    window.requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
      handleScroll();
    });
  }, [handleScroll, receiverSocketId, visibleMessages.length]);

  useEffect(
    () => () => {
      window.clearTimeout(typingTimerRef.current);
      onStopTyping(receiverSocketId);
    },
    [onStopTyping, receiverSocketId],
  );

  const sendMessage = ({ message, type = 'text' }) => {
    const nextMessage = String(message || '').trim();

    if (!nextMessage || !isChatAllowed) {
      return;
    }

    const replyPrefix = replyTo
      ? `Replying to ${replyTo.sender?.name || 'Unknown'}: "${String(replyTo.message || '').slice(0, 80)}"\n`
      : '';

    onSendMessage({
      message: `${replyPrefix}${nextMessage}`,
      receiverSocketId,
      type,
    });
    onStopTyping(receiverSocketId);
    setDraft('');
    setReplyTo(null);
    setIsEmojiOpen(false);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage({ message: draft });
  };

  const handleDraftChange = (event) => {
    setDraft(event.target.value);
    onSendTyping(receiverSocketId);
    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => onStopTyping(receiverSocketId), 1200);
  };

  const togglePin = (message, index) => {
    const id = messageId(message, index);
    setPinnedIds((currentIds) =>
      currentIds.includes(id)
        ? currentIds.filter((currentId) => currentId !== id)
        : [id, ...currentIds].slice(0, 3),
    );
  };

  const jumpToLatest = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUnreadCount(0);
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      <div className="collab-panel rounded-2xl p-2">
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-white/45" />
            <input
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/40"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search messages"
              value={searchQuery}
            />
            {searchQuery ? (
              <button className="collab-icon-button h-6 w-6" onClick={() => setSearchQuery('')} type="button">
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
          <div className="relative">
            <Bell className="h-4 w-4 text-white/45" />
            {unreadCount > 0 ? (
              <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-error px-1 text-[9px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 border-t border-white/10 pt-2">
          <Hash className="h-4 w-4 shrink-0 text-white/45" />
          <select
            className="min-w-0 flex-1 cursor-pointer bg-transparent text-xs font-bold uppercase tracking-wider text-white/70 outline-none"
            onChange={(event) => {
              onStopTyping(receiverSocketId);
              setReceiverSocketId(event.target.value);
            }}
            value={receiverSocketId}
          >
            <option className="bg-surface text-foreground dark:bg-slate-900 dark:text-white" value="">
              Everyone
            </option>
            {privateParticipants.map((participant) => (
              <option
                className="bg-surface text-foreground dark:bg-slate-900 dark:text-white"
                key={participant.socketId}
                value={participant.socketId}
              >
                Private: {participant.name}
              </option>
            ))}
          </select>
          <AtSign className="h-4 w-4 text-white/45" />
        </div>
      </div>

      {pinnedMessages.length ? (
        <div className="collab-panel rounded-2xl p-3">
          <div className="mb-2 flex items-center gap-2">
            <Pin className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-bold uppercase tracking-wider text-white/55">Pinned</p>
          </div>
          <div className="space-y-2">
            {pinnedMessages.map((message, index) => (
              <div className="rounded-xl border border-white/10 bg-white/5 p-2" key={messageId(message, index)}>
                <p className="truncate text-xs font-bold text-white">{message.sender?.name || 'Unknown'}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-5 text-white/60">{message.message}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="meeting-scrollbar relative min-h-0 flex-1 overflow-y-auto pr-1"
        onScroll={handleScroll}
        ref={scrollRef}
      >
        <div className="space-y-3 pb-3">
          <AnimatePresence initial={false}>
            {filteredMessages.length ? (
              filteredMessages.map((message, index) => {
                const id = messageId(message, index);
                const isOwn = isOwnMessage(message);
                const isPrivate = Boolean(message.receiver);
                const currentDate = formatDateLabel(message.createdAt);
                const previousDate = index > 0 ? formatDateLabel(filteredMessages[index - 1]?.createdAt) : '';
                const showDate = currentDate !== previousDate;
                const isPinned = pinnedIds.includes(id);

                return (
                  <div key={id}>
                    {showDate ? <DateSeparator label={currentDate} /> : null}
                    <Motion.article
                      animate={{ opacity: 1, y: 0 }}
                      className={`group flex w-full items-start gap-3 ${isOwn ? 'justify-end pl-12' : 'justify-start pr-12'}`}
                      exit={{ opacity: 0, y: 8 }}
                      initial={{ opacity: 0, y: 12 }}
                      layout
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      data-testid="chat-message"
                    >
                      {!isOwn ? (
                        <div className="mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent text-xs font-black text-primary-foreground shadow-md">
                          {getInitials(message.sender?.name)}
                        </div>
                      ) : null}
                      <div className={`flex min-w-0 max-w-[78%] flex-col ${isOwn ? 'items-end text-right' : 'items-start text-left'}`}>
                        <div className={`mb-1 flex max-w-full flex-wrap items-center gap-2 px-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <span className="truncate text-xs font-bold text-white">
                            {isOwn ? 'You' : message.sender?.name || 'Unknown'}
                          </span>
                          <span className="text-[10px] font-semibold text-white/40">{formatTime(message.createdAt)}</span>
                          {isPrivate ? (
                            <span className="rounded-md border border-warning/20 bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold text-warning">
                              Private
                            </span>
                          ) : null}
                        </div>
                        <div
                          className={`w-fit max-w-full rounded-2xl border px-4 py-2.5 text-sm leading-6 shadow-sm ${
                            isOwn
                              ? 'rounded-tr-md border-primary/25 bg-primary text-primary-foreground'
                              : 'rounded-tl-md border-white/10 bg-white/10 text-white'
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{highlightMentions(message.message)}</p>
                          {message.type === 'file' ? (
                            <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-2 text-xs font-bold">
                              Attachment shared
                            </div>
                          ) : null}
                        </div>
                        <div className={`mt-1 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 ${isOwn ? 'flex-row-reverse' : ''}`}>
                          <button className="collab-icon-button h-7 w-7" onClick={() => setReplyTo(message)} title="Reply" type="button">
                            <Reply className="h-3.5 w-3.5" />
                          </button>
                          <button className="collab-icon-button h-7 w-7" onClick={() => togglePin(message, index)} title={isPinned ? 'Unpin' : 'Pin'} type="button">
                            {isPinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                    </Motion.article>
                  </div>
                );
              })
            ) : (
              <EmptyChat hasSearch={Boolean(searchQuery.trim())} />
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </div>

      <AnimatePresence>
        {unreadCount > 0 && !isAtBottom ? (
          <Motion.button
            animate={{ opacity: 1, y: 0 }}
            className="collab-toolbar absolute bottom-28 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-2 text-xs font-bold text-white"
            exit={{ opacity: 0, y: 8 }}
            initial={{ opacity: 0, y: 8 }}
            onClick={jumpToLatest}
            type="button"
          >
            {unreadCount} new
            <ChevronDown className="h-3.5 w-3.5" />
          </Motion.button>
        ) : null}
      </AnimatePresence>

      {typingText ? (
        <div className="flex items-center gap-2 px-1 text-[11px] font-semibold text-primary">
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
          </span>
          {typingText} typing
        </div>
      ) : null}

      {!isChatAllowed ? (
        <div className="rounded-xl border border-error/20 bg-error/10 p-3 text-center">
          <p className="text-xs font-semibold text-error">Chat is disabled</p>
        </div>
      ) : null}

      <div className="collab-panel rounded-2xl p-2">
        {replyTo ? (
          <div className="mb-2 flex items-start justify-between gap-2 rounded-xl border border-primary/20 bg-primary/10 p-2">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Replying to {replyTo.sender?.name || 'Unknown'}
              </p>
              <p className="mt-0.5 truncate text-xs text-white/60">{replyTo.message}</p>
            </div>
            <button className="collab-icon-button h-7 w-7" onClick={() => setReplyTo(null)} type="button">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}

        <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/10 pb-2">
          <div className="flex gap-1">
            {quickReactions.map((reaction) => (
              <button
                className="grid h-8 min-w-8 place-items-center rounded-lg border border-white/10 bg-white/5 px-2 text-base transition hover:bg-white/10 disabled:opacity-30"
                disabled={!isChatAllowed}
                key={reaction.id}
                onClick={() => {
                  onSendReaction(reaction.id);
                }}
                type="button"
                title={`React with ${reaction.id}`}
              >
                {reaction.label}
              </button>
            ))}
          </div>
          <button
            className="collab-icon-button h-8 w-8"
            disabled={!isChatAllowed}
            onClick={() => setIsEmojiOpen((value) => !value)}
            title="Emoji"
            type="button"
          >
            <Smile className="h-4 w-4" />
          </button>
        </div>

        {isEmojiOpen ? (
          <div className="mb-2 grid grid-cols-8 gap-1 rounded-xl border border-white/10 bg-black/20 p-2">
            {emojiChoices.map((emoji) => (
              <button
                className="grid h-8 place-items-center rounded-lg text-base transition hover:bg-white/10"
                key={emoji}
                onClick={() => setDraft((value) => `${value}${emoji}`)}
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>
        ) : null}

        <form className="flex items-center gap-2" onSubmit={handleSubmit}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
          <input
            data-testid="chat-message-input"
            className="min-w-0 flex-1 bg-transparent px-1 py-2 text-sm text-white outline-none placeholder:text-white/40 disabled:opacity-50"
            disabled={!isChatAllowed}
            onChange={handleDraftChange}
            placeholder={receiverSocketId ? 'Message privately...' : 'Message everyone...'}
            value={draft}
          />
          <button
            data-testid="chat-send-button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-glow transition-all hover:bg-primary/90 active:scale-95 disabled:scale-100 disabled:opacity-30"
            disabled={!isChatAllowed || !draft.trim()}
            type="submit"
          >
            <Send className="h-4 w-4 translate-x-[1px]" />
          </button>
        </form>
      </div>
    </div>
  );
}

export default ChatPanel;
