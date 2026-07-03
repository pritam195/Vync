import mongoose from 'mongoose';

const attendeeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    guestId: {
      type: String,
      default: '',
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const meetingSchema = new mongoose.Schema(
  {
    meetingId: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: 'Untitled meeting',
    },
    host: {
      type: attendeeSchema,
      required: true,
    },
    participants: {
      type: [attendeeSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['waiting', 'live', 'ended'],
      default: 'waiting',
    },
    isScheduled: {
      type: Boolean,
      default: false,
    },
    scheduledAt: {
      type: Date,
      default: null,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    endedAt: {
      type: Date,
      default: null,
    },
    durationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    notes: {
      type: [
        {
          text: {
            type: String,
            required: true,
            trim: true,
          },
          createdBy: {
            type: attendeeSchema,
            default: null,
          },
          createdAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
      default: [],
    },
    recordingUrl: {
      type: String,
      default: '',
      trim: true,
    },
    settings: {
      waitingRoom: {
        type: Boolean,
        default: false,
      },
      allowChat: {
        type: Boolean,
        default: true,
      },
      allowScreenShare: {
        type: Boolean,
        default: true,
      },
      allowWhiteboard: {
        type: Boolean,
        default: true,
      },
      allowFileShare: {
        type: Boolean,
        default: true,
      },
      allowRecording: {
        type: Boolean,
        default: false,
      },
    },
    codeSnapshot: {
      code: {
        type: String,
        default: '',
      },
      language: {
        type: String,
        default: 'javascript',
      },
      updatedBy: {
        userId: {
          type: String,
          default: '',
        },
        name: {
          type: String,
          default: '',
        },
        socketId: {
          type: String,
          default: '',
        },
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

const Meeting = mongoose.model('Meeting', meetingSchema);

export default Meeting;
