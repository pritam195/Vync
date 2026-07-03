import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },
    avatar: {
      type: String,
      default: '',
    },
    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },
    resetOtp: {
      type: String,
      select: false,
    },
    resetOtpExpire: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
  },
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) {
    return next();
  }

  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.matchPassword = function matchPassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model('User', userSchema);

export default User;
