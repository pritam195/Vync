import mongoose from 'mongoose';

const recordedBySchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: '',
    },
    name: {
      type: String,
      default: 'Guest',
      trim: true,
    },
    socketId: {
      type: String,
      default: '',
    },
  },
  { _id: false },
);

const recordingSchema = new mongoose.Schema(
  {
    meetingId: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    recordedBy: {
      type: recordedBySchema,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    fileType: {
      type: String,
      required: true,
      trim: true,
    },
    fileUrl: {
      type: String,
      required: true,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    durationSeconds: {
      type: Number,
      default: 0,
      min: 0,
    },
    storageProvider: {
      type: String,
      enum: ['local', 's3'],
      default: 'local',
    },
    s3Key: {
      type: String,
      default: '',
      trim: true,
    },
    bucket: {
      type: String,
      default: '',
      trim: true,
    },
    publicUrl: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: {
      createdAt: true,
      updatedAt: false,
    },
  },
);

const Recording = mongoose.model('Recording', recordingSchema);

export default Recording;
