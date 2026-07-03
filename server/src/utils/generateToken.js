import jwt from 'jsonwebtoken';

export function generateToken(userId) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined');
  }

  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

export function cookieOptions() {
  const days = Number(process.env.JWT_COOKIE_EXPIRES_IN || 7);

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: days * 24 * 60 * 60 * 1000,
  };
}

export function sendTokenCookie(res, token) {
  res.cookie('jwt', token, cookieOptions());
}
