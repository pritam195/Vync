import mongoose from 'mongoose';

const activityUserSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: '',
      trim: true,
    },
    name: {
      type: String,
      default: 'Guest',
      trim: true,
    },
    socketId: {
      type: String,
      default: '',
      trim: true,
    },
    role: {
      type: String,
      default: '',
      trim: true,
    },
  },
  { _id: false },
);

const activityLogSchema = new mongoose.Schema({
  meetingId: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    index: true,
  },
  user: {
    type: activityUserSchema,
    default: () => ({}),
  },
  action: {
    type: String,
    required: true,
    trim: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

export default ActivityLog;
