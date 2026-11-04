import User from '../models/User.js';
import { cookieOptions, generateToken, sendTokenCookie } from '../utils/generateToken.js';

function sanitizeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export async function register(req, res, next) {
  try {
    const { name, email, password, avatar } = req.body;

    if (!name || !email || !password) {
      res.status(400);
      throw new Error('Name, email, and password are required');
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(409);
      throw new Error('Email is already registered');
    }

    const user = await User.create({ name, email, password, avatar });
    const token = generateToken(user._id);
    sendTokenCookie(res, token);

    res.status(201).json({
      user: sanitizeUser(user),
      token,
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400);
      throw new Error('Email and password are required');
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      res.status(401);
      throw new Error('Invalid email or password');
    }

    const token = generateToken(user._id);
    sendTokenCookie(res, token);

    res.json({
      user: sanitizeUser(user),
      token,
    });
  } catch (error) {
    next(error);
  }
}

export function logout(req, res) {
  res.clearCookie('jwt', cookieOptions());
  res.json({ message: 'Logged out successfully' });
}

export function getMe(req, res) {
  if (!req.user) {
    res.json({ user: null });
    return;
  }

  res.json({
    user: sanitizeUser(req.user),
  });
}

export async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400);
      throw new Error('Email is required');
    }

    const user = await User.findOne({ email });

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOtp = otp;
    user.resetOtpExpire = Date.now() + 10 * 60 * 1000; // 10 minutes

    await user.save();

    // In a real app, send email here.
    console.log(`[Email Mock] Password reset OTP for ${email}: ${otp}`);

    res.json({ message: 'OTP sent to email' });
  } catch (error) {
    next(error);
  }
}

export async function verifyOTP(req, res, next) {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      res.status(400);
      throw new Error('Email and OTP are required');
    }

    const user = await User.findOne({
      email,
      resetOtp: otp,
      resetOtpExpire: { $gt: Date.now() },
    }).select('+resetOtp +resetOtpExpire');

    if (!user) {
      res.status(400);
      throw new Error('Invalid or expired OTP');
    }

    res.json({ message: 'OTP verified successfully' });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(req, res, next) {
  try {
    const { email, otp, password } = req.body;

    if (!email || !otp || !password) {
      res.status(400);
      throw new Error('Email, OTP, and new password are required');
    }

    if (String(password).length < 6) {
      res.status(400);
      throw new Error('Password must be at least 6 characters');
    }

    const user = await User.findOne({
      email,
      resetOtp: otp,
      resetOtpExpire: { $gt: Date.now() },
    }).select('+resetOtp +resetOtpExpire');

    if (!user) {
      res.status(400);
      throw new Error('Invalid or expired OTP');
    }

    user.password = password;
    user.resetOtp = undefined;
    user.resetOtpExpire = undefined;
    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
}
