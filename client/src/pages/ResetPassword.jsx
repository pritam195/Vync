import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowRight, CheckCircle2, LockKeyhole } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { AuthAlert, AuthCard, AuthHeader, PasswordStrength } from '../components/auth/AuthPrimitives.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState('');

  const location = useLocation();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();

  const email = location.state?.email;
  const otp = location.state?.otp;

  useEffect(() => {
    if (!email || !otp) {
      navigate('/forgot-password');
    }
  }, [email, otp, navigate]);

  const strength = useMemo(() => {
    let score = 0;
    if (password.length > 5) score += 1;
    if (password.length > 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return Math.min(score, 4);
  }, [password]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};

    if (password.length < 6) nextErrors.password = 'Password must be at least 6 characters';
    if (password !== confirmPassword) nextErrors.confirmPassword = 'Passwords do not match';

    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    setError('');
    setIsSubmitting(true);

    try {
      await resetPassword(email, otp, password);
      setIsComplete(true);
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to reset password');
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard>
      <AuthHeader
        eyebrow="Final step"
        title="Set a new password"
        description="Choose a strong password for your Vync account. You will return to sign in when it is saved."
        icon={LockKeyhole}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="New password"
          type="password"
          value={password}
          onChange={(event) => {
            setPassword(event.target.value);
            setFieldErrors((current) => ({ ...current, password: '' }));
          }}
          error={fieldErrors.password}
          required
        />

        {password.length > 0 && (
          <PasswordStrength
            strength={strength}
            labels={['Very weak', 'Weak', 'Fair', 'Good', 'Strong']}
            colors={['bg-error', 'bg-error', 'bg-warning', 'bg-success/80', 'bg-success']}
          />
        )}

        <Input
          label="Confirm password"
          type="password"
          value={confirmPassword}
          onChange={(event) => {
            setConfirmPassword(event.target.value);
            setFieldErrors((current) => ({ ...current, confirmPassword: '' }));
          }}
          error={fieldErrors.confirmPassword}
          required
        />

        <AnimatePresence>
          {error && <AuthAlert>{error}</AuthAlert>}
          {isComplete && <AuthAlert type="success">Password reset. Redirecting to sign in...</AuthAlert>}
        </AnimatePresence>

        <Button type="submit" className="w-full rounded-full" size="lg" isLoading={isSubmitting && !isComplete} disabled={isComplete}>
          {isComplete ? 'Password saved' : 'Reset password'}
          {isComplete ? <CheckCircle2 className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>
    </AuthCard>
  );
}
