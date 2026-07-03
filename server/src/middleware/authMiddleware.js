import jwt from 'jsonwebtoken';
import User from '../models/User.js';

function getToken(req) {
  const bearerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;

  return req.cookies.jwt || bearerToken;
}

export async function optionalAuth(req, res, next) {
  try {
    const token = getToken(req);

    if (!token || !process.env.JWT_SECRET) {
      req.user = null;
      next();
      return;
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId).select('-password');
  } catch {
    req.user = null;
  }

  next();
}

export async function protect(req, res, next) {
  try {
    const token = getToken(req);

    if (!token) {
      res.status(401);
      throw new Error('Not authorized');
    }

    if (!process.env.JWT_SECRET) {
      res.status(500);
      throw new Error('JWT_SECRET is not configured');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.userId).select('-password');

    if (!req.user) {
      res.status(401);
      throw new Error('User no longer exists');
    }

    next();
  } catch (error) {
    if (res.statusCode === 200) {
      res.status(401);
    }
    next(error);
  }
}
