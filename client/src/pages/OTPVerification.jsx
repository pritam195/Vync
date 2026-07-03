import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowRight, MailCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { AuthAlert, AuthCard, AuthFooter, AuthHeader } from '../components/auth/AuthPrimitives.jsx';
import { Button } from '../components/ui/Button.jsx';

export default function OTPVerification() {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef([]);
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyOTP } = useAuth();

  const email = location.state?.email;

  useEffect(() => {
    if (!email) {
      navigate('/forgot-password');
    }
  }, [email, navigate]);

  const handleChange = (event, index) => {
    const value = event.target.value.replace(/\D/g, '').slice(-1);
    setError('');

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (event, index) => {
    if (event.key === 'Backspace' && index > 0 && otp[index] === '') {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pastedData = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    if (!pastedData.length) return;

    const newOtp = ['', '', '', '', '', ''];
    pastedData.forEach((char, index) => {
      newOtp[index] = char;
    });
    setOtp(newOtp);
    inputRefs.current[Math.min(pastedData.length - 1, 5)]?.focus();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const otpString = otp.join('');
    if (otpString.length < 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      await verifyOTP(email, otpString);
      navigate('/reset-password', { state: { email, otp: otpString } });
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired OTP');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthCard>
      <AuthHeader
        eyebrow="Verify identity"
        title="Check your email"
        description={
          <>
            Enter the 6-digit code sent to <span className="font-semibold text-foreground">{email}</span>.
          </>
        }
        icon={MailCheck}
      />

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-6 gap-2 sm:gap-3" onPaste={handlePaste}>
          {otp.map((digit, index) => (
            <input
              key={index}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              aria-label={`Digit ${index + 1}`}
              onChange={(event) => handleChange(event, index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(element) => {
                inputRefs.current[index] = element;
              }}
              className="h-14 rounded-2xl border border-input bg-surface/70 text-center text-2xl font-semibold text-foreground shadow-xs outline-none transition-all duration-200 focus:border-ring focus:ring-2 focus:ring-ring/30 sm:h-16"
            />
          ))}
        </div>

        <AnimatePresence>
          {error && <AuthAlert>{error}</AuthAlert>}
        </AnimatePresence>

        <Button type="submit" className="w-full rounded-full" size="lg" isLoading={isSubmitting}>
          Verify code
          <ArrowRight className="h-4 w-4" />
        </Button>
      </form>

      <AuthFooter>
        Didn't receive it?{' '}
        <button onClick={() => navigate('/forgot-password')} className="bg-transparent font-semibold text-primary transition hover:text-primary/80" type="button">
          Send a new code
        </button>
      </AuthFooter>
    </AuthCard>
  );
}
