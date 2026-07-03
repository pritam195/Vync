import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowRight, KeyRound, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { AuthAlert, AuthCard, AuthFooter, AuthHeader } from '../components/auth/AuthPrimitives.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Input } from '../components/ui/Input.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const { forgotPassword } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setFieldError('');

    if (!/\S+@\S+\.\S+/.test(email)) {
      setFieldError('Enter the email connected to your account');
      return;
    }

    setIsSubmitting(true);

    try {
      await forgotPassword(email);
      navigate('/verify-otp', { state: { email } });
    } catch (err) {
      setError(err.response?.data?.message || 'Unable to process request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard>
      <AuthHeader
        eyebrow="Account recovery"
        title="Reset your password"
        description="Enter your account email and we will send a short verification code to continue securely."
        icon={KeyRound}
      />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-3.5 z-10 h-4 w-4 text-muted-foreground" />
          <Input
            label="Email address"
            type="email"
            name="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldError('');
            }}
            error={fieldError}
            className="pl-10" labelClassName="left-10"
            required
          />
        </div>

        <AnimatePresence>
          {error && <AuthAlert>{error}</AuthAlert>}
        </AnimatePresence>

        <Button type="submit" className="w-full rounded-full" size="lg" isLoading={isSubmitting}>
          Send verification code
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <AuthFooter>
        Remember your password?{' '}
        <Link to="/login" className="font-semibold text-primary transition hover:text-primary/80">
          Back to sign in
        </Link>
      </AuthFooter>
    </AuthCard>
  );
}
