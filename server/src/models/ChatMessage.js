import mongoose from 'mongoose';

const chatPersonSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: '',
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    socketId: {
      type: String,
      default: '',
      trim: true,
    },
    role: {
      type: String,
      enum: ['host', 'cohost', 'participant', 'guest'],
      default: 'participant',
    },
  },
  { _id: false },
);

const chatMessageSchema = new mongoose.Schema(
  {
    meetingId: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    sender: {
      type: chatPersonSchema,
      required: true,
    },
    receiver: {
      type: chatPersonSchema,
      default: null,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: ['text', 'file', 'emoji', 'system'],
      default: 'text',
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

export default ChatMessage;
